/**
 * OAuth 2.1 authorization server for remote MCP access (#78, ADR 0003).
 * Every secret is 32 random bytes in base64url behind a recognisable prefix,
 * stored as a SHA-256 hash, never logged.
 */
export const OAUTH_ACCESS_TOKEN_PREFIX = 'fin_oat_'
export const OAUTH_REFRESH_TOKEN_PREFIX = 'fin_ort_'
export const OAUTH_CODE_PREFIX = 'fin_oac_'
export const OAUTH_CLIENT_ID_PREFIX = 'fin_cli_'
export const OAUTH_RANDOM_BYTES = 32

export const OAUTH_ACCESS_TOKEN_PATTERN = /^fin_oat_[A-Za-z0-9_-]{43}$/
export const OAUTH_REFRESH_TOKEN_PATTERN = /^fin_ort_[A-Za-z0-9_-]{43}$/
export const OAUTH_CODE_PATTERN = /^fin_oac_[A-Za-z0-9_-]{43}$/
/** A S256 code challenge is the base64url SHA-256 of the verifier: 43 characters. */
export const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/
/** RFC 7636 §4.1: 43 to 128 unreserved characters. */
export const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/

/** Authorization codes: single use, 2 minutes. */
export const OAUTH_CODE_TTL_MS = 2 * 60 * 1000
/** Short-lived access tokens (15 minutes), like the session's access JWT. */
export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 15 * 60
/** Refresh tokens, rotated on every use. */
export const OAUTH_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** A grant (one connection) lives at most this long, like a session family. */
export const OAUTH_GRANT_MAX_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000
/**
 * A refresh token rotated less than this long ago and presented again is
 * refused without revoking the grant (two refreshes racing from the client);
 * later, it is reuse and the whole grant is revoked.
 */
export const OAUTH_REFRESH_REUSE_GRACE_MS = 10_000

/** Registered clients kept; registration evicts the oldest never-connected ones. */
export const MAX_OAUTH_CLIENTS = 50
export const OAUTH_CLIENT_NAME_MAX_LENGTH = 100
export const OAUTH_DEFAULT_CLIENT_NAME = 'Client MCP'
export const OAUTH_STATE_MAX_LENGTH = 1024

/** `lastUsedAt` of a grant is only rewritten when older than this. */
export const OAUTH_LAST_USED_RESOLUTION_MS = 60_000
export const OAUTH_AUDIT_RETENTION_DAYS = 90
/** Pruning (audit rows, expired codes and tokens) runs at most this often. */
export const OAUTH_PRUNE_INTERVAL_MS = 60 * 60 * 1000

export const OAUTH_ERRORS = {
  UNKNOWN_CLIENT: 'Unknown client',
  INVALID_REDIRECT_URI: 'Invalid redirect URI',
  UNSUPPORTED_RESPONSE_TYPE: 'Unsupported response type',
  INVALID_PKCE: 'PKCE with S256 is required',
  INVALID_SCOPE: 'Invalid scope',
  INVALID_TARGET: 'Invalid resource',
  INVALID_STATE: 'Invalid state',
  GRANT_NOT_FOUND: 'Connection not found',
  NOT_AN_OAUTH_TOKEN: 'Only an OAuth access token can call this endpoint',
} as const
