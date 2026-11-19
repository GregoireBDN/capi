export const BCRYPT_SALT_ROUNDS = 10
/** New passwords (sign-up, reset, change): ASVS 2.1.1. Older ones keep working. */
export const PASSWORD_MIN_LENGTH = 12
/** bcrypt reads only the first 72 bytes: longer passwords are refused. */
export const PASSWORD_MAX_BYTES = 72
/** Short-lived access token (JWT) — 15 minutes. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 15
/** Long-lived rotating refresh token — 30 days. */
export const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
export const REFRESH_TOKEN_TTL_MS = REFRESH_TOKEN_TTL_SECONDS * 1000
/**
 * Absolute session lifetime (ASVS 3.3.2): a refresh-token family can be
 * renewed for at most 90 days after its password or passkey sign-in, however
 * often it is used. Then the owner signs in again.
 */
export const SESSION_MAX_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000
/**
 * A refresh token rotated less than this long ago and presented again, while
 * none of its successors has been used, gets a new successor instead of
 * burning the family (#292): the response carrying the rotated cookies was
 * lost (network drop, iOS suspending the app mid-request, the web server
 * restarting) and the browser still holds the previous token. The unused
 * successor is dropped as soon as one of them is renewed, and presenting a
 * token after the grace, or once a successor was used, is still reuse.
 */
export const SESSION_REFRESH_REUSE_GRACE_MS = 60_000
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000
/**
 * A session counts as fresh for this long after a password or passkey sign-in
 * (`auth_time` claim). Adding or revoking a passkey, creating an access token
 * and deleting the account need a fresh session (`FreshAuthGuard`).
 */
export const FRESH_AUTH_MAX_AGE_SECONDS = 5 * 60

export const AUTH_ERRORS = {
  REGISTRATION_CLOSED: 'Registration is closed',
  INVALID_CREDENTIALS: 'Invalid credentials',
  INVALID_VERIFICATION_LINK: 'Invalid or expired link',
  USER_NOT_FOUND: 'User not found',
  EMAIL_ALREADY_VERIFIED: 'Email already verified',
  INVALID_RESET_TOKEN: 'Invalid or expired token',
  INVALID_REFRESH_TOKEN: 'Invalid or expired session',
  REAUTHENTICATION_REQUIRED: 'Recent authentication required',
  WRONG_CURRENT_PASSWORD: 'Current password is incorrect',
  SAME_PASSWORD: 'New password must differ from the current one',
} as const
