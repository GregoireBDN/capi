import type { AccessTokenScope } from '#/auth/access-tokens/access-tokens.schema'

/** Set on the request by `JwtGuard`. */
export interface RequestUser {
  sub: string
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
