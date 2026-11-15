import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { AccessTokensService } from '#/auth/access-tokens/access-tokens.service'
import '#/auth/request-user'

/** Route pattern (`/api/transactions/:id`), never the concrete URL or its query string. */
export function auditedRoute(request: FastifyRequest): string {
  return request.routeOptions?.url ?? 'unknown'
}

/**
 * Records every response to a request authenticated with a personal access
 * token (`request.accessToken`, set by `JwtGuard`), refused ones included.
 * Failing to record never fails the request.
 */
export async function recordAccessTokenUse(
  accessTokens: AccessTokensService,
  logger: Pick<Logger, 'warn'>,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.accessToken
  // OAuth tokens (#78) are audited by `OAuthAuditHook` in `oauth_audit`.
  if (!token || token.kind === 'oauth') return
  try {
    await accessTokens.recordUse({
      tokenId: token.id,
      method: request.method,
      route: auditedRoute(request),
      statusCode: reply.statusCode,
    })
  } catch (error) {
    logger.warn(
      `Recording an access token call failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    )
  }
}

@Injectable()
export class AccessTokenAuditHook implements OnModuleInit {
  private readonly logger = new Logger(AccessTokenAuditHook.name)

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly accessTokens: AccessTokensService,
  ) {}

  onModuleInit(): void {
    const instance = this.adapterHost.httpAdapter?.getInstance?.() as
      | FastifyInstance
      | undefined
    if (typeof instance?.addHook !== 'function') return
    instance.addHook('onResponse', (request, reply) =>
      recordAccessTokenUse(this.accessTokens, this.logger, request, reply),
    )
  }
}
