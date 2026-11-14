import type { AccessTokenScope } from '#/auth/access-tokens/access-tokens.schema'

/** Set on the request by `JwtGuard`. */
export interface RequestUser {
  sub: string
  /**
   * Session requests only: when the user last signed in with a password or a
   * passkey (seconds since the epoch, the access JWT's `auth_time`). Absent
   * for personal access tokens and for sessions older than this claim.
   */
  authTime?: number
}

/** Set by `JwtGuard` when the request authenticated with a personal access token. */
export interface RequestAccessToken {
  id: string
  scope: AccessTokenScope
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: RequestUser
    accessToken?: RequestAccessToken
  }
}
