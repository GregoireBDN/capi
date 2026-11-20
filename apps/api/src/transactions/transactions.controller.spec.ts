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
import { BULK_UPDATE_MAX_IDS } from './dto/transaction.dto'
import { ManualTransactionsService } from './manual-transactions.service'
import { TransactionsController } from './transactions.controller'
import { TransactionsService } from './transactions.service'

/**
 * The HTTP boundary: query and body validation, defaults, auth. The service
 * is mocked; its behaviour is covered by `transactions.service.spec.ts`.
 */

const ID = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'
const OTHER_ID = '3b9d2f1e-8c7a-4b6d-9e0f-abcdef012345'
// Synthetic personal access tokens, known only to the mocked service.
const READ_TOKEN = 'fin_pat_read-token-for-tests'
const WRITE_TOKEN = 'fin_pat_write-token-for-tests'

describe('TransactionsController (HTTP)', () => {
  let app: NestFastifyApplication
  let cookie: string
  const service = {
    list: vi.fn(),
    summary: vi.fn(),
    reviewCount: vi.fn(),
    update: vi.fn(),
    bulkUpdate: vi.fn(),
    split: vi.fn(),
    unsplit: vi.fn(),
    correct: vi.fn(),
    restoreBankValues: vi.fn(),
  }
  const manual = {
    suggestions: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }
  const accessTokens = {
    authenticate: (token: string) =>
      Promise.resolve(
        token === READ_TOKEN
          ? { id: 'tok-read', userId: 'user-1', scope: 'read' }
          : token === WRITE_TOKEN
            ? { id: 'tok-write', userId: 'user-1', scope: 'write' }
            : null,
      ),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [TransactionsController],
      providers: [
        JwtGuard,
        { provide: AccessTokensService, useValue: accessTokens },
        { provide: TransactionsService, useValue: service },
        { provide: ManualTransactionsService, useValue: manual },
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
    for (const fn of Object.values(manual)) fn.mockReset()
    manual.create.mockResolvedValue({ id: ID })
    manual.update.mockResolvedValue({ id: ID })
    manual.remove.mockResolvedValue(undefined)
    manual.suggestions.mockResolvedValue({ items: [], categoryIds: [] })
    service.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
    service.summary.mockResolvedValue({ count: 0 })
    service.reviewCount.mockResolvedValue(3)
    service.update.mockResolvedValue({ id: ID })
    service.bulkUpdate.mockResolvedValue({ updated: 1 })
  })

  function request(
    method: 'GET' | 'PATCH' | 'POST' | 'PUT' | 'DELETE',
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

    it('parses the sort, one-off and month filters', async () => {
      const response = await request(
        'GET',
        '/transactions?sort=amount_asc&isOneOff=false&month=2026-02',
      )

      expect(response.statusCode).toBe(200)
      expect(service.list).toHaveBeenCalledWith({
        sort: 'amount_asc',
        isOneOff: false,
        month: '2026-02',
      })
    })

    it('parses a comma-separated ids filter', async () => {
      const response = await request(
        'GET',
        `/transactions?ids=${ID},%20${OTHER_ID}`,
      )

      expect(response.statusCode).toBe(200)
      expect(service.list).toHaveBeenCalledWith({ ids: [ID, OTHER_ID] })
    })

    it.each([
      ['ids='],
      ['ids=nope'],
      [`ids=${Array.from({ length: 101 }, () => ID).join(',')}`],
      ['needsReview=yes'],
      ['isOneOff=1'],
      ['sort=amount'],
      ['month=2026-13'],
      ['month=2026-1'],
      ['month=2026-01-01'],
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

  describe('GET /transactions/summary', () => {
    it('parses the filters and returns the totals', async () => {
      const response = await request(
        'GET',
        `/transactions/summary?month=2026-02&accountId=${ID}&uncategorized=true&kind=expense&isOneOff=true&q=shop`,
      )

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ count: 0 })
      expect(service.summary).toHaveBeenCalledWith({
        month: '2026-02',
        accountId: ID,
        uncategorized: true,
        kind: 'expense',
        isOneOff: true,
        q: 'shop',
      })
    })

    it.each([['month=2026-00'], ['sort=date_desc'], ['page=2'], ['kind=x']])(
      'rejects %s',
      async (query) => {
        const response = await request('GET', `/transactions/summary?${query}`)
        expect(response.statusCode).toBe(400)
        expect(service.summary).not.toHaveBeenCalled()
      },
    )

    it('requires authentication', async () => {
      const response = await request(
        'GET',
        '/transactions/summary',
        undefined,
        {},
      )
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

  describe('manual transactions', () => {
    it('suggests labels for a kind, expense by default', async () => {
      manual.suggestions.mockResolvedValue({
        items: [{ label: 'Boulangerie', categoryId: ID }],
        categoryIds: [ID],
      })
      const response = await request('GET', '/transactions/manual/suggestions')
      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        items: [{ label: 'Boulangerie', categoryId: ID }],
        categoryIds: [ID],
      })
      expect(manual.suggestions).toHaveBeenLastCalledWith(undefined)

      await request('GET', '/transactions/manual/suggestions?kind=income')
      expect(manual.suggestions).toHaveBeenLastCalledWith('income')
    })

    it('refuses an unknown kind or another filter for suggestions', async () => {
      for (const query of ['kind=refund', 'q=ciné']) {
        const response = await request(
          'GET',
          `/transactions/manual/suggestions?${query}`,
        )
        expect(response.statusCode).toBe(400)
      }
      expect(manual.suggestions).not.toHaveBeenCalled()
    })

    it('notes an expense with only an amount and a category', async () => {
      const response = await request('POST', '/transactions/manual', {
        amountCents: 1250,
        categoryId: ID,
      })
      expect(response.statusCode).toBe(201)
      expect(manual.create).toHaveBeenCalledWith({
        amountCents: 1250,
        categoryId: ID,
      })
    })

    it('trims the label; an empty one is no label', async () => {
      await request('POST', '/transactions/manual', {
        amountCents: 1250,
        categoryId: ID,
        label: '  Cinéma ',
        bookingDate: '2026-11-02',
        accountId: OTHER_ID,
      })
      expect(manual.create).toHaveBeenLastCalledWith({
        amountCents: 1250,
        categoryId: ID,
        label: 'Cinéma',
        bookingDate: '2026-11-02',
        accountId: OTHER_ID,
      })
      await request('POST', '/transactions/manual', {
        amountCents: 1250,
        categoryId: ID,
        label: '   ',
      })
      expect(manual.create).toHaveBeenLastCalledWith({
        amountCents: 1250,
        categoryId: ID,
        label: null,
      })
    })

    it.each<[string, object]>([
      ['no amount', { categoryId: ID }],
      ['a zero amount', { amountCents: 0, categoryId: ID }],
      ['a negative amount', { amountCents: -100, categoryId: ID }],
      ['a decimal amount', { amountCents: 12.5, categoryId: ID }],
      ['an unknown kind', { amountCents: 100, kind: 'refund' }],
      ['an unknown direction', { amountCents: 100, direction: 'up' }],
      ['a non-boolean one-off flag', { amountCents: 100, isOneOff: 'yes' }],
      [
        'a bad date',
        { amountCents: 100, categoryId: ID, bookingDate: '2026-02-30' },
      ],
      [
        'a timestamp',
        {
          amountCents: 100,
          categoryId: ID,
          bookingDate: '2026-02-03T10:00:00Z',
        },
      ],
      ['an unknown field', { amountCents: 100, categoryId: ID, ruleId: ID }],
    ])('rejects %s', async (_name, body) => {
      const response = await request('POST', '/transactions/manual', body)
      expect(response.statusCode).toBe(400)
      expect(manual.create).not.toHaveBeenCalled()
    })

    it('edits and deletes by id', async () => {
      const patched = await request('PATCH', `/transactions/manual/${ID}`, {
        amountCents: 900,
        label: null,
      })
      expect(patched.statusCode).toBe(200)
      expect(manual.update).toHaveBeenCalledWith(ID, {
        amountCents: 900,
        label: null,
      })
      const deleted = await request('DELETE', `/transactions/manual/${ID}`)
      expect(deleted.statusCode).toBe(204)
      expect(manual.remove).toHaveBeenCalledWith(ID)
    })

    it('takes the kind, direction, one-off flag and note of any transaction', async () => {
      const body = {
        amountCents: 250_000,
        kind: 'income',
        direction: 'in',
        label: 'Prime',
        isOneOff: true,
        note: '  exceptionnelle ',
      }
      const response = await request('POST', '/transactions/manual', body)
      expect(response.statusCode).toBe(201)
      expect(manual.create).toHaveBeenCalledWith({
        ...body,
        note: 'exceptionnelle',
      })
    })

    it('rejects a null amount on edit', async () => {
      const response = await request('PATCH', `/transactions/manual/${ID}`, {
        amountCents: null,
      })
      expect(response.statusCode).toBe(400)
    })
  })

  describe('splits', () => {
    it('replaces the parts', async () => {
      const parts = [
        { categoryId: ID, amountCents: -3000 },
        { categoryId: OTHER_ID, amountCents: -1500 },
      ]
      const response = await request('PUT', `/transactions/${ID}/splits`, {
        parts,
      })
      expect(response.statusCode).toBe(200)
      expect(service.split).toHaveBeenCalledWith(ID, parts)
    })

    it.each<[string, object]>([
      ['one part', { parts: [{ categoryId: ID, amountCents: -100 }] }],
      [
        'a zero part',
        {
          parts: [
            { categoryId: ID, amountCents: 0 },
            { categoryId: OTHER_ID, amountCents: -100 },
          ],
        },
      ],
      [
        'a decimal part',
        {
          parts: [
            { categoryId: ID, amountCents: -1.5 },
            { categoryId: OTHER_ID, amountCents: -100 },
          ],
        },
      ],
      [
        'a part without category',
        {
          parts: [{ amountCents: -100 }, { categoryId: ID, amountCents: -1 }],
        },
      ],
    ])('rejects %s', async (_name, body) => {
      const response = await request('PUT', `/transactions/${ID}/splits`, body)
      expect(response.statusCode).toBe(400)
      expect(service.split).not.toHaveBeenCalled()
    })

    it('ends a split', async () => {
      const response = await request('DELETE', `/transactions/${ID}/splits`)
      expect(response.statusCode).toBe(200)
      expect(service.unsplit).toHaveBeenCalledWith(ID)
    })

    describe('with a personal access token (#357)', () => {
      const bearer = (token: string) => ({ authorization: `Bearer ${token}` })
      const parts = [
        { categoryId: ID, amountCents: 2000 },
        { categoryId: OTHER_ID, amountCents: 4000 },
      ]

      it('lets a write token split and refuses a read token', async () => {
        const split = (token: string) =>
          request('PUT', `/transactions/${ID}/splits`, { parts }, bearer(token))
        expect((await split(READ_TOKEN)).statusCode).toBe(403)
        expect(service.split).not.toHaveBeenCalled()
        expect((await split(WRITE_TOKEN)).statusCode).toBe(200)
        expect(service.split).toHaveBeenCalledWith(ID, parts)
      })

      it('never lets a token undo a split', async () => {
        for (const token of [READ_TOKEN, WRITE_TOKEN]) {
          const response = await request(
            'DELETE',
            `/transactions/${ID}/splits`,
            undefined,
            bearer(token),
          )
          expect(response.statusCode).toBe(403)
        }
        expect(service.unsplit).not.toHaveBeenCalled()
      })
    })
  })

  describe('corrections of imported rows', () => {
    it('corrects the amount and the date', async () => {
      const body = { amountCents: -4200, bookingDate: '2026-10-03' }
      const response = await request(
        'PUT',
        `/transactions/${ID}/correction`,
        body,
      )
      expect(response.statusCode).toBe(200)
      expect(service.correct).toHaveBeenCalledWith(ID, body)
    })

    it.each<[string, object]>([
      ['a zero amount', { amountCents: 0 }],
      ['a decimal amount', { amountCents: -1.5 }],
      ['a bad date', { bookingDate: '2026-02-30' }],
      ['a null date', { bookingDate: null }],
    ])('rejects %s', async (_name, body) => {
      const response = await request(
        'PUT',
        `/transactions/${ID}/correction`,
        body,
      )
      expect(response.statusCode).toBe(400)
      expect(service.correct).not.toHaveBeenCalled()
    })

    it('restores the bank values', async () => {
      const response = await request('DELETE', `/transactions/${ID}/correction`)
      expect(response.statusCode).toBe(200)
      expect(service.restoreBankValues).toHaveBeenCalledWith(ID)
    })
  })
})
