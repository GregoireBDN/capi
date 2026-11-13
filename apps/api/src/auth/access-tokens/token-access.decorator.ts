import { SetMetadata } from '@nestjs/common'

/**
 * What a personal access token needs to call a route guarded by `JwtGuard`:
 * - `read`: any token (default for GET/HEAD routes);
 * - `write`: a token with the `write` scope;
 * - `none`: session cookie only (default for every other method).
 *
 * So tokens are read-only by default and a mutating route is reachable with a
 * token only when it says so. Use `@TokenAccess('read')` on POST routes that do
 * not write (previews, suggestions) and `@TokenAccess('none')` on GET routes a
 * token must never see (token management).
 */
export type TokenAccessLevel = 'read' | 'write' | 'none'

export const TOKEN_ACCESS_KEY = 'tokenAccess'

export const TokenAccess = (level: TokenAccessLevel) =>
  SetMetadata(TOKEN_ACCESS_KEY, level)
