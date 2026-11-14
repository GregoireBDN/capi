import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import type { RequestUser } from '#/auth/request-user'

// Extracts req.user set by JwtGuard — use with @UseGuards(JwtGuard) on the route.
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { user: RequestUser }>()
    return req.user
  },
)
