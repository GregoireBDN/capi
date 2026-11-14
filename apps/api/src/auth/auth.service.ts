import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'node:crypto'
import { and, eq, isNull, ne, sql } from 'drizzle-orm'
import { personalAccessTokensTable } from '#/auth/access-tokens/access-tokens.schema'
import { DatabaseService } from '#/database/database.service'
import {
  emailVerificationTokensTable,
  passwordResetTokensTable,
  refreshTokensTable,
} from '#/auth/auth.schema'
import { EmailService } from '#/email/email.service'
import { env } from '#/config/env'
import { publicUserColumns, usersTable } from '#/user/user.schema'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_ERRORS,
  BCRYPT_SALT_ROUNDS,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
  SESSION_MAX_LIFETIME_MS,
} from './auth.constants'
import type {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
} from './dto/auth.dto'

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

/**
 * Compared against when the email is unknown, so a failed sign-in takes as
 * long whether or not the address is the owner's. Hashed once, lazily.
 */
let dummyPasswordHash: Promise<string> | undefined
const dummyHash = () =>
  (dummyPasswordHash ??= bcrypt.hash(
    crypto.randomBytes(16).toString('hex'),
    BCRYPT_SALT_ROUNDS,
  ))

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
      // Same bcrypt cost as a wrong password: no hint the address is unknown.
      await bcrypt.compare(dto.password, await dummyHash())
      throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS)
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!valid) throw new UnauthorizedException(AUTH_ERRORS.INVALID_CREDENTIALS)

    return this.createSession(user.id)
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  /**
   * `auth_time` (seconds) is when the user last signed in with a password or a
   * passkey; routes that need a fresh session read it (see `JwtGuard`).
   */
  private signAccessToken(
    userId: string,
    authenticatedAt: Date | null,
  ): string {
    const payload = authenticatedAt
      ? {
          sub: userId,
          auth_time: Math.floor(authenticatedAt.getTime() / 1000),
        }
      : { sub: userId }
    return this.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL_SECONDS })
  }

  /**
   * Persists a new refresh token in the given family and returns the token pair.
   * The token itself is random and returned to the caller; only its hash is
   * stored, so a database leak cannot be replayed. It expires after
   * `REFRESH_TOKEN_TTL_MS`, or at the family's absolute end when sooner.
   */
  private async issueRefreshToken(
    userId: string,
    familyId: string,
    authenticatedAt: Date | null,
    sessionEndsAt: Date | null = null,
  ): Promise<SessionTokens> {
    const refreshToken = crypto.randomBytes(32).toString('hex')
    const ttlEnd = Date.now() + REFRESH_TOKEN_TTL_MS
    await this.db.db.insert(refreshTokensTable).values({
      userId,
      familyId,
      tokenHash: this.hashToken(refreshToken),
      expiresAt: new Date(
        sessionEndsAt ? Math.min(ttlEnd, sessionEndsAt.getTime()) : ttlEnd,
      ),
      authenticatedAt,
    })
    return {
      accessToken: this.signAccessToken(userId, authenticatedAt),
      refreshToken,
    }
  }

  /**
   * Starts a brand-new session (fresh family) after a successful auth, password
   * or passkey alike: same cookies, rotation and reuse detection.
   */
  createSession(userId: string): Promise<SessionTokens> {
    return this.issueRefreshToken(userId, crypto.randomUUID(), new Date())
  }

  /**
   * Rotates a refresh token: validates it, revokes it, and issues a new token in
   * the same family. Presenting an already-revoked token is treated as reuse —
   * the entire family is revoked so a stolen token cannot be traded for a
   * fresh session. The revocation is conditional (`revoked_at IS NULL`), so of
   * two rotations racing with the same token only one can win; the other is
   * reuse. A family past `SESSION_MAX_LIFETIME_MS` since its sign-in is ended.
   */
  async rotateRefreshToken(
    token: string,
    now = new Date(),
  ): Promise<SessionTokens> {
    const invalid = () =>
      new UnauthorizedException(AUTH_ERRORS.INVALID_REFRESH_TOKEN)
    const tokenHash = this.hashToken(token)
    const [record] = await this.db.db
      .select()
      .from(refreshTokensTable)
      .where(eq(refreshTokensTable.tokenHash, tokenHash))

    if (!record || record.expiresAt < now) throw invalid()

    // Reuse of an already-rotated/revoked token ⇒ likely theft: burn the family.
    if (record.revokedAt) {
      await this.revokeFamily(record.familyId)
      throw invalid()
    }

    const sessionEndsAt = await this.sessionEnd(record)
    if (sessionEndsAt && sessionEndsAt <= now) {
      await this.revokeFamily(record.familyId)
      throw invalid()
    }

    // Atomic check-and-revoke: a concurrent rotation that got here first has
    // already revoked the row, and this one is then reuse.
    const revoked = await this.db.db
      .update(refreshTokensTable)
      .set({ revokedAt: now })
      .where(
        and(
          eq(refreshTokensTable.id, record.id),
          isNull(refreshTokensTable.revokedAt),
        ),
      )
      .returning({ id: refreshTokensTable.id })
    if (revoked.length === 0) {
      await this.revokeFamily(record.familyId)
      throw invalid()
    }

    // Renewing the access token is not a new sign-in: keep the family's time.
    return this.issueRefreshToken(
      record.userId,
      record.familyId,
      record.authenticatedAt,
      sessionEndsAt,
    )
  }

  /**
   * When the family can no longer be renewed: its sign-in time plus the
   * absolute lifetime. Families from before `authenticated_at` count from
   * their first token. Null when neither is known.
   */
  private async sessionEnd(record: {
    familyId: string
    authenticatedAt: Date | null
  }): Promise<Date | null> {
    let start = record.authenticatedAt
    if (!start) {
      const [family] = await this.db.db
        .select({
          startedAt: sql<Date>`min(${refreshTokensTable.createdAt})`.mapWith(
            refreshTokensTable.createdAt,
          ),
        })
        .from(refreshTokensTable)
        .where(eq(refreshTokensTable.familyId, record.familyId))
      start = family?.startedAt instanceof Date ? family.startedAt : null
    }
    return start ? new Date(start.getTime() + SESSION_MAX_LIFETIME_MS) : null
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
    // Never the password hash: this row is returned by `GET /api/auth/me`.
    const [user] = await this.db.db
      .select(publicUserColumns)
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

    // Only the latest link works: earlier unused ones are spent.
    await this.spendResetTokens(user.id, new Date())

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

  /**
   * Sets a new password from an emailed link. Every session (refresh-token
   * family) is ended: a reset after a compromise must lock the attacker out.
   * Access tokens too when asked. All pending links are spent.
   */
  async resetPassword(
    token: string,
    password: string,
    { revokeAccessTokens = false }: { revokeAccessTokens?: boolean } = {},
  ): Promise<void> {
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
    // Spend the link first: a concurrent use of the same link loses.
    const [spent] = await this.db.db
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokensTable.id, record.id),
          isNull(passwordResetTokensTable.usedAt),
        ),
      )
      .returning({ id: passwordResetTokensTable.id })
    if (!spent) throw new BadRequestException(AUTH_ERRORS.INVALID_RESET_TOKEN)

    await this.db.db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, record.userId))
    await this.endSessionsAfterPasswordChange(record.userId, now, {
      keepFamilyId: null,
      revokeAccessTokens,
    })
  }

  /**
   * Changes the password of the signed-in owner (fresh session required by
   * the route). The current password must match. Every other session is
   * ended; the one making the change (its refresh token) stays signed in.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    currentRefreshToken: string | undefined,
  ): Promise<void> {
    const [user] = await this.db.db
      .select({ passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
    if (!user) throw new UnauthorizedException(AUTH_ERRORS.USER_NOT_FOUND)

    const valid =
      !!user.passwordHash &&
      (await bcrypt.compare(dto.currentPassword, user.passwordHash))
    if (!valid) {
      throw new BadRequestException(AUTH_ERRORS.WRONG_CURRENT_PASSWORD)
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(AUTH_ERRORS.SAME_PASSWORD)
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS)
    const now = new Date()
    await this.db.db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, userId))
    await this.endSessionsAfterPasswordChange(userId, now, {
      keepFamilyId: await this.liveFamilyOf(userId, currentRefreshToken),
      revokeAccessTokens: dto.revokeAccessTokens ?? false,
    })
  }

  /** The family of a refresh token still usable by this user, if any. */
  private async liveFamilyOf(
    userId: string,
    token: string | undefined,
  ): Promise<string | null> {
    if (!token) return null
    const [record] = await this.db.db
      .select({ familyId: refreshTokensTable.familyId })
      .from(refreshTokensTable)
      .where(
        and(
          eq(refreshTokensTable.tokenHash, this.hashToken(token)),
          eq(refreshTokensTable.userId, userId),
          isNull(refreshTokensTable.revokedAt),
        ),
      )
    return record?.familyId ?? null
  }

  /**
   * After a reset or a change: revokes every refresh-token family of the
   * user but `keepFamilyId`, spends pending reset links and, when asked,
   * revokes the personal access tokens. Access JWTs already issued stay valid
   * until they expire (15 minutes, stateless).
   */
  private async endSessionsAfterPasswordChange(
    userId: string,
    now: Date,
    {
      keepFamilyId,
      revokeAccessTokens,
    }: { keepFamilyId: string | null; revokeAccessTokens: boolean },
  ): Promise<void> {
    await this.db.db
      .update(refreshTokensTable)
      .set({ revokedAt: now })
      .where(
        and(
          eq(refreshTokensTable.userId, userId),
          isNull(refreshTokensTable.revokedAt),
          keepFamilyId
            ? ne(refreshTokensTable.familyId, keepFamilyId)
            : undefined,
        ),
      )
    await this.spendResetTokens(userId, now)
    if (revokeAccessTokens) {
      await this.db.db
        .update(personalAccessTokensTable)
        .set({ revokedAt: now })
        .where(
          and(
            eq(personalAccessTokensTable.userId, userId),
            isNull(personalAccessTokensTable.revokedAt),
          ),
        )
    }
  }

  /** Marks every unused reset link of the user as used. */
  private async spendResetTokens(userId: string, now: Date): Promise<void> {
    await this.db.db
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokensTable.userId, userId),
          isNull(passwordResetTokensTable.usedAt),
        ),
      )
  }
}
