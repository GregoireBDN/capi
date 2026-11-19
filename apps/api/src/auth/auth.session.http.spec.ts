import fastifyCookie from '@fastify/cookie'
import { Logger, ValidationPipe } from '@nestjs/common'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import * as bcrypt from 'bcryptjs'
import { eq, isNull } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '#/app.module'
import { refreshTokensTable } from '#/auth/auth.schema'
import {
  SESSION_MAX_LIFETIME_MS,
  SESSION_REFRESH_REUSE_GRACE_MS,
} from '#/auth/auth.constants'
import { createFastifyAdapter } from '#/config/fastify-adapter'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import { usersTable } from '#/user/user.schema'

/**
 * Session lifetime and refresh rotation (#178) through the real Nest +
 * Fastify stack on the test database: an absolute lifetime across refreshes,
 * and an atomic rotation so two refreshes racing with one token can't both
 * get a new one. Each test runs in a rolled-back transaction.
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

describe.skipIf(!process.env.DATABASE_URL)('Session lifetime (HTTP)', () => {
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
    return `198.18.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`
  }

  const call = (
    url: string,
    { cookie, payload }: { cookie?: string; payload?: object } = {},
  ) =>
    app.inject({
      method: 'POST',
      url,
      remoteAddress: nextIp(),
      headers: cookie ? { cookie } : {},
      payload,
    })

  /** The current `refresh_token` (the first one clears the legacy path). */
  const refreshTokenOf = (res: {
    cookies: { name: string; value: string }[]
  }) => res.cookies.filter((c) => c.name === 'refresh_token').at(-1)?.value

  const refresh = (token: string) =>
    call('/api/auth/refresh', { cookie: `refresh_token=${token}` })

  async function asOwner(fn: (tx: Db) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        currentTx = tx
        await tx.insert(usersTable).values({
          email: EMAIL,
          name: 'Owner Test',
          passwordHash,
          emailVerifiedAt: new Date(),
        })
        await fn(tx)
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
      .finally(() => {
        currentTx = undefined
      })
  }

  async function signIn(): Promise<string> {
    const res = await call('/api/auth/login', {
      payload: { email: EMAIL, password: PASSWORD },
    })
    expect(res.statusCode, res.body).toBe(200)
    return refreshTokenOf(res)!
  }

  const liveTokens = (tx: Db) =>
    tx
      .select({ id: refreshTokensTable.id })
      .from(refreshTokensTable)
      .where(isNull(refreshTokensTable.revokedAt))

  /** Moves the family's sign-in back in time. */
  const signedInAgo = (tx: Db, ms: number) =>
    tx
      .update(refreshTokensTable)
      .set({ authenticatedAt: new Date(Date.now() - ms) })

  describe('absolute lifetime', () => {
    it('keeps renewing a family signed in less than 90 days ago', async () => {
      await asOwner(async (tx) => {
        let token = await signIn()
        await signedInAgo(tx, SESSION_MAX_LIFETIME_MS - DAY_MS)
        // Several refreshes in a row: the sign-in time doesn't move forward.
        for (let i = 0; i < 3; i++) {
          const res = await refresh(token)
          expect(res.statusCode).toBe(200)
          token = refreshTokenOf(res)!
        }
        const [latest] = await tx
          .select()
          .from(refreshTokensTable)
          .where(isNull(refreshTokensTable.revokedAt))
        // The last token can't outlive the family (about a day left).
        expect(latest.expiresAt.getTime()).toBeLessThanOrEqual(
          latest.authenticatedAt!.getTime() + SESSION_MAX_LIFETIME_MS,
        )
        expect(latest.expiresAt.getTime() - Date.now()).toBeLessThan(2 * DAY_MS)
      })
    })

    it('refuses to renew a family older than 90 days and ends it', async () => {
      await asOwner(async (tx) => {
        const token = await signIn()
        await signedInAgo(tx, SESSION_MAX_LIFETIME_MS + 60_000)

        const res = await refresh(token)

        expect(res.statusCode).toBe(401)
        expect(refreshTokenOf(res)).toBeUndefined()
        expect(await liveTokens(tx)).toEqual([])
      })
    })

    it('counts a family without a sign-in time from its first token', async () => {
      await asOwner(async (tx) => {
        const token = await signIn()
        await tx.update(refreshTokensTable).set({
          authenticatedAt: null,
          createdAt: new Date(Date.now() - SESSION_MAX_LIFETIME_MS - 60_000),
        })

        expect((await refresh(token)).statusCode).toBe(401)
        expect(await liveTokens(tx)).toEqual([])
      })
    })

    it('starts a new 90 days at the next sign-in', async () => {
      await asOwner(async (tx) => {
        const old = await signIn()
        await signedInAgo(tx, SESSION_MAX_LIFETIME_MS + 60_000)
        expect((await refresh(old)).statusCode).toBe(401)

        expect((await refresh(await signIn())).statusCode).toBe(200)
      })
    })
  })

  /** Live tokens of the only family in the test. */
  const familyTokens = (tx: Db) =>
    tx
      .select({
        id: refreshTokensTable.id,
        parentId: refreshTokensTable.parentId,
        revokedAt: refreshTokensTable.revokedAt,
        revokedReason: refreshTokensTable.revokedReason,
      })
      .from(refreshTokensTable)

  /** Moves every rotation back in time, past the grace. */
  const rotatedAgo = (tx: Db, ms: number) =>
    tx
      .update(refreshTokensTable)
      .set({ revokedAt: new Date(Date.now() - ms) })
      .where(eq(refreshTokensTable.revokedReason, 'rotated'))

  describe('atomic rotation', () => {
    it('leaves one usable branch after two concurrent refreshes of one token', async () => {
      await asOwner(async () => {
        const token = await signIn()

        const responses = await Promise.all([refresh(token), refresh(token)])

        // The loser is a retry within the grace: both get a successor
        // (siblings), never the same one.
        expect(responses.map((r) => r.statusCode)).toEqual([200, 200])
        const [a, b] = responses.map((r) => refreshTokenOf(r)!)
        expect(a).not.toBe(b)
        // The browser keeps one of them; renewing it drops the other, whose
        // later use is reuse.
        const kept = await refresh(a)
        expect(kept.statusCode).toBe(200)
        expect((await refresh(b)).statusCode).toBe(401)
        expect((await refresh(refreshTokenOf(kept)!)).statusCode).toBe(401)
      })
    })

    it('still detects reuse of a rotated token once its successor was used', async () => {
      await asOwner(async (tx) => {
        const token = await signIn()
        const first = await refresh(token)
        expect(first.statusCode).toBe(200)
        const next = refreshTokenOf(first)!
        const second = await refresh(next)
        expect(second.statusCode).toBe(200)

        expect((await refresh(token)).statusCode).toBe(401)
        // The legitimate successor is revoked too.
        expect((await refresh(refreshTokenOf(second)!)).statusCode).toBe(401)
        expect(await liveTokens(tx)).toEqual([])
        expect(
          (await familyTokens(tx)).filter((t) => t.revokedReason === 'reuse'),
        ).toHaveLength(1)
      })
    })

    it('detects reuse of a rotated token presented after the grace', async () => {
      await asOwner(async (tx) => {
        const token = await signIn()
        const first = await refresh(token)
        expect(first.statusCode).toBe(200)
        await rotatedAgo(tx, SESSION_REFRESH_REUSE_GRACE_MS + 1000)

        expect((await refresh(token)).statusCode).toBe(401)
        expect((await refresh(refreshTokenOf(first)!)).statusCode).toBe(401)
        expect(await liveTokens(tx)).toEqual([])
      })
    })
  })

  describe('lost refresh response (#292)', () => {
    it('renews the previous token again within the grace instead of signing out', async () => {
      await asOwner(async (tx) => {
        const token = await signIn()
        // The response carrying `lost` never reached the browser...
        const lost = refreshTokenOf(await refresh(token))!

        // ...which presents its previous token again.
        const retry = await refresh(token)
        expect(retry.statusCode).toBe(200)
        const kept = refreshTokenOf(retry)!
        expect(kept).not.toBe(lost)
        expect(retry.cookies.some((c) => c.name === 'token')).toBe(true)

        // The session goes on from the token the browser kept; the lost one
        // is dropped, and presenting it later is reuse.
        const next = await refresh(kept)
        expect(next.statusCode).toBe(200)
        const rows = await familyTokens(tx)
        expect(rows.filter((t) => t.revokedAt === null)).toHaveLength(1)
        expect(rows.map((t) => t.revokedReason ?? 'live').sort()).toEqual([
          'live',
          'rotated',
          'rotated',
          'superseded',
        ])
        expect((await refresh(lost)).statusCode).toBe(401)
        expect(await liveTokens(tx)).toEqual([])
      })
    })

    it('keeps the family time limits for a retry within the grace', async () => {
      await asOwner(async (tx) => {
        const token = await signIn()
        await refresh(token)
        await signedInAgo(tx, SESSION_MAX_LIFETIME_MS + 60_000)

        expect((await refresh(token)).statusCode).toBe(401)
        expect(await liveTokens(tx)).toEqual([])
      })
    })

    it('refuses a token of a logged-out session, even within the grace', async () => {
      await asOwner(async (tx) => {
        const token = await signIn()
        const next = refreshTokenOf(await refresh(token))!
        const out = await call('/api/auth/logout', {
          cookie: `refresh_token=${next}`,
        })
        expect(out.statusCode).toBe(201)

        expect((await refresh(token)).statusCode).toBe(401)
        expect(await liveTokens(tx)).toEqual([])
        expect(
          (await familyTokens(tx)).map((t) => t.revokedReason).sort(),
        ).toEqual(['logout', 'rotated'])
      })
    })
  })

  describe('logging (#292)', () => {
    it('logs why a refresh was refused, with the reason only', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn')
      try {
        await asOwner(async (tx) => {
          const token = await signIn()
          const next = refreshTokenOf(await refresh(token))!
          await rotatedAgo(tx, SESSION_REFRESH_REUSE_GRACE_MS + 1000)
          await refresh(token)
          await refresh(next)
          await refresh('0'.repeat(64))
          await call('/api/auth/refresh')

          const messages = warn.mock.calls.map((args) => args[0])
          expect(messages).toEqual([
            'Session refresh refused: reuse',
            'Session refresh refused: revoked',
            'Session refresh refused: unknown',
            'Session refresh refused: no cookie',
          ])
          const logged = JSON.stringify(warn.mock.calls)
          expect(logged).not.toContain(token)
          expect(logged).not.toContain(next)
        })
      } finally {
        warn.mockRestore()
      }
    })
  })
})
