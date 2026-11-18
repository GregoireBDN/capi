import { Controller, Get, HttpCode, Post, Req } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import type { FastifyRequest } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { THROTTLE_LIMITS, THROTTLE_TTL } from '#/throttle.config'
import { createFastifyAdapter } from './fastify-adapter'
import { loggerParams } from './logger'
import {
  DEFAULT_TRUSTED_PROXIES,
  clientIp,
  compileTrustedProxies,
  parseTrustedProxies,
} from './trusted-proxies'

/**
 * Per-IP rate limits behind the web server's `/api` proxy (#49): the API
 * honours `X-Forwarded-For` only from trusted peers (the web container on the
 * internal network), so each real client gets its own bucket while a client
 * calling the API directly can't escape its bucket by spoofing the header.
 */

/** The `web` container, as seen by the API on the compose network. */
const WEB_PROXY = '172.18.0.3'
/** Clients (documentation ranges, never private). */
const CLIENT_A = '203.0.113.10'
const CLIENT_B = '198.51.100.20'
/**
 * Tailnet devices as Caddy forwards them (#251): an IPv4 in 100.64/10, or an
 * IPv6 in Tailscale's fd7a:115c:a1e0::/48, which is itself inside the private
 * range the API trusts (uniquelocal). Synthetic host parts.
 */
const TAILNET_V4 = '100.101.102.103'
const TAILNET_V6_A = 'fd7a:115c:a1e0::aaaa:1'
const TAILNET_V6_B = 'fd7a:115c:a1e0::bbbb:2'

@Controller()
class ProbeController {
  @Get('ip')
  ip(@Req() request: FastifyRequest) {
    return { ip: request.ip }
  }

  /** Same limit as the real login route. */
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.login } })
  login() {
    return { ok: true }
  }
}

async function createApp(trustedProxies = DEFAULT_TRUSTED_PROXIES) {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot({
        throttlers: [
          { name: 'default', ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.global },
        ],
      }),
    ],
    controllers: [ProbeController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile()
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    createFastifyAdapter(parseTrustedProxies(trustedProxies)),
    { logger: false },
  )
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return app
}

function send(
  app: NestFastifyApplication,
  options: {
    path: string
    method?: 'GET' | 'POST'
    from: string
    forwardedFor?: string
  },
) {
  return app.inject({
    method: options.method ?? 'GET',
    url: options.path,
    remoteAddress: options.from,
    headers: options.forwardedFor
      ? { 'x-forwarded-for': options.forwardedFor }
      : {},
  })
}

async function loginStatuses(
  app: NestFastifyApplication,
  count: number,
  request: (i: number) => { from: string; forwardedFor?: string },
): Promise<number[]> {
  const statuses: number[] = []
  for (let i = 0; i < count; i++) {
    const res = await send(app, {
      path: '/login',
      method: 'POST',
      ...request(i),
    })
    statuses.push(res.statusCode)
  }
  return statuses
}

describe('trusted proxies (client IP behind the /api proxy)', () => {
  let app: NestFastifyApplication | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  describe('request.ip', () => {
    it('takes X-Forwarded-For from the web proxy on the internal network', async () => {
      app = await createApp()
      const res = await send(app, {
        path: '/ip',
        from: WEB_PROXY,
        forwardedFor: CLIENT_A,
      })
      expect(res.json()).toEqual({ ip: CLIENT_A })
    })

    it('takes X-Forwarded-For from the dev web server on localhost', async () => {
      app = await createApp()
      const res = await send(app, {
        path: '/ip',
        from: '127.0.0.1',
        forwardedFor: CLIENT_A,
      })
      expect(res.json()).toEqual({ ip: CLIENT_A })
    })

    it('ignores X-Forwarded-For sent by a client that is not a trusted proxy', async () => {
      app = await createApp()
      const res = await send(app, {
        path: '/ip',
        from: CLIENT_A,
        forwardedFor: CLIENT_B,
      })
      expect(res.json()).toEqual({ ip: CLIENT_A })
    })

    it('stops at the first untrusted hop of a forwarded chain', async () => {
      app = await createApp()
      const res = await send(app, {
        path: '/ip',
        from: WEB_PROXY,
        forwardedFor: `${CLIENT_B}, ${CLIENT_A}`,
      })
      expect(res.json()).toEqual({ ip: CLIENT_A })
    })

    it.each([TAILNET_V4, TAILNET_V6_A])(
      'takes a tailnet client address (%s) forwarded by web',
      async (client) => {
        app = await createApp()
        const res = await send(app, {
          path: '/ip',
          from: WEB_PROXY,
          forwardedFor: client,
        })
        expect(res.json()).toEqual({ ip: client })
      },
    )

    it('trusts nobody with TRUSTED_PROXIES=none', async () => {
      app = await createApp('none')
      const res = await send(app, {
        path: '/ip',
        from: WEB_PROXY,
        forwardedFor: CLIENT_A,
      })
      expect(res.json()).toEqual({ ip: WEB_PROXY })
    })
  })

  describe('rate limit', () => {
    it('gives each client behind the proxy its own bucket', async () => {
      app = await createApp()
      const limit = THROTTLE_LIMITS.login

      const clientA = await loginStatuses(app, limit + 1, () => ({
        from: WEB_PROXY,
        forwardedFor: CLIENT_A,
      }))
      expect(clientA.slice(0, limit)).toEqual(Array(limit).fill(200))
      expect(clientA[limit]).toBe(429)

      // Another client behind the same proxy is not blocked by client A.
      const clientB = await send(app, {
        path: '/login',
        method: 'POST',
        from: WEB_PROXY,
        forwardedFor: CLIENT_B,
      })
      expect(clientB.statusCode).toBe(200)
    })

    it('gives two tailnet devices connecting over IPv6 their own buckets', async () => {
      app = await createApp()
      const limit = THROTTLE_LIMITS.login

      const deviceA = await loginStatuses(app, limit + 1, () => ({
        from: WEB_PROXY,
        forwardedFor: TAILNET_V6_A,
      }))
      expect(deviceA[limit]).toBe(429)

      const deviceB = await send(app, {
        path: '/login',
        method: 'POST',
        from: WEB_PROXY,
        forwardedFor: TAILNET_V6_B,
      })
      expect(deviceB.statusCode).toBe(200)
    })

    it('a client calling the API directly cannot bypass it with a spoofed X-Forwarded-For', async () => {
      app = await createApp()
      const limit = THROTTLE_LIMITS.login

      // A fresh fake client IP on every attempt: the header is ignored, so all
      // attempts land in the attacker's own bucket.
      const statuses = await loginStatuses(app, limit + 2, (i) => ({
        from: CLIENT_A,
        forwardedFor: `198.51.100.${100 + i}`,
      }))
      expect(statuses.slice(0, limit)).toEqual(Array(limit).fill(200))
      expect(statuses.slice(limit)).toEqual([429, 429])
    })

    it('a client cannot bypass it by prepending addresses to the proxied header', async () => {
      app = await createApp()
      const limit = THROTTLE_LIMITS.login

      // The proxy appends the real client IP; whatever the client put before
      // it is left of the first untrusted hop and ignored.
      const statuses = await loginStatuses(app, limit + 1, (i) => ({
        from: WEB_PROXY,
        forwardedFor: `198.51.100.${100 + i}, ${CLIENT_A}`,
      }))
      expect(statuses[limit]).toBe(429)
    })
  })
})

describe('parseTrustedProxies', () => {
  it('splits and trims a comma-separated list', () => {
    expect(parseTrustedProxies(' loopback , 172.18.0.0/16,,10.0.0.1 ')).toEqual(
      ['loopback', '172.18.0.0/16', '10.0.0.1'],
    )
  })

  it('trusts nobody for "none" or an empty value', () => {
    expect(parseTrustedProxies('none')).toEqual([])
    expect(parseTrustedProxies('')).toEqual([])
  })

  it('rejects invalid entries when compiled', () => {
    expect(() => compileTrustedProxies(['not-an-ip'])).toThrow()
  })
})

describe('request log', () => {
  it('logs the client IP rather than the proxy socket address', () => {
    const trust = compileTrustedProxies(
      parseTrustedProxies(DEFAULT_TRUSTED_PROXIES),
    )
    const raw = {
      headers: { 'x-forwarded-for': CLIENT_A },
      socket: { remoteAddress: WEB_PROXY },
    } as unknown as Parameters<typeof clientIp>[0]
    expect(clientIp(raw, trust)).toBe(CLIENT_A)

    const serializers = (
      loggerParams.pinoHttp as {
        serializers: { req: (req: object) => { remoteAddress?: string } }
      }
    ).serializers
    const serialized = serializers.req({ raw, remoteAddress: WEB_PROXY })
    // Only the default trust list is compiled into the logger; it trusts the
    // web container's private address.
    expect(serialized.remoteAddress).toBe(CLIENT_A)
  })
})
