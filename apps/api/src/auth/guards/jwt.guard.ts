import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { FastifyRequest } from 'fastify'
import { ACCESS_TOKEN_ERRORS } from '#/auth/access-tokens/access-tokens.constants'
import {
  type AuthenticatedAccessToken,
  AccessTokensService,
} from '#/auth/access-tokens/access-tokens.service'
import {
  TOKEN_ACCESS_KEY,
  type TokenAccessLevel,
} from '#/auth/access-tokens/token-access.decorator'
import { OAUTH_ACCESS_TOKEN_PREFIX } from '#/auth/oauth/oauth.constants'
import { OAuthService } from '#/auth/oauth/oauth.service'
import type { RequestAccessToken } from '#/auth/request-user'
import '#/auth/request-user'

const READ_METHODS = new Set(['GET', 'HEAD'])

/** `Authorization: Bearer <token>` → the token; another scheme → `''` (rejected); no header → undefined. */
export function readBearerToken(
  header: string | undefined,
): string | undefined {
  if (header === undefined) return undefined
  const match = /^Bearer[ ]+(\S+)[ ]*$/i.exec(header)
  return match ? match[1] : ''
}

/**
 * Authenticates a request with either:
 * - the `token` session cookie (access JWT), which may call every guarded route;
 * - a personal access token in `Authorization: Bearer`, limited by its scope and
 *   by the route's `@TokenAccess()` level (GET/HEAD: `read`, others: `none`);
 * - an OAuth access token of the remote MCP connection (`fin_oat_`, #78),
 *   limited exactly like a personal access token of the same scope, and
 *   refused outright while `REMOTE_MCP_ENABLED` is off.
 *
 * When an `Authorization` header is present it is the only credential looked
 * at: an invalid token is rejected even if a session cookie is also sent.
 * Attaches `{ sub: userId }` to `request.user` (read it with `@CurrentUser()`),
 * and `request.accessToken` for token requests (audited after the response).
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly accessTokens: AccessTokensService,
    // Absent in specs that build JwtGuard alone: OAuth tokens are then refused.
    @Optional() private readonly oauth?: OAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const bearer = readBearerToken(request.headers?.authorization)
    if (bearer !== undefined)
      return this.authenticateToken(context, request, bearer)

    const token = request.cookies?.['token']
    if (!token) throw new UnauthorizedException()
    try {
      const payload = this.jwt.verify<{ sub: string; auth_time?: unknown }>(
        token,
      )
      request.user =
        typeof payload.auth_time === 'number'
          ? { sub: payload.sub, authTime: payload.auth_time }
          : { sub: payload.sub }
      return true
    } catch {
      throw new UnauthorizedException()
    }
  }

  private async authenticateToken(
    context: ExecutionContext,
    request: FastifyRequest,
    bearer: string,
  ): Promise<boolean> {
    const token = bearer ? await this.resolveBearer(bearer) : null
    if (!token) throw new UnauthorizedException(ACCESS_TOKEN_ERRORS.INVALID)

    // Set before the scope check so a refused call is audited too.
    request.accessToken = token.access

    const declared = this.reflector.getAllAndOverride<
      TokenAccessLevel | undefined
    >(TOKEN_ACCESS_KEY, [context.getHandler(), context.getClass()])
    const required: TokenAccessLevel =
      declared ?? (READ_METHODS.has(request.method) ? 'read' : 'none')
    if (required === 'none')
      throw new ForbiddenException(ACCESS_TOKEN_ERRORS.NOT_ALLOWED)
    if (required === 'write' && token.scope !== 'write') {
      throw new ForbiddenException(ACCESS_TOKEN_ERRORS.INSUFFICIENT_SCOPE)
    }

    request.user = { sub: token.userId }
    return true
  }

  private async resolveBearer(bearer: string): Promise<{
    userId: string
    scope: AuthenticatedAccessToken['scope']
    access: RequestAccessToken
  } | null> {
    if (bearer.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) {
      const token = (await this.oauth?.authenticate(bearer)) ?? null
      return token
        ? {
            userId: token.userId,
            scope: token.scope,
            access: {
              id: token.grantId,
              scope: token.scope,
              kind: 'oauth',
              expiresAt: token.expiresAt,
            },
          }
        : null
    }
    const token = await this.accessTokens.authenticate(bearer)
    return token
      ? {
          userId: token.userId,
          scope: token.scope,
          access: { id: token.id, scope: token.scope },
        }
      : null
  }
}
