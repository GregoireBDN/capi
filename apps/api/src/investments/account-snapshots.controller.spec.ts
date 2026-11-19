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
import { AccountSnapshotsController } from './account-snapshots.controller'
import { InvestmentsController } from './investments.controller'
import { InvestmentsService } from './investments.service'
import { MovementsService } from './movements.service'

/**
 * The HTTP boundary: parameter and body validation, auth. The service is
 * mocked; its behaviour is covered by `investments.service.spec.ts`.
 */

const ACCOUNT_ID = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'
const BASE = `/accounts/${ACCOUNT_ID}`

describe('Snapshots and investments controllers (HTTP)', () => {
  let app: NestFastifyApplication
  let cookie: string
  const service = {
    list: vi.fn(),
    upsert: vi.fn(),
    remove: vi.fn(),
    bulkUpsert: vi.fn(),
    performance: vi.fn(),
    summary: vi.fn(),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [AccountSnapshotsController, InvestmentsController],
      providers: [
        ...JWT_GUARD_TEST_PROVIDERS,
        { provide: InvestmentsService, useValue: service },
        { provide: MovementsService, useValue: {} },
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
    service.list.mockResolvedValue([])
    service.upsert.mockResolvedValue({ id: 's' })
    service.remove.mockResolvedValue(undefined)
    service.bulkUpsert.mockResolvedValue({ created: 1, updated: 0 })
    service.performance.mockResolvedValue({ accountId: ACCOUNT_ID })
    service.summary.mockResolvedValue({ totals: {}, accounts: [] })
  })

  function request(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    payload?: object,
    headers: Record<string, string> = { cookie },
  ) {
    return app.inject({ method, url, payload, headers })
  }

  it('requires authentication', async () => {
    for (const url of [
      `${BASE}/snapshots`,
      `${BASE}/performance`,
      '/investments/summary',
    ]) {
      const response = await request('GET', url, undefined, {})
      expect(response.statusCode).toBe(401)
    }
  })

  it('lists snapshots and reads the performance and summary', async () => {
    expect((await request('GET', `${BASE}/snapshots`)).statusCode).toBe(200)
    expect(service.list).toHaveBeenCalledWith(ACCOUNT_ID)
    expect((await request('GET', `${BASE}/performance`)).statusCode).toBe(200)
    expect(service.performance).toHaveBeenCalledWith(ACCOUNT_ID)
    expect((await request('GET', '/investments/summary')).statusCode).toBe(200)
  })

  it('rejects a malformed account id', async () => {
    const response = await request('GET', '/accounts/nope/snapshots')
    expect(response.statusCode).toBe(400)
  })

  describe('PUT /accounts/:id/snapshots/:date', () => {
    it('upserts with a trimmed note', async () => {
      const response = await request('PUT', `${BASE}/snapshots/2026-09-30`, {
        valueCents: 123_456,
        contributionsCents: -5_00,
        note: '  Relevé T3  ',
      })
      expect(response.statusCode).toBe(200)
      expect(service.upsert).toHaveBeenCalledWith(ACCOUNT_ID, '2026-09-30', {
        valueCents: 123_456,
        contributionsCents: -5_00,
        note: 'Relevé T3',
      })
    })

    it.each(['2026-02-30', '2026-9-30', '30-09-2026', '2026-09-30T00:00:00Z'])(
      'rejects the date %s',
      async (date) => {
        const response = await request('PUT', `${BASE}/snapshots/${date}`, {
          valueCents: 1,
        })
        expect(response.statusCode).toBe(400)
        expect(service.upsert).not.toHaveBeenCalled()
      },
    )

    it.each([
      [{}],
      [{ valueCents: -1 }],
      [{ valueCents: 1.5 }],
      [{ valueCents: '100' }],
      [{ valueCents: 1, contributionsCents: 0.5 }],
      [{ valueCents: 1, note: 'x'.repeat(501) }],
      [{ valueCents: 1, extra: true }],
    ])('rejects the body %j', async (body) => {
      const response = await request(
        'PUT',
        `${BASE}/snapshots/2026-09-30`,
        body,
      )
      expect(response.statusCode).toBe(400)
      expect(service.upsert).not.toHaveBeenCalled()
    })
  })

  it('deletes a snapshot', async () => {
    const response = await request('DELETE', `${BASE}/snapshots/2026-09-30`)
    expect(response.statusCode).toBe(204)
    expect(service.remove).toHaveBeenCalledWith(ACCOUNT_ID, '2026-09-30')
  })

  describe('POST /accounts/:id/snapshots/bulk', () => {
    it('passes the rows', async () => {
      const rows = [
        { date: '2026-03-31', valueCents: 100, contributionsCents: 90 },
        { date: '2026-06-30', valueCents: 110 },
      ]
      const response = await request('POST', `${BASE}/snapshots/bulk`, { rows })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ created: 1, updated: 0 })
      expect(service.bulkUpsert).toHaveBeenCalledWith(ACCOUNT_ID, rows)
    })

    it.each([
      ['no rows', { rows: [] }],
      [
        'too many rows',
        {
          rows: Array.from({ length: 501 }, () => ({
            date: '2026-01-01',
            valueCents: 1,
          })),
        },
      ],
      ['an impossible date', { rows: [{ date: '2026-02-29', valueCents: 1 }] }],
      ['a negative value', { rows: [{ date: '2026-02-28', valueCents: -1 }] }],
      ['a note', { rows: [{ date: '2026-02-28', valueCents: 1, note: 'x' }] }],
    ])('rejects %s', async (_label, body) => {
      const response = await request('POST', `${BASE}/snapshots/bulk`, body)
      expect(response.statusCode).toBe(400)
      expect(service.bulkUpsert).not.toHaveBeenCalled()
    })
  })
})
