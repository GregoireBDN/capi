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
import { AccessTokensService } from '#/auth/access-tokens/access-tokens.service'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { RecurringController } from './recurring.controller'
import { RecurringService } from './recurring.service'

/**
 * The HTTP boundary: query and body validation, auth. The service is mocked;
 * its behaviour is covered by `recurring.service.spec.ts`.
 */

const ITEM_ID = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'
const CATEGORY_ID = '1f0c5a7e-2d1b-4c3a-9e8f-123456789abc'
/** Synthetic personal access token, accepted by the mocked token service. */
const WRITE_TOKEN = `fin_pat_${'a'.repeat(43)}`

describe('RecurringController (HTTP)', () => {
  let app: NestFastifyApplication
  let cookie: string
  const service = {
    detect: vi.fn(),
    list: vi.fn(),
    summary: vi.fn(),
    update: vi.fn(),
    confirm: vi.fn(),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [RecurringController],
      providers: [
        JwtGuard,
        {
          provide: AccessTokensService,
          useValue: {
            authenticate: (token: string) =>
              Promise.resolve(
                token === WRITE_TOKEN
                  ? { id: 'token-1', userId: 'user-1', scope: 'write' }
                  : null,
              ),
          },
        },
        { provide: RecurringService, useValue: service },
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
    service.detect.mockResolvedValue({ createdCount: 0 })
    service.list.mockResolvedValue([])
    service.summary.mockResolvedValue({ suggestedCount: 0 })
    service.update.mockResolvedValue({ id: ITEM_ID })
    service.confirm.mockResolvedValue({ confirmedCount: 1 })
  })

  function request(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: object,
    headers: Record<string, string> = { cookie },
  ) {
    return app.inject({ method, url, payload, headers })
  }

  it.each([
    ['POST', '/recurring/detect'],
    ['GET', '/recurring'],
    ['GET', '/recurring/summary'],
    ['POST', '/recurring/confirm'],
    ['PATCH', `/recurring/${ITEM_ID}`],
  ] as const)('%s %s requires authentication', async (method, url) => {
    const response = await request(method, url, {}, {})
    expect(response.statusCode).toBe(401)
  })

  it('runs the detection', async () => {
    const response = await request('POST', '/recurring/detect')
    expect(response.statusCode).toBe(200)
    expect(service.detect).toHaveBeenCalledOnce()
  })

  describe('GET /recurring', () => {
    it('lists every item by default', async () => {
      const response = await request('GET', '/recurring')
      expect(response.statusCode).toBe(200)
      expect(service.list).toHaveBeenCalledWith(undefined)
    })

    it('filters by status', async () => {
      await request('GET', '/recurring?status=suggested')
      expect(service.list).toHaveBeenCalledWith('suggested')
    })

    it.each([['status=active'], ['x=1']])('rejects %s', async (query) => {
      const response = await request('GET', `/recurring?${query}`)
      expect(response.statusCode).toBe(400)
      expect(service.list).not.toHaveBeenCalled()
    })
  })

  it('returns the summary', async () => {
    const response = await request('GET', '/recurring/summary')
    expect(response.statusCode).toBe(200)
    expect(service.summary).toHaveBeenCalledOnce()
  })

  describe('POST /recurring/confirm', () => {
    it('confirms the ids', async () => {
      const response = await request('POST', '/recurring/confirm', {
        ids: [ITEM_ID],
      })
      expect(response.statusCode).toBe(200)
      expect(service.confirm).toHaveBeenCalledWith([ITEM_ID])
    })

    it.each([[{}], [{ ids: [] }], [{ ids: ['nope'] }]])(
      'rejects %j',
      async (body) => {
        const response = await request('POST', '/recurring/confirm', body)
        expect(response.statusCode).toBe(400)
        expect(service.confirm).not.toHaveBeenCalled()
      },
    )
  })

  describe('PATCH /recurring/:id', () => {
    it('passes a trimmed name, nullable fields and the cadence', async () => {
      const response = await request('PATCH', `/recurring/${ITEM_ID}`, {
        status: 'confirmed',
        name: '  Loyer  ',
        categoryId: CATEGORY_ID,
        isFixedCost: true,
        cadence: 'yearly',
        notes: '   ',
      })
      expect(response.statusCode).toBe(200)
      expect(service.update).toHaveBeenCalledWith(ITEM_ID, {
        status: 'confirmed',
        name: 'Loyer',
        categoryId: CATEGORY_ID,
        isFixedCost: true,
        cadence: 'yearly',
        notes: null,
      })
    })

    it('accepts null to clear the category and the cadence override', async () => {
      await request('PATCH', `/recurring/${ITEM_ID}`, {
        categoryId: null,
        cadence: null,
      })
      expect(service.update).toHaveBeenCalledWith(ITEM_ID, {
        categoryId: null,
        cadence: null,
      })
    })

    it.each([
      [{ status: 'active' }],
      [{ status: null }],
      [{ name: '   ' }],
      [{ name: null }],
      [{ isFixedCost: 'yes' }],
      [{ isFixedCost: null }],
      [{ cadence: 'daily' }],
      [{ categoryId: 'nope' }],
      [{ notes: 'x'.repeat(1001) }],
      [{ typicalAmountCents: 1 }],
    ])('rejects %j', async (body) => {
      const response = await request('PATCH', `/recurring/${ITEM_ID}`, body)
      expect(response.statusCode).toBe(400)
      expect(service.update).not.toHaveBeenCalled()
    })

    it.each([['2026-12-15'], [null]])(
      'passes the end date %j',
      async (endedOn) => {
        const response = await request('PATCH', `/recurring/${ITEM_ID}`, {
          endedOn,
        })
        expect(response.statusCode).toBe(200)
        expect(service.update).toHaveBeenCalledWith(ITEM_ID, { endedOn })
      },
    )

    it.each([
      [{ endedOn: '2026-02-30' }],
      [{ endedOn: '15/12/2026' }],
      [{ endedOn: '2026-12-15T00:00:00Z' }],
      [{ endedOn: 20261215 }],
    ])('rejects %j', async (body) => {
      const response = await request('PATCH', `/recurring/${ITEM_ID}`, body)
      expect(response.statusCode).toBe(400)
      expect(service.update).not.toHaveBeenCalled()
    })

    it('refuses a cancellation from an access token, not other edits', async () => {
      const headers = { authorization: `Bearer ${WRITE_TOKEN}` }
      for (const endedOn of ['2026-12-15', null]) {
        const refused = await request(
          'PATCH',
          `/recurring/${ITEM_ID}`,
          { endedOn },
          headers,
        )
        expect(refused.statusCode).toBe(403)
      }
      expect(service.update).not.toHaveBeenCalled()

      const allowed = await request(
        'PATCH',
        `/recurring/${ITEM_ID}`,
        { notes: 'ok' },
        headers,
      )
      expect(allowed.statusCode).toBe(200)
      expect(service.update).toHaveBeenCalledWith(ITEM_ID, { notes: 'ok' })
    })

    it('rejects an invalid id', async () => {
      const response = await request('PATCH', '/recurring/nope', {})
      expect(response.statusCode).toBe(400)
    })
  })
})
