import { FastifyAdapter } from '@nestjs/platform-fastify'
import { env } from './env'
import { genReqId } from './logger'
import { compileTrustedProxies } from './trusted-proxies'

/** The Fastify adapter the API boots with (`main.ts`). */
export function createFastifyAdapter(
  trustedProxies: string[] = env.TRUSTED_PROXIES,
): FastifyAdapter {
  return new FastifyAdapter({
    // Honour an inbound x-request-id (or mint one) as Fastify's req.id, which
    // nestjs-pino surfaces as `reqId` on every log line for the request.
    genReqId,
    // `request.ip` (rate limits, logs) comes from `X-Forwarded-For` only when
    // the peer is a trusted proxy, i.e. the web server (`trusted-proxies.ts`).
    trustProxy: compileTrustedProxies(trustedProxies),
  })
}
