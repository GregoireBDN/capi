/**
 * Rate limiting configuration shared by the global ThrottlerModule
 * (app.module.ts) and the per-route @Throttle() overrides (auth.controller.ts).
 */

/** Sliding window applied to every throttler, in milliseconds (1 minute). */
export const THROTTLE_TTL = 60_000

/** Max requests per THROTTLE_TTL window, per IP. */
export const THROTTLE_LIMITS = {
  /** Default applied to all routes unless overridden. */
  global: 60,
  /** Sensitive auth routes (bruteforce / credential stuffing / email spam). */
  login: 5,
  register: 5,
  forgotPassword: 3,
  resendVerification: 3,
  /**
   * Passkeys: a sign-in or registration verification counts like a login
   * attempt; options are asked on every visit of the sign-in page (conditional
   * UI) and again on a button press, hence a little more room.
   */
  passkeyOptions: 10,
  passkeyVerify: 5,
  /** Token renewal — generous enough for legitimate access-token expiry. */
  refresh: 30,
  /**
   * Remote MCP OAuth (#78): public routes called by the connector's servers.
   * Registration happens once per connection; the token endpoint serves code
   * exchanges and refreshes (every 15 minutes per connection).
   */
  oauthRegister: 5,
  oauthToken: 20,
} as const

/**
 * Extra bucket for requests carrying `Authorization: Bearer`, keyed by the
 * token's hash rather than the IP (the IP bucket above still applies). Lets a
 * script or the MCP server be throttled on its own, whoever relays it.
 */
export const ACCESS_TOKEN_THROTTLER = {
  name: 'access-token',
  ttl: THROTTLE_TTL,
  limit: 60,
} as const
