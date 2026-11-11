/** Every token starts with this, so a leaked one is easy to recognise and grep for. */
export const ACCESS_TOKEN_PREFIX = 'fin_pat_'
/** 32 random bytes, base64url: 43 characters after the prefix. */
export const ACCESS_TOKEN_RANDOM_BYTES = 32
export const ACCESS_TOKEN_PATTERN = /^fin_pat_[A-Za-z0-9_-]{43}$/
/** Characters kept in clear (`fin_pat_` + 4) to recognise a token in the list. */
export const ACCESS_TOKEN_DISPLAY_LENGTH = 12

export const MAX_ACTIVE_ACCESS_TOKENS = 20
export const MAX_ACCESS_TOKEN_TTL_DAYS = 365

/** `lastUsedAt` is only rewritten when older than this, to avoid a write per call. */
export const LAST_USED_RESOLUTION_MS = 60_000

export const ACCESS_TOKEN_AUDIT_RETENTION_DAYS = 90
/** Pruning of old audit rows runs at most this often per API process. */
export const ACCESS_TOKEN_AUDIT_PRUNE_INTERVAL_MS = 60 * 60 * 1000

export const ACCESS_TOKEN_ERRORS = {
  INVALID: 'Invalid or expired access token',
  NOT_ALLOWED: 'This endpoint is not available with an access token',
  INSUFFICIENT_SCOPE: 'This access token does not have the write scope',
  TOO_MANY: `At most ${MAX_ACTIVE_ACCESS_TOKENS} active access tokens`,
  NOT_FOUND: 'Access token not found',
} as const
