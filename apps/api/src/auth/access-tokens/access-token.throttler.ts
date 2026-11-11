import type { ExecutionContext } from '@nestjs/common'
import type { ThrottlerOptions } from '@nestjs/throttler'
import { hashAccessToken } from '#/auth/access-tokens/access-tokens.service'
import { readBearerToken } from '#/auth/guards/jwt.guard'
import { ACCESS_TOKEN_THROTTLER } from '#/throttle.config'

type HeaderRequest = { headers?: { authorization?: string } }

const bearerOf = (request: HeaderRequest) =>
  readBearerToken(request.headers?.authorization)

/** Per-token rate limit; skipped for cookie (browser) requests. */
export const accessTokenThrottler: ThrottlerOptions = {
  ...ACCESS_TOKEN_THROTTLER,
  skipIf: (context: ExecutionContext) =>
    !bearerOf(context.switchToHttp().getRequest<HeaderRequest>()),
  getTracker: (request) =>
    `pat:${hashAccessToken(bearerOf(request as HeaderRequest) ?? '')}`,
}
