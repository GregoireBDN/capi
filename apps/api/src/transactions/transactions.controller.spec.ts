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
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { BULK_UPDATE_MAX_IDS } from './dto/transaction.dto'
import { TransactionsController } from './transactions.controller'
import { TransactionsService } from './transactions.service'

/**
 * The HTTP boundary: query and body validation, defaults, auth. The service
 * is mocked; its behaviour is covered by `transactions.service.spec.ts`.
 */

const ID = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'
const OTHER_ID = '3b9d2f1e-8c7a-4b6d-9e0f-abcdef012345'

describe('TransactionsController (HTTP)', () => {
  let app: NestFastifyApplication
  let cookie: string
  const service = {
    list: vi.fn(),
    reviewCount: vi.fn(),
    update: vi.fn(),
    bulkUpdate: vi.fn(),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [TransactionsController],
      providers: [
        JwtGuard,
        { provide: TransactionsService, useValue: service },
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
    service.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    service.reviewCount.mockResolvedValue(3)
    service.update.mockResolvedValue({ id: ID })
    service.bulkUpdate.mockResolvedValue({ updated: 1 })
  })

  function request(
    method: 'GET' | 'PATCH' | 'POST',
    url: string,
    payload?: object,
    headers: Record<string, string> = { cookie },
  ) {
    return app.inject({ method, url, payload, headers })
  }

  describe('GET /transactions', () => {
    it('parses filters and pagination from the query string', async () => {
      const response = await request(
        'GET',
        `/transactions?needsReview=true&uncategorized=false&accountId=${ID}&kind=transfer&from=2026-01-01&to=2026-01-31&q=%20shop%20&page=2&limit=50`,
      )

      expect(response.statusCode).toBe(200)
      expect(service.list).toHaveBeenCalledWith({
        needsReview: true,
        uncategorized: false,
        accountId: ID,
        kind: 'transfer',
        from: '2026-01-01',
        to: '2026-01-31',
        q: 'shop',
        page: 2,
        limit: 50,
      })
    })

    it.each([
      ['needsReview=yes'],
      ['accountId=not-a-uuid'],
      ['kind=refund'],
      ['from=01/01/2026'],
      ['to=2026-02-30'],
      ['page=0'],
      ['limit=101'],
      ['limit=abc'],
      ['unknown=1'],
    ])('rejects %s', async (query) => {
      const response = await request('GET', `/transactions?${query}`)
      expect(response.statusCode).toBe(400)
      expect(service.list).not.toHaveBeenCalled()
    })

    it('requires authentication', async () => {
      const response = await request('GET', '/transactions', undefined, {})
      expect(response.statusCode).toBe(401)
    })
  })

  it('GET /transactions/review-count returns the count', async () => {
    const response = await request('GET', '/transactions/review-count')
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ count: 3 })
  })

  describe('PATCH /transactions/:id', () => {
    it('passes the validated changes', async () => {
      const response = await request('PATCH', `/transactions/${ID}`, {
        categoryId: OTHER_ID,
        kind: 'transfer',
        isOneOff: true,
        note: '  ',
      })

      expect(response.statusCode).toBe(200)
      expect(service.update).toHaveBeenCalledWith(ID, {
        categoryId: OTHER_ID,
        kind: 'transfer',
        isOneOff: true,
        note: null,
      })
    })

    it('accepts null to remove the category', async () => {
      const response = await request('PATCH', `/transactions/${ID}`, {
        categoryId: null,
      })
      expect(response.statusCode).toBe(200)
      expect(service.update).toHaveBeenCalledWith(ID, { categoryId: null })
    })

    it.each<[string, object]>([
      ['a bad category id', { categoryId: 'groceries' }],
      ['an unknown kind', { kind: 'refund' }],
      ['a null kind', { kind: null }],
      ['a non-boolean review flag', { needsReview: 'false' }],
      ['an unknown field', { ruleIds: [] }],
      ['a read-only field', { amountCents: 0 }],
    ])('rejects %s', async (_name, body) => {
      const response = await request('PATCH', `/transactions/${ID}`, body)
      expect(response.statusCode).toBe(400)
      expect(service.update).not.toHaveBeenCalled()
    })

    it('rejects a malformed id', async () => {
      const response = await request('PATCH', '/transactions/42', {
        needsReview: false,
      })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('POST /transactions/bulk-update', () => {
    it('passes ids and changes', async () => {
      const response = await request('POST', '/transactions/bulk-update', {
        ids: [ID, OTHER_ID],
        needsReview: false,
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ updated: 1 })
      expect(service.bulkUpdate).toHaveBeenCalledWith({
        ids: [ID, OTHER_ID],
        needsReview: false,
      })
    })

    it.each<[string, object]>([
      ['no ids', { ids: [], needsReview: false }],
      ['duplicate ids', { ids: [ID, ID], needsReview: false }],
      ['a malformed id', { ids: ['nope'], needsReview: false }],
      [
        'too many ids',
        {
          ids: Array.from(
            { length: BULK_UPDATE_MAX_IDS + 1 },
            (_, i) =>
              `00000000-0000-4000-8000-${i.toString().padStart(12, '0')}`,
          ),
          needsReview: false,
        },
      ],
      ['a note (single updates only)', { ids: [ID], note: 'x' }],
    ])('rejects %s', async (_name, body) => {
      const response = await request('POST', '/transactions/bulk-update', body)
      expect(response.statusCode).toBe(400)
      expect(service.bulkUpdate).not.toHaveBeenCalled()
    })
  })
})
