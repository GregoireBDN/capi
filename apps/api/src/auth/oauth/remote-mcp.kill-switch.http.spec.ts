import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '#/app.module'
import { createFastifyAdapter } from '#/config/fastify-adapter'
import { env } from '#/config/env'
import { DatabaseService } from '#/database/database.service'

/**
 * Kill switch (#78): with `REMOTE_MCP_ENABLED` unset (the default), the app
 * mounts no OAuth route and refuses OAuth access tokens before looking them
 * up. No database is touched.
 */

vi.mock('#/config/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/config/logger')>()
  return { ...actual, loggerParams: { pinoHttp: { level: 'silent' } } }
})

describe('Remote MCP kill switch (HTTP)', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({
        get db(): never {
          throw new Error('The database must not be reached')
        },
        ping: () => Promise.resolve(),
      })
      .compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter(),
      { logger: false },
    )
    app.setGlobalPrefix('api')
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app?.close()
  })

  it('is off by default', () => {
    expect(env.remoteMcp.enabled).toBe(false)
  })

  it.each([
    ['GET', '/api/oauth/metadata'],
    ['POST', '/api/oauth/register'],
    ['POST', '/api/oauth/token'],
    ['POST', '/api/oauth/revoke'],
    ['GET', '/api/oauth/authorize'],
    ['POST', '/api/oauth/authorize'],
    ['GET', '/api/oauth/grants'],
    ['GET', '/api/oauth/token-info'],
  ] as const)('mounts no %s %s', async (method, url) => {
    const res = await app.inject({ method, url, payload: {} })
    expect(res.statusCode).toBe(404)
  })

  it('registers no /api/oauth route at all', () => {
    const routes = app.getHttpAdapter().getInstance().printRoutes()
    expect(routes).not.toContain('oauth')
  })

  it('refuses OAuth access tokens', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/accounts',
      headers: { authorization: `Bearer fin_oat_${'a'.repeat(43)}` },
    })
    expect(res.statusCode).toBe(401)
  })
})
