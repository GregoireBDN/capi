import fastifyCookie from '@fastify/cookie'
import { Controller, Get, Res, UseGuards } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import type { FastifyReply } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { JWT_GUARD_TEST_PROVIDERS } from '#/auth/guards/jwt-guard.testing'
import { registerNoStoreHeaders } from './no-store'

@Controller('probe')
class ProbeController {
  @Get('public')
  open() {
    return { ok: true }
  }

  @Get('private')
  @UseGuards(JwtGuard)
  mine() {
    return { balance: 0 }
  }

  @Get('cacheable')
  cacheable(@Res() reply: FastifyReply) {
    return reply
      .header('cache-control', 'public, max-age=3600')
      .send({ ok: true })
  }
}

describe('no-store headers on every /api response', () => {
  let app: NestFastifyApplication
  let cookie: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      controllers: [ProbeController],
      providers: JWT_GUARD_TEST_PROVIDERS,
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    )
    registerNoStoreHeaders(app.getHttpAdapter().getInstance())
    await app.register(fastifyCookie)
    app.setGlobalPrefix('api')
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    cookie = `token=${app.get(JwtService).sign({ sub: 'user-1' })}`
  })

  afterAll(async () => {
    await app.close()
  })

  it.each([
    ['an authenticated response', '/api/probe/private', true, 200],
    ['a public response', '/api/probe/public', false, 200],
    ['a 401', '/api/probe/private', false, 401],
    ['a 404', '/api/nope', false, 404],
    ['a handler asking for caching', '/api/probe/cacheable', false, 200],
  ])('sets them on %s', async (_label, url, signedIn, status) => {
    const headers = signedIn ? { cookie } : {}
    const response = await app.inject({ method: 'GET', url, headers })

    expect(response.statusCode).toBe(status)
    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers.pragma).toBe('no-cache')
    expect(response.headers.expires).toBe('0')
  })
})
