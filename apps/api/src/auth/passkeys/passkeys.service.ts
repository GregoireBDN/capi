import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { and, asc, count, eq, lt } from 'drizzle-orm'
import { AUTH_ERRORS, FRESH_AUTH_MAX_AGE_SECONDS } from '#/auth/auth.constants'
import type { RequestUser } from '#/auth/request-user'
import { env } from '#/config/env'
import { DatabaseService } from '#/database/database.service'
import { usersTable } from '#/user/user.schema'
import {
  DEFAULT_PASSKEY_NAME,
  MAX_PASSKEYS,
  PASSKEY_ERRORS,
  WEBAUTHN_CEREMONY_TIMEOUT_MS,
  WEBAUTHN_CHALLENGE_TTL_MS,
  WEBAUTHN_RP_NAME,
} from './passkeys.constants'
import {
  type WebauthnChallengePurpose,
  type WebauthnCredential,
  webauthnChallengesTable,
  webauthnCredentialsTable,
} from './passkeys.schema'

/** What the profile shows of a passkey: never its credential id or public key. */
export interface PasskeyView {
  id: string
  name: string
  deviceType: string
  backedUp: boolean
  createdAt: string
  lastUsedAt: string | null
}

export interface RelyingParty {
  rpId: string
  origin: string
}

/** WebAuthn user handle: the user id's UTF-8 bytes. */
const userHandleBytes = (userId: string) =>
  new Uint8Array(Buffer.from(userId, 'utf8'))

/**
 * The challenge a browser response answers, read from its client data. Any
 * malformed input yields null (the caller refuses it as an invalid challenge).
 */
export function readChallenge(response: unknown): string | null {
  try {
    const clientDataJSON = (
      response as { response?: { clientDataJSON?: unknown } }
    ).response?.clientDataJSON
    if (typeof clientDataJSON !== 'string') return null
    const clientData = JSON.parse(
      Buffer.from(clientDataJSON, 'base64url').toString('utf8'),
    ) as { challenge?: unknown }
    return typeof clientData.challenge === 'string' &&
      clientData.challenge.length > 0 &&
      clientData.challenge.length <= 255
      ? clientData.challenge
      : null
  } catch {
    return null
  }
}

function toView(row: WebauthnCredential): PasskeyView {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  }
}

/**
 * Passkeys (WebAuthn) for the single owner: registration from the profile
 * (fresh session only), sign-in with a discoverable credential, list, rename
 * and revoke. Challenges are stored server-side, single use, short-lived.
 *
 * Library errors are never logged nor passed through: they can quote the
 * challenge or the credential. Callers get a fixed message.
 */
@Injectable()
export class PasskeysService {
  constructor(private readonly db: DatabaseService) {}

  /** Relying party id and expected origin, from `WEBAUTHN_*` or `APP_URL`. */
  private relyingParty(): RelyingParty {
    return env.webauthn
  }

  /** 403 unless the user signed in (password or passkey) a few minutes ago. */
  assertFreshSession(user: RequestUser, now = new Date()): void {
    const nowSeconds = Math.floor(now.getTime() / 1000)
    const fresh =
      user.authTime !== undefined &&
      user.authTime <= nowSeconds + 60 &&
      nowSeconds - user.authTime <= FRESH_AUTH_MAX_AGE_SECONDS
    if (!fresh)
      throw new ForbiddenException(AUTH_ERRORS.REAUTHENTICATION_REQUIRED)
  }

  private async storeChallenge(
    purpose: WebauthnChallengePurpose,
    challenge: string,
    userId: string | null,
    now: Date,
  ): Promise<void> {
    // Keeps the table small: expired challenges can never be used anyway.
    await this.db.db
      .delete(webauthnChallengesTable)
      .where(lt(webauthnChallengesTable.expiresAt, now))
    await this.db.db.insert(webauthnChallengesTable).values({
      purpose,
      challenge,
      userId,
      expiresAt: new Date(now.getTime() + WEBAUTHN_CHALLENGE_TTL_MS),
    })
  }

  /**
   * Deletes the challenge the response answers and returns it when it was
   * issued for this purpose (and user) and has not expired. Deleting first
   * makes it single use, even when the verification then fails.
   */
  private async consumeChallenge(
    response: unknown,
    purpose: WebauthnChallengePurpose,
    userId: string | null,
    now: Date,
  ): Promise<string> {
    const challenge = readChallenge(response)
    if (!challenge)
      throw new UnauthorizedException(PASSKEY_ERRORS.INVALID_CHALLENGE)
    const [row] = await this.db.db
      .delete(webauthnChallengesTable)
      .where(
        and(
          eq(webauthnChallengesTable.challenge, challenge),
          eq(webauthnChallengesTable.purpose, purpose),
        ),
      )
      .returning()
    if (!row || row.expiresAt <= now || (userId && row.userId !== userId)) {
      throw new UnauthorizedException(PASSKEY_ERRORS.INVALID_CHALLENGE)
    }
    return row.challenge
  }

  async registrationOptions(
    user: RequestUser,
    now = new Date(),
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    this.assertFreshSession(user, now)
    const [owner] = await this.db.db
      .select({ email: usersTable.email, name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, user.sub))
    if (!owner) throw new UnauthorizedException(AUTH_ERRORS.USER_NOT_FOUND)

    const existing = await this.db.db
      .select({
        credentialId: webauthnCredentialsTable.credentialId,
        transports: webauthnCredentialsTable.transports,
      })
      .from(webauthnCredentialsTable)
      .where(eq(webauthnCredentialsTable.userId, user.sub))
    if (existing.length >= MAX_PASSKEYS) {
      throw new BadRequestException(PASSKEY_ERRORS.TOO_MANY)
    }

    const { rpId } = this.relyingParty()
    const options = await generateRegistrationOptions({
      rpName: WEBAUTHN_RP_NAME,
      rpID: rpId,
      userName: owner.email,
      userDisplayName: owner.name,
      userID: userHandleBytes(user.sub),
      timeout: WEBAUTHN_CEREMONY_TIMEOUT_MS,
      attestationType: 'none',
      // The same authenticator can't be registered twice.
      excludeCredentials: existing.map((row) => ({
        id: row.credentialId,
        transports: row.transports,
      })),
      // Discoverable (sign-in without typing the email), with Face ID / Touch ID.
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    })
    await this.storeChallenge('registration', options.challenge, user.sub, now)
    return options
  }

  async register(
    user: RequestUser,
    response: RegistrationResponseJSON,
    name: string | undefined,
    now = new Date(),
  ): Promise<PasskeyView> {
    this.assertFreshSession(user, now)
    const expectedChallenge = await this.consumeChallenge(
      response,
      'registration',
      user.sub,
      now,
    )
    const { rpId, origin } = this.relyingParty()
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        requireUserVerification: true,
      })
    } catch {
      throw new BadRequestException(PASSKEY_ERRORS.REGISTRATION_FAILED)
    }
    if (!verification.verified) {
      throw new BadRequestException(PASSKEY_ERRORS.REGISTRATION_FAILED)
    }

    const [{ total }] = await this.db.db
      .select({ total: count() })
      .from(webauthnCredentialsTable)
      .where(eq(webauthnCredentialsTable.userId, user.sub))
    if (total >= MAX_PASSKEYS)
      throw new BadRequestException(PASSKEY_ERRORS.TOO_MANY)

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo
    const [row] = await this.db.db
      .insert(webauthnCredentialsTable)
      .values({
        userId: user.sub,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports ?? response.response.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        name: name?.trim() || DEFAULT_PASSKEY_NAME,
      })
      .onConflictDoNothing({ target: webauthnCredentialsTable.credentialId })
      .returning()
    if (!row) throw new BadRequestException(PASSKEY_ERRORS.ALREADY_REGISTERED)
    return toView(row)
  }

  /** Public: options for a discoverable-credential sign-in (no email needed). */
  async authenticationOptions(
    now = new Date(),
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const options = await generateAuthenticationOptions({
      rpID: this.relyingParty().rpId,
      userVerification: 'required',
      timeout: WEBAUTHN_CEREMONY_TIMEOUT_MS,
    })
    await this.storeChallenge('authentication', options.challenge, null, now)
    return options
  }

  /**
   * Verifies a sign-in response and returns the user it signs in. A revoked
   * passkey is deleted, so it is unknown here; any failure is the same 401.
   */
  async authenticate(
    response: AuthenticationResponseJSON,
    now = new Date(),
  ): Promise<string> {
    const expectedChallenge = await this.consumeChallenge(
      response,
      'authentication',
      null,
      now,
    )
    const fail = () =>
      new UnauthorizedException(PASSKEY_ERRORS.AUTHENTICATION_FAILED)
    if (typeof response.id !== 'string' || response.id.length > 1024)
      throw fail()

    const [stored] = await this.db.db
      .select()
      .from(webauthnCredentialsTable)
      .where(eq(webauthnCredentialsTable.credentialId, response.id))
    if (!stored) throw fail()
    const userHandle = response.response?.userHandle
    if (
      userHandle &&
      userHandle !==
        Buffer.from(userHandleBytes(stored.userId)).toString('base64url')
    ) {
      throw fail()
    }

    const { rpId, origin } = this.relyingParty()
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: origin,
        expectedRPID: rpId,
        requireUserVerification: true,
        credential: {
          id: stored.credentialId,
          publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64url')),
          counter: stored.counter,
          transports: stored.transports,
        },
      })
    } catch {
      throw fail()
    }
    if (!verification.verified) throw fail()

    await this.db.db
      .update(webauthnCredentialsTable)
      .set({
        counter: verification.authenticationInfo.newCounter,
        backedUp: verification.authenticationInfo.credentialBackedUp,
        lastUsedAt: now,
      })
      .where(eq(webauthnCredentialsTable.id, stored.id))
    return stored.userId
  }

  async list(userId: string): Promise<PasskeyView[]> {
    const rows = await this.db.db
      .select()
      .from(webauthnCredentialsTable)
      .where(eq(webauthnCredentialsTable.userId, userId))
      .orderBy(asc(webauthnCredentialsTable.createdAt))
    return rows.map(toView)
  }

  async rename(userId: string, id: string, name: string): Promise<PasskeyView> {
    const [row] = await this.db.db
      .update(webauthnCredentialsTable)
      .set({ name: name.trim() || DEFAULT_PASSKEY_NAME })
      .where(
        and(
          eq(webauthnCredentialsTable.id, id),
          eq(webauthnCredentialsTable.userId, userId),
        ),
      )
      .returning()
    if (!row) throw new NotFoundException(PASSKEY_ERRORS.NOT_FOUND)
    return toView(row)
  }

  /** Revokes a passkey: the row is deleted, so it can never sign in again. */
  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.db.db
      .delete(webauthnCredentialsTable)
      .where(
        and(
          eq(webauthnCredentialsTable.id, id),
          eq(webauthnCredentialsTable.userId, userId),
        ),
      )
      .returning({ id: webauthnCredentialsTable.id })
    if (deleted.length === 0)
      throw new NotFoundException(PASSKEY_ERRORS.NOT_FOUND)
  }
}
