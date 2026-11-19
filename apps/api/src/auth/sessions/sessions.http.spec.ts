import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import * as bcrypt from 'bcryptjs'
import { JwtService } from '@nestjs/jwt'
import { eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '#/app.module'
import { refreshTokensTable } from '#/auth/auth.schema'
import { AccessTokensService } from '#/auth/access-tokens/access-tokens.service'
import { SESSION_MAX_LIFETIME_MS } from '#/auth/auth.constants'
import { createFastifyAdapter } from '#/config/fastify-adapter'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import { usersTable } from '#/user/user.schema'
import { REUSE_LISTED_FOR_MS } from './sessions.service'

/**
 * The owner's sessions (#217, ASVS 3.3.4) through the real Nest + Fastify
 * stack on the test database: one row per active refresh-token family with
 * its sign-in method and coarse device, the current one flagged, never a token
 * or a hash; ending one revokes its family (its next refresh fails), needs a
 * fresh session and stays out of reach of access tokens. Each test runs in a
 * rolled-back transaction.
 */

vi.mock('#/config/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/config/logger')>()
  return { ...actual, loggerParams: { pinoHttp: { level: 'silent' } } }
})

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')
const EMAIL = 'owner@example.test'
const PASSWORD = 'synthetic-password-1'
const DAY_MS = 24 * 60 * 60 * 1000
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1'
const LINUX_FIREFOX =
  'Mozilla/5.0 (X11; Linux x86_64; rv:145.0) Gecko/20100101 Firefox/145.0'

interface SessionRow {
  id: string
  signInMethod: string
  device: string | null
  signedInAt: string
  lastUsedAt: string
  expiresAt: string
  current: boolean
  reuseDetectedAt: string | null
}

describe.skipIf(!process.env.DATABASE_URL)('Sessions list (HTTP)', () => {
  let app: NestFastifyApplication
  let client: postgres.Sql
  let db: Db
  let currentTx: Db | undefined
  let passwordHash: string

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4)
    client = postgres(process.env.DATABASE_URL!, { max: 1 })
    db = drizzle(client, { schema })
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({
        get db() {
          if (!currentTx) throw new Error('No test transaction is open')
          return currentTx
        },
        ping: () => Promise.resolve(),
      })
      .compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter(),
      { logger: false },
    )
    await app.register(fastifyCookie)
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    app.setGlobalPrefix('api')
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app?.close()
    await client?.end()
  })

  let ipCounter = 0
  const nextIp = () => {
    ipCounter += 1
    return `198.19.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`
  }

  const send = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    {
      cookie,
      payload,
      userAgent,
      authorization,
    }: {
      cookie?: string
      payload?: object
      userAgent?: string
      authorization?: string
    } = {},
  ) =>
    app.inject({
      method,
      url,
      remoteAddress: nextIp(),
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(userAgent ? { 'user-agent': userAgent } : {}),
        ...(authorization ? { authorization } : {}),
      },
      payload,
    })

  /** The last cookie of that name (the first ones clear older cookies). */
  const cookieOf = (
    res: { cookies: { name: string; value: string }[] },
    name: string,
  ) => res.cookies.filter((c) => c.name === name && c.value).at(-1)?.value

  interface Session {
    access: string
    refresh: string
    cookie: string
  }

  async function signIn(userAgent?: string): Promise<Session> {
    const res = await send('POST', '/api/auth/login', {
      payload: { email: EMAIL, password: PASSWORD },
      userAgent,
    })
    expect(res.statusCode, res.body).toBe(200)
    const access = cookieOf(res, 'token')!
    const refresh = cookieOf(res, 'refresh_token')!
    return {
      access,
      refresh,
      cookie: `token=${access}; refresh_token=${refresh}`,
    }
  }

  const list = async (cookie: string) => {
    const res = await send('GET', '/api/auth/sessions', { cookie })
    expect(res.statusCode, res.body).toBe(200)
    return res.json<SessionRow[]>()
  }

  async function asOwner(fn: (tx: Db, userId: string) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        currentTx = tx
        const [owner] = await tx
          .insert(usersTable)
          .values({
            email: EMAIL,
            name: 'Owner Test',
            passwordHash,
            emailVerifiedAt: new Date(),
          })
          .returning({ id: usersTable.id })
        await fn(tx, owner!.id)
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
      .finally(() => {
        currentTx = undefined
      })
  }

  it('lists one row per signed-in device, the current one first, without any token', async () => {
    await asOwner(async () => {
      const phone = await signIn(IPHONE_SAFARI)
      const laptop = await signIn(LINUX_FIREFOX)

      const sessions = await list(laptop.cookie)

      expect(sessions).toHaveLength(2)
      expect(sessions[0]).toMatchObject({
        current: true,
        signInMethod: 'password',
        device: 'Firefox · Linux',
      })
      expect(sessions[1]).toMatchObject({
        current: false,
        device: 'Safari · iPhone',
      })
      for (const session of sessions) {
        expect(Object.keys(session).sort()).toEqual([
          'current',
          'device',
          'expiresAt',
          'id',
          'lastUsedAt',
          'reuseDetectedAt',
          'signInMethod',
          'signedInAt',
        ])
      }
      const body = JSON.stringify(sessions)
      expect(body).not.toContain(phone.refresh)
      expect(body).not.toContain(laptop.refresh)
    })
  })

  it('keeps a session as one row across refreshes and moves its last use', async () => {
    await asOwner(async (tx) => {
      const phone = await signIn(IPHONE_SAFARI)
      const before = await list(phone.cookie)
      // Pretend the sign-in happened an hour ago.
      await tx
        .update(refreshTokensTable)
        .set({ createdAt: new Date(Date.now() - 60 * 60 * 1000) })

      const refreshed = await send('POST', '/api/auth/refresh', {
        cookie: `refresh_token=${phone.refresh}`,
      })
      expect(refreshed.statusCode).toBe(200)
      const refresh = cookieOf(refreshed, 'refresh_token')!
      const access = cookieOf(refreshed, 'token')!

      const after = await list(`token=${access}; refresh_token=${refresh}`)
      expect(after).toHaveLength(1)
      expect(after[0]).toMatchObject({
        id: before[0]!.id,
        current: true,
        device: 'Safari · iPhone',
        signedInAt: before[0]!.signedInAt,
      })
      expect(Date.parse(after[0]!.lastUsedAt)).toBeGreaterThan(
        Date.now() - 60_000,
      )
    })
  })

  it('leaves out ended, expired and too old sessions', async () => {
    await asOwner(async (tx) => {
      const current = await signIn()
      const loggedOut = await signIn()
      await send('POST', '/api/auth/logout', {
        cookie: `refresh_token=${loggedOut.refresh}`,
      })
      const old = await signIn()
      const oldId = (await list(old.cookie)).find((s) => s.current)!.id
      await tx
        .update(refreshTokensTable)
        .set({
          authenticatedAt: new Date(
            Date.now() - SESSION_MAX_LIFETIME_MS - DAY_MS,
          ),
        })
        .where(eq(refreshTokensTable.familyId, oldId))

      const sessions = await list(current.cookie)

      expect(sessions.map((s) => s.current)).toEqual([true])
    })
  })

  it('lists a session ended by reuse detection for 30 days (#292)', async () => {
    await asOwner(async (tx) => {
      const current = await signIn(LINUX_FIREFOX)
      const phone = await signIn(IPHONE_SAFARI)
      const refresh = (token: string) =>
        send('POST', '/api/auth/refresh', { cookie: `refresh_token=${token}` })
      const next = cookieOf(await refresh(phone.refresh), 'refresh_token')!
      expect((await refresh(next)).statusCode).toBe(200)
      // The first token again, once its successor was used: reuse.
      expect((await refresh(phone.refresh)).statusCode).toBe(401)

      const sessions = await list(current.cookie)

      expect(sessions).toHaveLength(2)
      expect(sessions[0]).toMatchObject({
        current: true,
        reuseDetectedAt: null,
      })
      expect(sessions[1]).toMatchObject({
        current: false,
        device: 'Safari · iPhone',
        signInMethod: 'password',
      })
      expect(sessions[1]!.reuseDetectedAt).toEqual(sessions[1]!.expiresAt)
      expect(
        Date.now() - Date.parse(sessions[1]!.reuseDetectedAt!),
      ).toBeLessThan(60_000)
      // It is already ended: nothing to end.
      const end = await send(
        'DELETE',
        `/api/auth/sessions/${sessions[1]!.id}`,
        {
          cookie: current.cookie,
        },
      )
      expect(end.statusCode).toBe(404)

      await tx
        .update(refreshTokensTable)
        .set({ revokedAt: new Date(Date.now() - REUSE_LISTED_FOR_MS - DAY_MS) })
        .where(eq(refreshTokensTable.revokedReason, 'reuse'))
      expect((await list(current.cookie)).map((s) => s.current)).toEqual([true])
    })
  })

  it('ends another session: its next refresh fails, the current one stays', async () => {
    await asOwner(async () => {
      const phone = await signIn(IPHONE_SAFARI)
      const laptop = await signIn(LINUX_FIREFOX)
      const phoneId = (await list(laptop.cookie)).find((s) => !s.current)!.id

      const res = await send('DELETE', `/api/auth/sessions/${phoneId}`, {
        cookie: laptop.cookie,
      })

      expect(res.statusCode, res.body).toBe(204)
      const phoneRefresh = await send('POST', '/api/auth/refresh', {
        cookie: `refresh_token=${phone.refresh}`,
      })
      expect(phoneRefresh.statusCode).toBe(401)
      const sessions = await list(laptop.cookie)
      expect(sessions).toHaveLength(1)
      expect(sessions[0]!.current).toBe(true)
      const laptopRefresh = await send('POST', '/api/auth/refresh', {
        cookie: `refresh_token=${laptop.refresh}`,
      })
      expect(laptopRefresh.statusCode).toBe(200)
    })
  })

  it('answers 404 for an unknown or already ended session', async () => {
    await asOwner(async () => {
      const laptop = await signIn()
      const phone = await signIn()
      const phoneId = (await list(laptop.cookie)).find((s) => !s.current)!.id
      await send('POST', '/api/auth/logout', {
        cookie: `refresh_token=${phone.refresh}`,
      })

      for (const id of [phoneId, '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc']) {
        const res = await send('DELETE', `/api/auth/sessions/${id}`, {
          cookie: laptop.cookie,
        })
        expect(res.statusCode).toBe(404)
      }
    })
  })

  it('needs a fresh session to end one', async () => {
    await asOwner(async (_tx, userId) => {
      const laptop = await signIn()
      const phone = await signIn()
      const phoneId = (await list(laptop.cookie)).find((s) => !s.current)!.id
      const stale = app.get(JwtService).sign(
        {
          sub: userId,
          auth_time: Math.floor((Date.now() - DAY_MS) / 1000),
        },
        { expiresIn: 900 },
      )

      const res = await send('DELETE', `/api/auth/sessions/${phoneId}`, {
        cookie: `token=${stale}; refresh_token=${laptop.refresh}`,
      })

      expect(res.statusCode).toBe(403)
      expect(res.body).toContain('Recent authentication required')
      const phoneRefresh = await send('POST', '/api/auth/refresh', {
        cookie: `refresh_token=${phone.refresh}`,
      })
      expect(phoneRefresh.statusCode).toBe(200)
    })
  })

  it('refuses personal access tokens, even to list', async () => {
    await asOwner(async (_tx, userId) => {
      const laptop = await signIn()
      const phone = await signIn()
      const phoneId = (await list(laptop.cookie)).find((s) => !s.current)!.id
      const { token } = await app
        .get(AccessTokensService)
        .create(userId, { name: 'Script', scope: 'write' })

      const authorization = `Bearer ${token}`
      expect(
        (await send('GET', '/api/auth/sessions', { authorization })).statusCode,
      ).toBe(403)
      expect(
        (
          await send('DELETE', `/api/auth/sessions/${phoneId}`, {
            authorization,
          })
        ).statusCode,
      ).toBe(403)
      expect(phone.refresh).toBeTruthy()
    })
  })

  it('needs a session to list', async () => {
    const res = await send('GET', '/api/auth/sessions')
    expect(res.statusCode).toBe(401)
  })
})
