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
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { JWT_GUARD_TEST_PROVIDERS } from '#/auth/guards/jwt-guard.testing'
import { BudgetsController } from './budgets.controller'
import { BudgetsService } from './budgets.service'

/**
 * The HTTP boundary: query and body validation, defaults (current month in
 * Europe/Paris), auth. The service is mocked; its behaviour is covered by
 * `budgets.service.spec.ts`.
 */

const CATEGORY_ID = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'

describe('BudgetsController (HTTP)', () => {
  let app: NestFastifyApplication
  let cookie: string
  const service = {
    month: vi.fn(),
    history: vi.fn(),
    suggest: vi.fn(),
    upsert: vi.fn(),
    remove: vi.fn(),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [BudgetsController],
      providers: [
        ...JWT_GUARD_TEST_PROVIDERS,
        { provide: BudgetsService, useValue: service },
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
    for (const fn of Object.values(service)) fn.mockReset()
    service.month.mockResolvedValue({ month: 'x' })
    service.history.mockResolvedValue({ months: [] })
    service.suggest.mockResolvedValue({ items: [] })
    service.upsert.mockResolvedValue({ id: 'b' })
    service.remove.mockResolvedValue(undefined)
    // 23:30 UTC on 31 October 2026 is already November in Paris.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-31T23:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
    headers: Record<string, string> = { cookie },
  ) {
    return app.inject({ method, url, payload, headers })
  }

  describe('GET /budgets', () => {
    it('defaults to the current month in Europe/Paris', async () => {
      const response = await request('GET', '/budgets')
      expect(response.statusCode).toBe(200)
      expect(service.month).toHaveBeenCalledWith('2026-11')
    })

    it('reads the month', async () => {
      await request('GET', '/budgets?month=2026-02')
      expect(service.month).toHaveBeenCalledWith('2026-02')
    })

    it.each([
      ['month=2026-13'],
      ['month=2026-1'],
      ['month=2026-01-01'],
      ['x=1'],
    ])('rejects %s', async (query) => {
      const response = await request('GET', `/budgets?${query}`)
      expect(response.statusCode).toBe(400)
      expect(service.month).not.toHaveBeenCalled()
    })

    it('requires authentication', async () => {
      const response = await request('GET', '/budgets', undefined, {})
      expect(response.statusCode).toBe(401)
    })
  })

  describe('GET /budgets/history', () => {
    it('defaults to 6 months ending with the current month', async () => {
      const response = await request('GET', '/budgets/history')
      expect(response.statusCode).toBe(200)
      expect(service.history).toHaveBeenCalledWith('2026-11', 6)
    })

    it('reads months and month', async () => {
      await request('GET', '/budgets/history?months=12&month=2026-03')
      expect(service.history).toHaveBeenCalledWith('2026-03', 12)
    })

    it.each([['months=0'], ['months=25'], ['months=abc'], ['month=26-03']])(
      'rejects %s',
      async (query) => {
        const response = await request('GET', `/budgets/history?${query}`)
        expect(response.statusCode).toBe(400)
        expect(service.history).not.toHaveBeenCalled()
      },
    )
  })

  describe('POST /budgets/suggest', () => {
    it('defaults to the 3 months before the current month', async () => {
      const response = await request('POST', '/budgets/suggest')
      expect(response.statusCode).toBe(200)
      expect(service.suggest).toHaveBeenCalledWith('2026-11', 3)
    })

    it.each([['months=13'], ['months=-1']])('rejects %s', async (query) => {
      const response = await request('POST', `/budgets/suggest?${query}`)
      expect(response.statusCode).toBe(400)
    })
  })

  describe('PUT /budgets/:categoryId', () => {
    it('defaults the first month to the current one', async () => {
      const response = await request('PUT', `/budgets/${CATEGORY_ID}`, {
        monthlyTargetCents: 40_000,
      })
      expect(response.statusCode).toBe(200)
      expect(service.upsert).toHaveBeenCalledWith(CATEGORY_ID, '2026-11', {
        monthlyTargetCents: 40_000,
      })
    })

    it('passes the month and a trimmed note (empty = removed)', async () => {
      await request('PUT', `/budgets/${CATEGORY_ID}`, {
        monthlyTargetCents: 1,
        effectiveFrom: '2027-01',
        note: '  Fixe  ',
      })
      expect(service.upsert).toHaveBeenLastCalledWith(CATEGORY_ID, '2027-01', {
        monthlyTargetCents: 1,
        effectiveFrom: '2027-01',
        note: 'Fixe',
      })
      await request('PUT', `/budgets/${CATEGORY_ID}`, {
        monthlyTargetCents: 1,
        note: '   ',
      })
      expect(service.upsert).toHaveBeenLastCalledWith(CATEGORY_ID, '2026-11', {
        monthlyTargetCents: 1,
        note: null,
      })
    })

    it.each([
      [{}],
      [{ monthlyTargetCents: 0 }],
      [{ monthlyTargetCents: -100 }],
      [{ monthlyTargetCents: 12.5 }],
      [{ monthlyTargetCents: '4000' }],
      [{ monthlyTargetCents: 1_000_000_001 }],
      [{ monthlyTargetCents: 100, effectiveFrom: '2026-11-01' }],
      [{ monthlyTargetCents: 100, note: 'x'.repeat(501) }],
      [{ monthlyTargetCents: 100, kind: 'expense' }],
    ])('rejects %j', async (body) => {
      const response = await request('PUT', `/budgets/${CATEGORY_ID}`, body)
      expect(response.statusCode).toBe(400)
      expect(service.upsert).not.toHaveBeenCalled()
    })

    it('rejects a category id that is not a uuid', async () => {
      const response = await request('PUT', '/budgets/groceries', {
        monthlyTargetCents: 100,
      })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('DELETE /budgets/:categoryId', () => {
    it('stops from the current month by default', async () => {
      const response = await request('DELETE', `/budgets/${CATEGORY_ID}`)
      expect(response.statusCode).toBe(204)
      expect(service.remove).toHaveBeenCalledWith(CATEGORY_ID, '2026-11')
    })

    it('reads the first month without budget', async () => {
      await request('DELETE', `/budgets/${CATEGORY_ID}?from=2027-02`)
      expect(service.remove).toHaveBeenCalledWith(CATEGORY_ID, '2027-02')
    })

    it('requires authentication', async () => {
      const response = await request(
        'DELETE',
        `/budgets/${CATEGORY_ID}`,
        undefined,
        {},
      )
      expect(response.statusCode).toBe(401)
    })
  })
})
