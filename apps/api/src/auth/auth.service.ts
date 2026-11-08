import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { DatabaseService } from '#/database/database.service'
import {
  emailVerificationTokensTable,
  passwordResetTokensTable,
  refreshTokensTable,
} from '#/auth/auth.schema'
import { EmailService } from '#/email/email.service'
import { env } from '#/config/env'
import { usersTable } from '#/user/user.schema'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_ERRORS,
  BCRYPT_SALT_ROUNDS,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
} from './auth.constants'
import type { ForgotPasswordDto, LoginDto, RegisterDto } from './dto/auth.dto'

/** A freshly minted access token + refresh token pair for one session. */
export interface SessionTokens {
  accessToken: string
  refreshToken: string
}

/**
 * Arbitrary, app-wide key for the Postgres advisory lock that serialises
 * sign-ups, so two concurrent registrations can't both see an empty `users`
 * table and create a second account.
 */
const REGISTRATION_LOCK_KEY = 4_242_001

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
  ) {}

  /**
   * Finances is single-user: public registration is only open until the first
   * account exists. Afterwards `register` is rejected with 403.
   */
  async isRegistrationOpen(): Promise<boolean> {
    const [existing] = await this.db.db
      .select({ id: usersTable.id })
      .from(usersTable)
      .limit(1)
    return !existing
  }

  async register(dto: RegisterDto): Promise<SessionTokens> {
    // Cheap pre-check so a closed instance doesn't spend a bcrypt round.
    if (!(await this.isRegistrationOpen())) {
      throw new ForbiddenException(AUTH_ERRORS.REGISTRATION_CLOSED)
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS)
    const user = await this.db.db.transaction(async (tx) => {
      // Serialise concurrent sign-ups, then re-check under the lock.
      await tx.execute(
        sql`select pg_advisory_xact_lock(${REGISTRATION_LOCK_KEY})`,
      )
      const [existing] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .limit(1)
      if (existing)
        throw new ForbiddenException(AUTH_ERRORS.REGISTRATION_CLOSED)

      const [created] = await tx
        .insert(usersTable)
        .values({
          email: dto.email,
          name: dto.name,
          passwordHash,
          // Without SMTP the address can never be verified by email: the
          // single owner is trusted from the start (see verifiedWithoutSmtp).
          emailVerifiedAt: env.smtpEnabled ? null : new Date(),
        })
        .returning()
      return created
    })

    if (env.smtpEnabled) await this.sendVerificationEmail(user.id, user.email)
    return this.createSession(user.id)
  }

  private async sendVerificationEmail(
    userId: string,
    email: string,
  ): Promise<void> {
    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS)

    await this.db.db.insert(emailVerificationTokensTable).values({
      userId,
      tokenHash,
      expiresAt,
    })

    const verifyUrl = `${env.APP_URL}/verify-email?token=${token}`
    await this.email.sendEmailVerification(email, verifyUrl)
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const [record] = await this.db.db
      .select()
      .from(emailVerificationTokensTable)
      .where(
        and(
          eq(emailVerificationTokensTable.tokenHash, tokenHash),
          isNull(emailVerificationTokensTable.usedAt),
        ),
      )

    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException(AUTH_ERRORS.INVALID_VERIFICATION_LINK)
    }

    const now = new Date()
    await this.db.db
      .update(usersTable)
      .set({ emailVerifiedAt: now })
      .where(eq(usersTable.id, record.userId))
    await this.db.db
      .update(emailVerificationTokensTable)
      .set({ usedAt: now })
      .where(eq(emailVerificationTokensTable.id, record.id))
  }

  async resendVerification(userId: string): Promise<void> {
    const [user] = await this.db.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))

    if (!user) throw new UnauthorizedException(AUTH_ERRORS.USER_NOT_FOUND)
    if (user.emailVerifiedAt) {
      throw new BadRequestException(AUTH_ERRORS.EMAIL_ALREADY_VERIFIED)
    }

    await this.sendVerificationEmail(user.id, user.email)
  }

  async login(dto: LoginDto): Promise<SessionTokens> {
    const [user] = await this.db.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, dto.email))
    if (!user?.passwordHash) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS)
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS)

    return this.createSession(user.id)
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  private signAccessToken(userId: string): string {
    return this.jwt.sign(
      { sub: userId },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    )
  }

  /**
   * Persists a new refresh token in the given family and returns the token pair.
   * The token itself is random and returned to the caller; only its hash is
   * stored, so a database leak cannot be replayed.
   */
  private async issueRefreshToken(
    userId: string,
    familyId: string,
  ): Promise<SessionTokens> {
    const refreshToken = crypto.randomBytes(32).toString('hex')
    await this.db.db.insert(refreshTokensTable).values({
      userId,
      familyId,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    })
    return { accessToken: this.signAccessToken(userId), refreshToken }
  }

  /** Starts a brand-new session (fresh family) after a successful auth. */
  createSession(userId: string): Promise<SessionTokens> {
    return this.issueRefreshToken(userId, crypto.randomUUID())
  }

  /**
   * Rotates a refresh token: validates it, revokes it, and issues a new token in
   * the same family. Presenting an already-revoked (or unknown/expired) token is
   * treated as reuse — the entire family is revoked so a stolen token cannot be
   * traded for a fresh session.
   */
  async rotateRefreshToken(token: string): Promise<SessionTokens> {
    const tokenHash = this.hashToken(token)
    const [record] = await this.db.db
      .select()
      .from(refreshTokensTable)
      .where(eq(refreshTokensTable.tokenHash, tokenHash))

    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN)
    }

    // Reuse of an already-rotated/revoked token ⇒ likely theft: burn the family.
    if (record.revokedAt) {
      await this.revokeFamily(record.familyId)
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN)
    }

    await this.db.db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokensTable.id, record.id))

    return this.issueRefreshToken(record.userId, record.familyId)
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.db.db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokensTable.familyId, familyId),
          isNull(refreshTokensTable.revokedAt),
        ),
      )
  }

  /** Logout: revoke the session behind the presented refresh token, if any. */
  async revokeSession(token: string | undefined): Promise<void> {
    if (!token) return
    const [record] = await this.db.db
      .select({ familyId: refreshTokensTable.familyId })
      .from(refreshTokensTable)
      .where(eq(refreshTokensTable.tokenHash, this.hashToken(token)))
    if (record) await this.revokeFamily(record.familyId)
  }

  async getUser(userId: string) {
    const [user] = await this.db.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
    return user ? this.verifiedWithoutSmtp(user) : user
  }

  /**
   * Single-user instance without SMTP (production without `SMTP_HOST`): no
   * verification email can ever arrive, so an owner created before SMTP was
   * turned off, or before this rule existed, is marked verified the next time
   * the session loads. Idempotent: only rows still unverified are updated.
   */
  private async verifiedWithoutSmtp<
    T extends { id: string; emailVerifiedAt: Date | null },
  >(user: T): Promise<T> {
    if (env.smtpEnabled || user.emailVerifiedAt) return user
    const emailVerifiedAt = new Date()
    await this.db.db
      .update(usersTable)
      .set({ emailVerifiedAt })
      .where(
        and(eq(usersTable.id, user.id), isNull(usersTable.emailVerifiedAt)),
      )
    return { ...user, emailVerifiedAt }
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const [user] = await this.db.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, dto.email))

    if (!user || !user.passwordHash) return

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS)

    await this.db.db.insert(passwordResetTokensTable).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    })

    const resetUrl = `${env.APP_URL}/reset-password?token=${token}`
    await this.email.sendPasswordReset(user.email, resetUrl)
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const [record] = await this.db.db
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          isNull(passwordResetTokensTable.usedAt),
        ),
      )

    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException(AUTH_ERRORS.INVALID_RESET_TOKEN)
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS)
    const now = new Date()
    await this.db.db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, record.userId))
    await this.db.db
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(eq(passwordResetTokensTable.id, record.id))
  }
}
