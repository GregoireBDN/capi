import { Controller, Get } from '@nestjs/common'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOpenApiDocument, setupSwagger } from './swagger'

/** `env.isProduction`, switched per case (#180). */
const state = vi.hoisted(() => ({ isProduction: false }))

vi.mock('./env', async (importOriginal) => {
  const original = await importOriginal<typeof import('./env')>()
  return {
    env: new Proxy(original.env, {
      get: (target, key) =>
        key === 'isProduction'
          ? state.isProduction
          : (Reflect.get(target, key) as unknown),
    }),
  }
})

@Controller('probe')
class ProbeController {
  @Get()
  probe() {
    return { ok: true }
  }
}

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController],
  }).compile()
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
    { logger: false },
  )
  app.setGlobalPrefix('api')
  const registered = setupSwagger(app)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  return { app, registered }
}

describe('Swagger UI and OpenAPI document', () => {
  let app: NestFastifyApplication | undefined

  afterEach(async () => {
    await app?.close()
    app = undefined
  })

  it('are not served in production', async () => {
    state.isProduction = true
    const created = await createApp()
    app = created.app

    expect(created.registered).toBe(false)
    for (const url of ['/api/docs', '/api/docs/', '/api/docs-json']) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode, url).toBe(404)
    }
    expect((await app.inject({ url: '/api/probe' })).statusCode).toBe(200)
  })

  it('are served in development, the UI with its own CSP', async () => {
    state.isProduction = false
    const created = await createApp()
    app = created.app

    expect(created.registered).toBe(true)
    const ui = await app.inject({ method: 'GET', url: '/api/docs' })
    expect(ui.statusCode).toBe(200)
    expect(ui.headers['content-security-policy']).toContain(
      `script-src 'self' 'unsafe-inline'`,
    )

    const json = await app.inject({ method: 'GET', url: '/api/docs-json' })
    expect(json.statusCode).toBe(200)
    expect(json.json()).toMatchObject({ paths: { '/api/probe': {} } })
  })

  it('builds the same document in production, for `pnpm generate`', async () => {
    state.isProduction = true
    const created = await createApp()
    app = created.app

    const document = createOpenApiDocument(app)
    expect(document.info.title).toBe('Capi API')
    expect(Object.keys(document.paths)).toEqual(['/api/probe'])
  })
})
