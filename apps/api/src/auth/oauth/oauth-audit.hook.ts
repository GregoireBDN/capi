import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { auditedRoute } from '#/auth/access-tokens/access-token-audit.hook'
import { OAuthService } from '#/auth/oauth/oauth.service'
import '#/auth/request-user'

/**
 * Records every response to a request authenticated with an OAuth access
 * token (#78), refused ones included: grant, method, route pattern, status.
 * Failing to record never fails the request.
 */
export async function recordOAuthUse(
  oauth: Pick<OAuthService, 'recordUse'>,
  logger: Pick<Logger, 'warn'>,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.accessToken
  if (token?.kind !== 'oauth') return
  try {
    await oauth.recordUse({
      grantId: token.id,
      method: request.method,
      route: auditedRoute(request),
      statusCode: reply.statusCode,
    })
  } catch (error) {
    logger.warn(
      `Recording an OAuth call failed: ${error instanceof Error ? error.name : 'unknown error'}`,
    )
  }
}

@Injectable()
export class OAuthAuditHook implements OnModuleInit {
  private readonly logger = new Logger(OAuthAuditHook.name)

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly oauth: OAuthService,
  ) {}

  onModuleInit(): void {
    const instance = this.adapterHost.httpAdapter?.getInstance?.() as
      | FastifyInstance
      | undefined
    if (typeof instance?.addHook !== 'function') return
    instance.addHook('onResponse', (request, reply) =>
      recordOAuthUse(this.oauth, this.logger, request, reply),
    )
  }
}
