/** Display name of the relying party, shown by the browser's passkey sheet. */
export const WEBAUTHN_RP_NAME = 'Finances'

/** A challenge must be answered within this delay, and only once. */
export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000
/** Ceremony timeout given to the browser (below the challenge TTL). */
export const WEBAUTHN_CEREMONY_TIMEOUT_MS = 2 * 60 * 1000

export const MAX_PASSKEYS = 20
export const PASSKEY_NAME_MAX_LENGTH = 100
export const DEFAULT_PASSKEY_NAME = 'Passkey'

export const PASSKEY_ERRORS = {
  /** Unknown, expired or already used challenge. */
  INVALID_CHALLENGE: 'Invalid or expired passkey challenge',
  /** Unknown or revoked credential, bad signature, origin or RP id. */
  AUTHENTICATION_FAILED: 'Passkey sign-in failed',
  REGISTRATION_FAILED: 'Passkey registration failed',
  ALREADY_REGISTERED: 'This passkey is already registered',
  TOO_MANY: `At most ${MAX_PASSKEYS} passkeys`,
  NOT_FOUND: 'Passkey not found',
} as const
