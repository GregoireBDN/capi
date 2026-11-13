import { randomUUID } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import type { Params } from 'nestjs-pino'
import {
  safeErrorSerializer,
  safeLogMethod,
} from '../common/logging/safe-error'
import { env } from './env'
import { clientIp, compileTrustedProxies } from './trusted-proxies'

const trustProxy = compileTrustedProxies(env.TRUSTED_PROXIES)

/**
 * Header carrying the request-correlation id. Honoured on the way in (a value
 * sent by an upstream proxy/gateway is reused) and echoed on the way out so the
 * caller can quote it when reporting an issue.
 */
export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Fastify request-id generator: reuse an incoming correlation id when present,
 * otherwise mint a UUID. The value becomes Fastify's `req.id`, which `nestjs-pino`
 * surfaces as `reqId` on every log line for that request.
 */
export const genReqId = (req: { headers: IncomingHttpHeaders }): string => {
  const existing = req.headers[REQUEST_ID_HEADER]
  return (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID()
}

/**
 * pino serializers, applied to every log line (pino-http wraps them around
 * pino's standard ones).
 */
export const logSerializers = {
  // Log the client IP Fastify uses (`request.ip`, i.e. `X-Forwarded-For`
  // when it comes from a trusted proxy) rather than the web server's socket
  // address, which is the same for every request behind the `/api` proxy.
  req: (req: { raw?: IncomingMessage; remoteAddress?: string }) => {
    if (req.raw) req.remoteAddress = clientIp(req.raw, trustProxy)
    return req
  },
  // Failed database queries carry their bound values (labels, amounts,
  // balances...) in the message, `params` and the Postgres `detail`: log only
  // safe fields for them (see `common/logging/safe-error.ts`).
  err: safeErrorSerializer,
}

/** pino hooks (see `safeLogMethod`). */
export const logHooks = { logMethod: safeLogMethod }

/**
 * `nestjs-pino` configuration: structured JSON logs with a stable `reqId` on
 * every line so all logs emitted while handling one request can be correlated.
 *
 * In production logs are raw JSON (one object per line) for ingestion by a log
 * collector. In development they are pretty-printed for readability.
 */
export const loggerParams: Params = {
  pinoHttp: {
    level: env.isProduction ? 'info' : 'debug',

    // Pretty-print locally; emit raw JSON in production.
    transport: env.isProduction
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            singleLine: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },

    serializers: logSerializers,

    // A line logged with an error but no message takes the error's message,
    // which the `err` serializer can't reach: never let it be a failed query's.
    hooks: logHooks,

    // Never log credentials or session cookies.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      remove: true,
    },

    // Surface server faults at `error`, client errors at `warn`.
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
  },
}
