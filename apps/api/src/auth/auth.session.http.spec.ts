import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import * as bcrypt from 'bcryptjs'
import { and, eq, isNull } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '#/app.module'
import { refreshTokensTable } from '#/auth/auth.schema'
import { SESSION_MAX_LIFETIME_MS } from '#/auth/auth.constants'
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

  describe('atomic rotation', () => {
    it('gives at most one new token to two concurrent refreshes of one token', async () => {
      await asOwner(async (tx) => {
        const token = await signIn()
        const [familyRow] = await tx
          .select({ familyId: refreshTokensTable.familyId })
          .from(refreshTokensTable)

        const responses = await Promise.all([refresh(token), refresh(token)])

        const statuses = responses.map((r) => r.statusCode).sort()
        expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(1)
        expect(statuses).toContain(401)
        // The loser is reuse: the family is burned, so at most one token of
        // it is still usable, and no token is ever usable twice.
        const live = await tx
          .select({ id: refreshTokensTable.id })
          .from(refreshTokensTable)
          .where(
            and(
              eq(refreshTokensTable.familyId, familyRow.familyId),
              isNull(refreshTokensTable.revokedAt),
            ),
          )
        expect(live.length).toBeLessThanOrEqual(1)
        expect((await refresh(token)).statusCode).toBe(401)
      })
    })

    it('still detects reuse of a rotated token and burns the family', async () => {
      await asOwner(async (tx) => {
        const token = await signIn()
        const first = await refresh(token)
        expect(first.statusCode).toBe(200)
        const next = refreshTokenOf(first)!

        expect((await refresh(token)).statusCode).toBe(401)
        // The legitimate successor is revoked too.
        expect((await refresh(next)).statusCode).toBe(401)
        expect(await liveTokens(tx)).toEqual([])
      })
    })
  })
})
