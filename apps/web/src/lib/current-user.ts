import type { UserDto } from '#/api/types.gen'

/** What the generated client returns for `GET /api/auth/me` with `throwOnError: false`. */
export interface MeResult {
  data?: UserDto
  error?: unknown
  response?: Response
}

/**
 * The signed-in user from a `GET /api/auth/me` result, or null when the API
 * answered that nobody is signed in.
 *
 * When the request got no response at all (offline, server unreachable), the
 * error is thrown instead: returning null would make the route guards send a
 * signed-in owner to the login page just because the network dropped.
 */
export function currentUserFromResult(result: MeResult): UserDto | null {
  if (result.error !== undefined && !result.response) throw result.error
  return result.error !== undefined || !result.data ? null : result.data
}
