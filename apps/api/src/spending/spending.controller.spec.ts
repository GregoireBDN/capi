import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { JWT_GUARD_TEST_PROVIDERS } from '#/auth/guards/jwt-guard.testing'
import { SpendingController } from './spending.controller'
import { SpendingService } from './spending.service'

/**
 * The HTTP boundary: query validation and auth. The service is mocked; its
 * behaviour is covered by `spending.service.spec.ts`.
 */

const ID = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'

describe('SpendingController (HTTP)', () => {
  let app: NestFastifyApplication
  let cookie: string
  const service = { byCategory: vi.fn(), trend: vi.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [SpendingController],
      providers: [
        ...JWT_GUARD_TEST_PROVIDERS,
        { provide: SpendingService, useValue: service },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    )
    await app.register(fastifyCookie)
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    cookie = `token=${app.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    service.byCategory.mockReset().mockResolvedValue({ month: '2026-10' })
    service.trend.mockReset().mockResolvedValue({ months: [] })
  })

  function get(url: string, headers: Record<string, string> = { cookie }) {
    return app.inject({ method: 'GET', url, headers })
  }

  describe('GET /spending/by-category', () => {
    it('parses the filters', async () => {
      const response = await get(
        `/spending/by-category?month=2026-10&includeOneOffs=true&accountId=${ID}&averageMonths=12`,
      )
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ month: '2026-10' })
      expect(service.byCategory).toHaveBeenCalledWith({
        month: '2026-10',
        includeOneOffs: true,
        accountId: ID,
        averageMonths: 12,
      })
    })

    it('accepts no filter at all', async () => {
      expect((await get('/spending/by-category')).statusCode).toBe(200)
      expect(service.byCategory).toHaveBeenCalledWith({})
    })

    it.each([
      ['month=2026-13'],
      ['month=2026-1'],
      ['includeOneOffs=1'],
      ['accountId=nope'],
      ['averageMonths=0'],
      ['averageMonths=25'],
      ['averageMonths=abc'],
      ['months=12'],
      ['unknown=1'],
    ])('rejects %s', async (query) => {
      const response = await get(`/spending/by-category?${query}`)
      expect(response.statusCode).toBe(400)
      expect(service.byCategory).not.toHaveBeenCalled()
    })

    it('requires authentication', async () => {
      const response = await get('/spending/by-category', {})
      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /spending/trend', () => {
    it('parses the filters', async () => {
      const response = await get(
        `/spending/trend?month=2026-10&months=24&includeOneOffs=false&categoryId=${ID}&accountId=${ID}`,
      )
      expect(response.statusCode).toBe(200)
      expect(service.trend).toHaveBeenCalledWith({
        month: '2026-10',
        months: 24,
        includeOneOffs: false,
        categoryId: ID,
        accountId: ID,
      })
    })

    it('parses the uncategorized filter', async () => {
      await get('/spending/trend?uncategorized=true')
      expect(service.trend).toHaveBeenCalledWith({ uncategorized: true })
    })

    it.each([
      ['months=0'],
      ['months=37'],
      ['categoryId=groceries'],
      ['uncategorized=yes'],
      ['averageMonths=6'],
    ])('rejects %s', async (query) => {
      const response = await get(`/spending/trend?${query}`)
      expect(response.statusCode).toBe(400)
      expect(service.trend).not.toHaveBeenCalled()
    })

    it('requires authentication', async () => {
      expect((await get('/spending/trend', {})).statusCode).toBe(401)
    })
  })
})
