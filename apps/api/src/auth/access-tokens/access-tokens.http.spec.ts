import fastifyCookie from '@fastify/cookie'
import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
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
import { CurrentUser } from '#/auth/decorators/current-user.decorator'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { AccessTokenAuditHook } from './access-token-audit.hook'
import { AccessTokensController } from './access-tokens.controller'
import { AccessTokensService } from './access-tokens.service'
import { TokenAccess } from './token-access.decorator'

const READ_TOKEN = `fin_pat_${'r'.repeat(43)}`
const WRITE_TOKEN = `fin_pat_${'w'.repeat(43)}`

@UseGuards(JwtGuard)
@Controller('things')
class ThingsController {
  @Get()
  list(@CurrentUser() user: { sub: string }) {
    return { owner: user.sub }
  }

  @Post('preview')
  @TokenAccess('read')
  preview() {
    return { ok: true }
  }

  @Patch(':id')
  @TokenAccess('write')
  update(@Param('id') id: string) {
    return { id }
  }

  @Delete(':id')
  remove() {
    return { ok: true }
  }
}

/**
 * Bearer tokens through the real Nest + Fastify stack: route metadata, the
 * token-management lock-out and the audit hook. The token store is stubbed.
 */
describe('Personal access tokens (HTTP)', () => {
  let app: NestFastifyApplication
  let cookie: string
  const service = {
    authenticate: vi.fn((token: string) =>
      Promise.resolve(
        token === READ_TOKEN
          ? { id: 'tok-read', userId: 'user-1', scope: 'read' }
          : token === WRITE_TOKEN
            ? { id: 'tok-write', userId: 'user-1', scope: 'write' }
            : null,
      ),
    ),
    recordUse: vi.fn(() => Promise.resolve()),
    list: vi.fn(() => Promise.resolve([])),
    create: vi.fn(),
    revoke: vi.fn(),
    audit: vi.fn(),
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [ThingsController, AccessTokensController],
      providers: [
        JwtGuard,
        AccessTokenAuditHook,
        { provide: AccessTokensService, useValue: service },
      ],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    )
    await app.register(fastifyCookie)
    app.setGlobalPrefix('api')
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    cookie = `token=${app.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    service.recordUse.mockClear()
  })

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    token?: string,
  ) =>
    app.inject({
      method,
      url,
      headers: token ? { authorization: `Bearer ${token}` } : { cookie },
    })

  it.each([
    ['GET', '/api/things', 200, READ_TOKEN],
    ['POST', '/api/things/preview', 201, READ_TOKEN],
    ['PATCH', '/api/things/1', 403, READ_TOKEN],
    ['PATCH', '/api/things/1', 200, WRITE_TOKEN],
    ['DELETE', '/api/things/1', 403, WRITE_TOKEN],
    ['GET', '/api/access-tokens', 403, WRITE_TOKEN],
    ['POST', '/api/access-tokens', 403, WRITE_TOKEN],
    ['GET', '/api/things', 401, `fin_pat_${'x'.repeat(43)}`],
  ] as const)('%s %s with a token → %i', async (method, url, status, token) => {
    const response = await call(method, url, token)
    expect(response.statusCode).toBe(status)
  })

  it('resolves the token owner as the current user', async () => {
    const response = await call('GET', '/api/things', READ_TOKEN)
    expect(response.json()).toEqual({ owner: 'user-1' })
  })

  it('keeps every route available to the session cookie', async () => {
    expect((await call('DELETE', '/api/things/1')).statusCode).toBe(200)
    expect((await call('GET', '/api/access-tokens')).statusCode).toBe(200)
  })

  it('audits token calls with the route pattern, refused ones included', async () => {
    await call('PATCH', '/api/things/42?search=private', READ_TOKEN)
    await call('GET', '/api/things', READ_TOKEN)
    await call('GET', '/api/things')

    // onResponse runs after the reply is sent: wait for it.
    await vi.waitFor(() => expect(service.recordUse).toHaveBeenCalledTimes(2))
    expect(service.recordUse).toHaveBeenCalledWith({
      tokenId: 'tok-read',
      method: 'PATCH',
      route: '/api/things/:id',
      statusCode: 403,
    })
    expect(service.recordUse).toHaveBeenCalledWith({
      tokenId: 'tok-read',
      method: 'GET',
      route: '/api/things',
      statusCode: 200,
    })
  })
})
