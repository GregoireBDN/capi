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
import { registerMultipart } from '#/imports/upload/multipart'
import {
  AccountCryptoImportsController,
  CryptoImportsController,
} from './crypto-imports.controller'
import { CryptoImportsService } from './crypto-imports.service'
import { BINANCE_EARLY, binanceCsv } from './testing/crypto-fixtures'

/**
 * The exchange import endpoints at the HTTP boundary: multipart parsing,
 * body validation, auth. The service is mocked; the pipeline itself is
 * covered by `crypto-imports.service.spec.ts`.
 */

const ACCOUNT_ID = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'
const IMPORT_ID = '8e1d6b8f-3e2c-4d4b-8f9a-23456789abcd'
const FILE = Buffer.from(binanceCsv(BINANCE_EARLY))

function multipart(
  parts: { name: string; filename?: string; content: Buffer }[],
) {
  const boundary = '----finances-test-boundary'
  const chunks: Buffer[] = []
  for (const part of parts) {
    const disposition = part.filename
      ? `form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: text/csv`
      : `form-data; name="${part.name}"`
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: ${disposition}\r\n\r\n`,
      ),
      part.content,
      Buffer.from('\r\n'),
    )
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  }
}

describe('CryptoImportsController (HTTP)', () => {
  let app: NestFastifyApplication
  let cookie: string
  const service = { preview: vi.fn(), commit: vi.fn(), remove: vi.fn() }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [AccountCryptoImportsController, CryptoImportsController],
      providers: [
        ...JWT_GUARD_TEST_PROVIDERS,
        { provide: CryptoImportsService, useValue: service },
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
    for (const fn of Object.values(service)) {
      fn.mockReset()
      fn.mockResolvedValue({ id: IMPORT_ID })
    }
  })

  const upload = (
    parts: Parameters<typeof multipart>[0],
    headers: Record<string, string> = { cookie },
  ) => {
    const body = multipart(parts)
    return app.inject({
      method: 'POST',
      url: `/accounts/${ACCOUNT_ID}/crypto-imports`,
      payload: body.payload,
      headers: { ...body.headers, ...headers },
    })
  }

  it('passes the file to the service', async () => {
    const response = await upload([
      { name: 'file', filename: 'binance.csv', content: FILE },
    ])
    expect(response.statusCode).toBe(201)
    expect(service.preview).toHaveBeenCalledWith({
      accountId: ACCOUNT_ID,
      fileName: 'binance.csv',
      buffer: FILE,
    })
  })

  it('requires authentication, the file and nothing else', async () => {
    const anonymous = await upload(
      [{ name: 'file', filename: 'binance.csv', content: FILE }],
      {},
    )
    expect(anonymous.statusCode).toBe(401)
    const missing = await upload([
      { name: 'accountId', content: Buffer.from(ACCOUNT_ID) },
    ])
    expect(missing.statusCode).toBe(400)
    const extra = await upload([
      { name: 'file', filename: 'binance.csv', content: FILE },
      { name: 'note', content: Buffer.from('x') },
    ])
    expect(extra.statusCode).toBe(400)
    expect(service.preview).not.toHaveBeenCalled()
  })

  it('validates the asset choices of a commit', async () => {
    const commit = (payload: unknown) =>
      app.inject({
        method: 'POST',
        url: `/crypto-imports/${IMPORT_ID}/commit`,
        payload: payload as object,
        headers: { cookie },
      })
    expect((await commit({})).statusCode).toBe(200)
    const choice = {
      ticker: 'XYZ',
      assetId: 'xyz-token',
      symbol: 'XYZ',
      name: 'XYZ',
    }
    expect((await commit({ assets: [choice] })).statusCode).toBe(200)
    expect(service.commit).toHaveBeenLastCalledWith(IMPORT_ID, {
      assets: [choice],
    })
    for (const bad of [
      { assets: [{ ...choice, assetId: 'Not An Id' }] },
      { assets: [{ ...choice, ticker: '' }] },
      { other: true },
    ]) {
      expect((await commit(bad)).statusCode).toBe(400)
    }
    expect(service.commit).toHaveBeenCalledTimes(2)
  })

  it('discards or undoes an import', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/crypto-imports/${IMPORT_ID}`,
      headers: { cookie },
    })
    expect(response.statusCode).toBe(200)
    expect(service.remove).toHaveBeenCalledWith(IMPORT_ID)
  })
})
