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
import { cicCsv } from '#/imports/testing/cic-csv-fixture'
import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'
import { IMPORT_FILE_MAX_BYTES, registerMultipart } from './upload/multipart'

/**
 * The upload endpoint at the HTTP boundary: multipart parsing, field
 * validation, size and file-count limits, auth. The service is mocked; the
 * pipeline itself is covered by `imports.service.spec.ts`.
 */

const ACCOUNT_ID = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'
const IMPORT_ID = '0b5f6c1e-8a2d-4f3b-9c7e-abcdef012345'
const READ_TOKEN = `fin_pat_${'r'.repeat(43)}`
const WRITE_TOKEN = `fin_pat_${'w'.repeat(43)}`
const FILE = cicCsv([
  {
    date: '2026-10-01',
    amountCents: -1_000,
    label: 'PAIEMENT CB TEST',
    balanceCents: 0,
  },
])

type Part =
  | { name: string; value: string }
  | { name: string; filename: string; content: Buffer }

function multipart(parts: Part[]) {
  const boundary = '----finances-test-boundary'
  const chunks: Buffer[] = []
  for (const part of parts) {
    const disposition =
      'filename' in part
        ? `form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: text/csv`
        : `form-data; name="${part.name}"`
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: ${disposition}\r\n\r\n`,
      ),
      'filename' in part ? part.content : Buffer.from(part.value),
      Buffer.from('\r\n'),
    )
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}

describe('ImportsController (HTTP)', () => {
  let app: NestFastifyApplication
  let cookie: string
  const service = { preview: vi.fn(), commit: vi.fn(), remove: vi.fn() }
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
      controllers: [ImportsController],
      providers: [
        JwtGuard,
        { provide: AccessTokensService, useValue: accessTokens },
        { provide: ImportsService, useValue: service },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    )
    await app.register(fastifyCookie)
    await registerMultipart(app)
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
    service.preview.mockReset()
    service.preview.mockResolvedValue({ id: 'import-1' })
    service.commit.mockReset()
    service.commit.mockResolvedValue({ id: IMPORT_ID })
    service.remove.mockReset()
  })

  function upload(parts: Part[], headers: Record<string, string> = { cookie }) {
    const body = multipart(parts)
    return app.inject({
      method: 'POST',
      url: '/imports/preview',
      payload: body.payload,
      headers: { ...body.headers, ...headers },
    })
  }

  it('passes the file and fields to the service', async () => {
    const response = await upload([
      { name: 'accountId', value: ACCOUNT_ID },
      { name: 'file', filename: 'export.csv', content: FILE },
    ])

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ id: 'import-1' })
    expect(service.preview).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      source: undefined,
      fileName: 'export.csv',
      buffer: FILE,
    })
  })

  it('accepts the fields after the file and an explicit source', async () => {
    const response = await upload([
      { name: 'file', filename: 'export.csv', content: FILE },
      { name: 'accountId', value: ACCOUNT_ID },
      { name: 'source', value: 'cic_csv' },
    ])
    expect(response.statusCode).toBe(201)
    expect(service.preview).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'cic_csv' }),
    )
  })

  it('requires authentication', async () => {
    const response = await upload(
      [
        { name: 'accountId', value: ACCOUNT_ID },
        { name: 'file', filename: 'export.csv', content: FILE },
      ],
      {},
    )
    expect(response.statusCode).toBe(401)
    expect(service.preview).not.toHaveBeenCalled()
  })

  describe('with a personal access token (#103)', () => {
    const parts: Part[] = [
      { name: 'accountId', value: ACCOUNT_ID },
      { name: 'file', filename: 'export.csv', content: FILE },
    ]
    const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

    it('lets a write token upload a preview', async () => {
      const response = await upload(parts, bearer(WRITE_TOKEN))
      expect(response.statusCode).toBe(201)
      expect(service.preview).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: ACCOUNT_ID, buffer: FILE }),
      )
    })

    it('refuses a preview to a read token', async () => {
      const response = await upload(parts, bearer(READ_TOKEN))
      expect(response.statusCode).toBe(403)
      expect(service.preview).not.toHaveBeenCalled()
    })

    it('lets a write token commit and refuses a read token', async () => {
      const commit = (token: string) =>
        app.inject({
          method: 'POST',
          url: `/imports/${IMPORT_ID}/commit`,
          payload: {},
          headers: bearer(token),
        })
      expect((await commit(READ_TOKEN)).statusCode).toBe(403)
      expect(service.commit).not.toHaveBeenCalled()
      expect((await commit(WRITE_TOKEN)).statusCode).toBe(200)
      expect(service.commit).toHaveBeenCalledWith(IMPORT_ID, {})
    })

    it('never lets a token discard or undo an import', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/imports/${IMPORT_ID}`,
        headers: bearer(WRITE_TOKEN),
      })
      expect(response.statusCode).toBe(403)
      expect(service.remove).not.toHaveBeenCalled()
    })
  })

  it.each<[string, Part[], RegExp]>([
    [
      'the file is missing',
      [{ name: 'accountId', value: ACCOUNT_ID }],
      /file is required/,
    ],
    [
      'accountId is missing',
      [{ name: 'file', filename: 'export.csv', content: FILE }],
      /accountId must be a UUID/,
    ],
    [
      'accountId is not a UUID',
      [
        { name: 'accountId', value: 'nope' },
        { name: 'file', filename: 'export.csv', content: FILE },
      ],
      /accountId must be a UUID/,
    ],
    [
      'the source cannot be uploaded',
      [
        { name: 'accountId', value: ACCOUNT_ID },
        { name: 'source', value: 'spreadsheet' },
        { name: 'file', filename: 'export.csv', content: FILE },
      ],
      /source must be one of/,
    ],
    [
      'an unknown field is sent',
      [
        { name: 'accountId', value: ACCOUNT_ID },
        { name: 'extra', value: '1' },
        { name: 'file', filename: 'export.csv', content: FILE },
      ],
      /property extra should not exist/,
    ],
    [
      'the file uses another field name',
      [
        { name: 'accountId', value: ACCOUNT_ID },
        { name: 'upload', filename: 'export.csv', content: FILE },
      ],
      /send the file as "file"/,
    ],
    [
      'two files are sent',
      [
        { name: 'accountId', value: ACCOUNT_ID },
        { name: 'file', filename: 'a.csv', content: FILE },
        { name: 'file', filename: 'b.csv', content: FILE },
      ],
      /single file/,
    ],
  ])('answers 400 when %s', async (_case, parts, message) => {
    const response = await upload(parts)
    expect(response.statusCode).toBe(400)
    expect([response.json().message].flat().join('; ')).toMatch(message)
    expect(service.preview).not.toHaveBeenCalled()
  })

  it('answers 413 for a file over the size limit', async () => {
    const response = await upload([
      { name: 'accountId', value: ACCOUNT_ID },
      {
        name: 'file',
        filename: 'big.csv',
        content: Buffer.alloc(IMPORT_FILE_MAX_BYTES + 1, 0x41),
      },
    ])
    expect(response.statusCode).toBe(413)
    expect(response.json().message).toMatch(/5 MB/)
    expect(service.preview).not.toHaveBeenCalled()
  })

  it('answers 415 for a body that is not multipart', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/imports/preview',
      payload: { accountId: ACCOUNT_ID },
      headers: { cookie },
    })
    expect(response.statusCode).toBe(415)
  })
})
