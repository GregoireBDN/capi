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
import { EnvelopesController } from './envelopes.controller'
import { EnvelopesService } from './envelopes.service'

/**
 * The HTTP boundary of envelopes for tokens (#518): a `write` token may
 * create an envelope and add to one from « libre », nothing else. The service
 * is mocked; its rules are covered by `envelopes.service.spec.ts`.
 */

const ID = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'
const ACCOUNT_ID = '3b9d2f1e-8c7a-4b6d-9e0f-abcdef012345'
// Synthetic personal access tokens, known only to the mocked service.
const READ_TOKEN = 'fin_pat_read-token-for-tests'
const WRITE_TOKEN = 'fin_pat_write-token-for-tests'

describe('EnvelopesController (HTTP, tokens)', () => {
  let app: NestFastifyApplication
  let cookie: string
  const service = {
    create: vi.fn(),
    topUp: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    move: vi.fn(),
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
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [EnvelopesController],
      providers: [
        JwtGuard,
        { provide: AccessTokensService, useValue: accessTokens },
        { provide: EnvelopesService, useValue: service },
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
    service.create.mockResolvedValue({ id: ID })
    service.topUp.mockResolvedValue({ accountId: ACCOUNT_ID })
  })

  function request(
    method: 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload: object | undefined,
    headers: Record<string, string>,
  ) {
    return app.inject({ method, url, payload, headers })
  }

  const envelope = {
    name: 'Voyage test',
    targetCents: 240_000,
    dueDate: '2027-06-15',
    start: [{ accountId: ACCOUNT_ID, amountCents: 30_000 }],
  }
  const topUp = { accountId: ACCOUNT_ID, amountCents: 20_000 }

  it('lets a write token create an envelope and refuses a read token', async () => {
    const create = (token: string) =>
      request('POST', '/envelopes', envelope, bearer(token))
    expect((await create(READ_TOKEN)).statusCode).toBe(403)
    expect(service.create).not.toHaveBeenCalled()
    expect((await create(WRITE_TOKEN)).statusCode).toBe(201)
    expect(service.create).toHaveBeenCalledWith(envelope)
  })

  it('lets a write token add to an envelope from « libre » and refuses a read token', async () => {
    const add = (token: string) =>
      request('POST', `/envelopes/${ID}/top-up`, topUp, bearer(token))
    expect((await add(READ_TOKEN)).statusCode).toBe(403)
    expect(service.topUp).not.toHaveBeenCalled()
    expect((await add(WRITE_TOKEN)).statusCode).toBe(200)
    expect(service.topUp).toHaveBeenCalledWith(ID, topUp)
  })

  it('refuses what the envelope rules forbid before the service runs', async () => {
    for (const [url, body] of [
      ['/envelopes', { name: '   ' }],
      ['/envelopes', { name: 'Voyage test', targetCents: 0 }],
      ['/envelopes', { name: 'Voyage test', dueDate: '2027-02-30' }],
      [
        '/envelopes',
        {
          name: 'Voyage test',
          start: [{ accountId: ACCOUNT_ID, amountCents: 0 }],
        },
      ],
      [`/envelopes/${ID}/top-up`, { accountId: ACCOUNT_ID, amountCents: -100 }],
      [
        `/envelopes/${ID}/top-up`,
        { accountId: 'not-a-uuid', amountCents: 100 },
      ],
      [`/envelopes/${ID}/top-up`, { ...topUp, fromEnvelopeId: ID }],
    ] as const) {
      const response = await request('POST', url, body, bearer(WRITE_TOKEN))
      expect(response.statusCode, `${url} ${JSON.stringify(body)}`).toBe(400)
    }
    expect(service.create).not.toHaveBeenCalled()
    expect(service.topUp).not.toHaveBeenCalled()
  })

  it('never lets a token change, delete or take money out of an envelope', async () => {
    for (const token of [READ_TOKEN, WRITE_TOKEN]) {
      const responses = await Promise.all([
        request('PATCH', `/envelopes/${ID}`, { name: 'x' }, bearer(token)),
        request('DELETE', `/envelopes/${ID}`, undefined, bearer(token)),
        request(
          'POST',
          '/envelopes/moves',
          {
            accountId: ACCOUNT_ID,
            fromEnvelopeId: ID,
            toEnvelopeId: null,
            amountCents: 100,
          },
          bearer(token),
        ),
      ])
      expect(responses.map((r) => r.statusCode)).toEqual([403, 403, 403])
    }
    expect(service.update).not.toHaveBeenCalled()
    expect(service.remove).not.toHaveBeenCalled()
    expect(service.move).not.toHaveBeenCalled()
  })

  it('still lets the session create and add', async () => {
    expect(
      (await request('POST', '/envelopes', envelope, { cookie })).statusCode,
    ).toBe(201)
    expect(
      (await request('POST', `/envelopes/${ID}/top-up`, topUp, { cookie }))
        .statusCode,
    ).toBe(200)
  })
})
