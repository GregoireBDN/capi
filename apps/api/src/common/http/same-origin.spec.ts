import fastifyCookie from '@fastify/cookie'
import {
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { IsString } from 'class-validator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccessTokensService } from '#/auth/access-tokens/access-tokens.service'
import { TokenAccess } from '#/auth/access-tokens/token-access.decorator'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import {
  CROSS_ORIGIN_MESSAGE,
  addressedOrigin,
  appOrigins,
  isCrossOriginWrite,
  registerSameOriginCheck,
} from './same-origin'

/**
 * Same-site request forgery on cookie-authenticated `/api` writes (#179): a
 * page on a sibling subdomain can send the owner's `SameSite=Lax` cookies
 * with a form post, so unsafe requests from another origin are refused.
 */

const APP = 'https://capi.example.test'
const PASSKEY_ORIGIN = 'https://app.capi.example.test'
const SIBLING = 'https://portal.example.test'
const ELSEWHERE = 'https://attacker.example.net'
const WRITE_TOKEN = 'fin_pat_synthetic-write-token'

class NoteDto {
  @IsString()
  note!: string
}

@Controller('probe')
@UseGuards(JwtGuard)
class ProbeController {
  /** Bodiless write, like valuating crypto or closing a month. */
  @Post('valuate')
  @HttpCode(200)
  valuate() {
    return { ok: true }
  }

  /** JSON write open to `write` tokens, like a manual transaction. */
  @Post('note')
  @HttpCode(201)
  @TokenAccess('write')
  note(@Body() body: NoteDto) {
    return { note: body.note }
  }
}

describe('isCrossOriginWrite', () => {
  const allowed = new Set([APP])
  const check = (method: string, headers: Record<string, string>) =>
    isCrossOriginWrite({ method, headers }, allowed)

  it.each([
    ['same-origin fetch', { 'sec-fetch-site': 'same-origin', origin: APP }],
    ['the app origin without Sec-Fetch-Site', { origin: APP }],
    // The app origin calling the API origin directly (dev without proxy).
    [
      'the app origin, same-site fetch',
      { 'sec-fetch-site': 'same-site', origin: APP },
    ],
    [
      'a same-origin fetch from another host name',
      { 'sec-fetch-site': 'same-origin', origin: 'http://192.168.1.20:3000' },
    ],
    ['a user-initiated request', { 'sec-fetch-site': 'none' }],
    ['no browser header (SSR, scripts)', {}],
    [
      'a bearer token from anywhere',
      {
        authorization: `Bearer ${WRITE_TOKEN}`,
        origin: ELSEWHERE,
        'sec-fetch-site': 'cross-site',
      },
    ],
  ])('lets %s through', (_label, headers) => {
    expect(check('POST', headers)).toBe(false)
  })

  it.each([
    ['a same-site page', { 'sec-fetch-site': 'same-site', origin: SIBLING }],
    [
      'a cross-site page',
      { 'sec-fetch-site': 'cross-site', origin: ELSEWHERE },
    ],
    ['a same-site fetch without Origin', { 'sec-fetch-site': 'same-site' }],
    ['another Origin without Sec-Fetch-Site', { origin: SIBLING }],
    ['an opaque Origin', { origin: 'null' }],
    [
      'another scheme in Authorization',
      { authorization: 'Basic abc', origin: SIBLING },
    ],
  ])('refuses %s', (_label, headers) => {
    expect(check('POST', headers)).toBe(true)
  })

  it.each(['PUT', 'PATCH', 'DELETE', 'post'])('checks %s', (method) => {
    expect(check(method, { origin: SIBLING })).toBe(true)
  })

  it.each(['GET', 'HEAD', 'OPTIONS'])('never checks %s', (method) => {
    expect(
      check(method, { 'sec-fetch-site': 'cross-site', origin: ELSEWHERE }),
    ).toBe(false)
  })
})

describe('isCrossOriginWrite from the dev server at a LAN address (#339)', () => {
  const LAN = 'http://192.168.1.20:3000'
  // What the browser sends over plain HTTP (no Sec-Fetch-*), as the web
  // proxy forwards it.
  const throughProxy = (origin: string) => ({
    origin,
    host: 'localhost:4000',
    'x-forwarded-host': '192.168.1.20:3000',
    'x-forwarded-proto': 'http',
  })
  const allowed = new Set(['http://localhost:3000'])

  it('lets the page through outside production', () => {
    expect(
      isCrossOriginWrite(
        { method: 'POST', headers: throughProxy(LAN) },
        allowed,
        true,
      ),
    ).toBe(false)
  })

  it('still refuses it in production', () => {
    expect(
      isCrossOriginWrite(
        { method: 'POST', headers: throughProxy(LAN) },
        allowed,
        false,
      ),
    ).toBe(true)
  })

  it('still refuses a page on another origin', () => {
    expect(
      isCrossOriginWrite(
        { method: 'POST', headers: throughProxy('http://192.168.1.66:8080') },
        allowed,
        true,
      ),
    ).toBe(true)
    expect(
      isCrossOriginWrite(
        {
          method: 'POST',
          headers: { ...throughProxy(SIBLING), 'sec-fetch-site': 'same-site' },
        },
        allowed,
        true,
      ),
    ).toBe(true)
  })

  it('compares with Host when no proxy forwarded one', () => {
    expect(
      isCrossOriginWrite(
        {
          method: 'POST',
          headers: {
            origin: 'http://192.168.1.20:4000',
            host: '192.168.1.20:4000',
          },
        },
        allowed,
        true,
      ),
    ).toBe(false)
  })
})

describe('addressedOrigin', () => {
  it('prefers the forwarded host and scheme', () => {
    expect(
      addressedOrigin({
        host: 'api:4000',
        'x-forwarded-host': 'capi.example.test',
        'x-forwarded-proto': 'https',
      }),
    ).toBe('https://capi.example.test')
    expect(addressedOrigin({ host: 'localhost:4000' })).toBe(
      'http://localhost:4000',
    )
    expect(addressedOrigin({})).toBeUndefined()
  })
})

describe('appOrigins', () => {
  it('holds the APP_URL origin', () => {
    expect(appOrigins().has('http://localhost:3000')).toBe(true)
  })
})

describe('same-origin check on /api writes (HTTP)', () => {
  let app: NestFastifyApplication
  let cookie: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [ProbeController],
      providers: [
        JwtGuard,
        {
          provide: AccessTokensService,
          useValue: {
            authenticate: (token: string) =>
              Promise.resolve(
                token === WRITE_TOKEN
                  ? { id: 'pat-1', scope: 'write', userId: 'user-1' }
                  : null,
              ),
          },
        },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
      { logger: false },
    )
    registerSameOriginCheck(
      app.getHttpAdapter().getInstance(),
      new Set([APP, PASSKEY_ORIGIN]),
    )
    await app.register(fastifyCookie)
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }))
    app.setGlobalPrefix('api')
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    cookie = `token=${app.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(async () => {
    await app.close()
  })

  function post(
    url: string,
    headers: Record<string, string>,
    payload?: string,
  ) {
    return app.inject({ method: 'POST', url, headers, payload })
  }

  it('accepts a same-origin write from the app', async () => {
    const response = await post('/api/probe/valuate', {
      cookie,
      origin: APP,
      'sec-fetch-site': 'same-origin',
    })
    expect(response.statusCode).toBe(200)
  })

  it('accepts the dev server at a LAN address through the proxy (#339)', async () => {
    const response = await post('/api/probe/valuate', {
      cookie,
      origin: 'http://192.168.1.20:3000',
      'x-forwarded-host': '192.168.1.20:3000',
      'x-forwarded-proto': 'http',
    })
    expect(response.statusCode).toBe(200)
  })

  it('still refuses another LAN page with the same forwarded host', async () => {
    const response = await post('/api/probe/valuate', {
      cookie,
      origin: 'http://192.168.1.66:8080',
      'x-forwarded-host': '192.168.1.20:3000',
      'x-forwarded-proto': 'http',
    })
    expect(response.statusCode).toBe(403)
  })

  it('accepts the passkey origin', async () => {
    const response = await post('/api/probe/valuate', {
      cookie,
      origin: PASSKEY_ORIGIN,
    })
    expect(response.statusCode).toBe(200)
  })

  it('accepts a cookie write without browser headers (SSR, server functions)', async () => {
    const response = await post('/api/probe/valuate', { cookie })
    expect(response.statusCode).toBe(200)
  })

  it.each([
    ['same-site', SIBLING],
    ['cross-site', ELSEWHERE],
  ])('refuses a %s bodiless form post with 403', async (site, origin) => {
    const response = await post('/api/probe/valuate', {
      cookie,
      origin,
      'sec-fetch-site': site,
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({
      statusCode: 403,
      error: 'Forbidden',
      message: [CROSS_ORIGIN_MESSAGE],
      path: '/api/probe/valuate',
    })
    expect(response.json().requestId).toEqual(expect.any(String))
  })

  it('refuses a same-site multipart post before reading its body', async () => {
    const boundary = 'synthetic-boundary'
    const response = await post(
      '/api/probe/valuate',
      {
        cookie,
        origin: SIBLING,
        'sec-fetch-site': 'same-site',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.csv"\r\n\r\nx\r\n--${boundary}--\r\n`,
    )
    expect(response.statusCode).toBe(403)
  })

  it('refuses a foreign Origin from a browser without Sec-Fetch-Site', async () => {
    const response = await post('/api/probe/valuate', {
      cookie,
      origin: SIBLING,
    })
    expect(response.statusCode).toBe(403)
  })

  it('lets a bearer-token write through whatever its headers (MCP server)', async () => {
    const response = await post(
      '/api/probe/note',
      {
        authorization: `Bearer ${WRITE_TOKEN}`,
        origin: ELSEWHERE,
        'sec-fetch-site': 'cross-site',
        'content-type': 'application/json',
      },
      '{"note":"synthetic"}',
    )
    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({ note: 'synthetic' })
  })

  it('leaves requests without these headers and without cookies to the guard', async () => {
    const response = await post('/api/probe/valuate', {})
    expect(response.statusCode).toBe(401)
  })

  it('does not check reads', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/probe/valuate',
      headers: { cookie, origin: SIBLING, 'sec-fetch-site': 'same-site' },
    })
    expect(response.statusCode).toBe(404)
  })
})
