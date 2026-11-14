import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { AUTH_ERRORS, FRESH_AUTH_MAX_AGE_SECONDS } from '#/auth/auth.constants'
import type { RequestUser } from '#/auth/request-user'

/** Clock skew tolerated on an `auth_time` slightly in the future. */
const FUTURE_SKEW_SECONDS = 60

/**
 * 403 `Recent authentication required` unless the user signed in (password or
 * passkey) within `FRESH_AUTH_MAX_AGE_SECONDS`. Personal access tokens and
 * sessions without the `auth_time` claim are never fresh.
 */
export function assertFreshSession(
  user: RequestUser | undefined,
  now = new Date(),
): void {
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const authTime = user?.authTime
  const fresh =
    authTime !== undefined &&
    authTime <= nowSeconds + FUTURE_SKEW_SECONDS &&
    nowSeconds - authTime <= FRESH_AUTH_MAX_AGE_SECONDS
  if (!fresh)
    throw new ForbiddenException(AUTH_ERRORS.REAUTHENTICATION_REQUIRED)
}

/**
 * Routes that hand over or destroy the account (add or revoke a passkey,
 * create an access token, delete the account) need a fresh session. Use it
 * after `JwtGuard`: `@UseGuards(JwtGuard, FreshAuthGuard)`, or on the method
 * when `JwtGuard` is on the controller (class guards run first).
 */
@Injectable()
export class FreshAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    assertFreshSession(request.user)
    return true
  }
}
