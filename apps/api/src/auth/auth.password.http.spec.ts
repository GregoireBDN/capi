import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import * as bcrypt from 'bcryptjs'
import { eq, isNull } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '#/app.module'
import { AccessTokensService } from '#/auth/access-tokens/access-tokens.service'
import { personalAccessTokensTable } from '#/auth/access-tokens/access-tokens.schema'
import { AUTH_ERRORS, FRESH_AUTH_MAX_AGE_SECONDS } from '#/auth/auth.constants'
import {
  passwordResetTokensTable,
  refreshTokensTable,
} from '#/auth/auth.schema'
import { createFastifyAdapter } from '#/config/fastify-adapter'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import { EmailService } from '#/email/email.service'
import { THROTTLE_LIMITS } from '#/throttle.config'
import { usersTable } from '#/user/user.schema'

/**
 * Password change and reset (#177) through the real Nest + Fastify stack on
 * the test database: the change needs the current password and a fresh
 * session; a change ends every other session, a reset ends them all; only the
 * latest reset link works. Emails are captured, never sent. Each test runs in
 * a rolled-back transaction.
 */

vi.mock('#/config/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/config/logger')>()
  return { ...actual, loggerParams: { pinoHttp: { level: 'silent' } } }
})

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')
const EMAIL = 'owner@example.test'
const PASSWORD = 'synthetic-password-1'
const NEW_PASSWORD = 'another-synthetic-pw'

interface Session {
  /** `token=…; refresh_token=…`, as the browser sends them. */
  cookie: string
  refreshToken: string
}

describe.skipIf(!process.env.DATABASE_URL)(
  'Password change and reset (HTTP)',
  () => {
    let app: NestFastifyApplication
    let client: postgres.Sql
    let db: Db
    let currentTx: Db | undefined
    let jwt: JwtService
    let passwordHash: string
    const resetUrls: string[] = []

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
        .overrideProvider(EmailService)
        .useValue({
          sendEmailVerification: () => Promise.resolve(),
          sendPasswordReset: (_to: string, url: string) => {
            resetUrls.push(url)
            return Promise.resolve()
          },
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
      jwt = app.get(JwtService, { strict: false })
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

    const call = (
      method: 'GET' | 'POST',
      url: string,
      {
        cookie,
        payload,
        ip,
        bearer,
      }: {
        cookie?: string
        payload?: object
        ip?: string
        bearer?: string
      } = {},
    ) => {
      const headers: Record<string, string> = {}
      if (cookie) headers['cookie'] = cookie
      if (bearer) headers['authorization'] = `Bearer ${bearer}`
      return app.inject({
        method,
        url,
        remoteAddress: ip ?? nextIp(),
        headers,
        payload,
      })
    }

    const lastCookie = (
      res: { cookies: { name: string; value: string }[] },
      name: string,
    ) => res.cookies.filter((c) => c.name === name).at(-1)?.value

    async function signIn(password = PASSWORD): Promise<Session> {
      const res = await call('POST', '/api/auth/login', {
        payload: { email: EMAIL, password },
      })
      expect(res.statusCode, res.body).toBe(200)
      const token = lastCookie(res, 'token')!
      const refreshToken = lastCookie(res, 'refresh_token')!
      return {
        cookie: `token=${token}; refresh_token=${refreshToken}`,
        refreshToken,
      }
    }

    const refresh = (refreshToken: string) =>
      call('POST', '/api/auth/refresh', {
        cookie: `refresh_token=${refreshToken}`,
      })

    const changePassword = (
      session: { cookie: string },
      body: object,
      ip?: string,
    ) =>
      call('POST', '/api/auth/change-password', {
        cookie: session.cookie,
        payload: body,
        ip,
      })

    async function asOwner(fn: (ctx: { id: string; tx: Db }) => Promise<void>) {
      resetUrls.length = 0
      await db
        .transaction(async (tx) => {
          currentTx = tx
          const [user] = await tx
            .insert(usersTable)
            .values({
              email: EMAIL,
              name: 'Owner Test',
              passwordHash,
              emailVerifiedAt: new Date(),
            })
            .returning({ id: usersTable.id })
          await fn({ id: user.id, tx })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
        .finally(() => {
          currentTx = undefined
        })
    }

    const passwordWorks = async (password: string) =>
      (
        await call('POST', '/api/auth/login', {
          payload: { email: EMAIL, password },
        })
      ).statusCode === 200

    const createToken = (id: string) =>
      app
        .get(AccessTokensService, { strict: false })
        .create(id, { name: 'Script', scope: 'read' })

    const tokenWorks = async (token: string) =>
      (await call('GET', '/api/auth/me', { bearer: token })).statusCode === 200

    describe('change', () => {
      it('ends every other session and keeps this one', async () => {
        await asOwner(async ({ id }) => {
          const other = await signIn()
          const current = await signIn()
          const { token } = await createToken(id)

          const res = await changePassword(current, {
            currentPassword: PASSWORD,
            newPassword: NEW_PASSWORD,
          })

          expect(res.statusCode, res.body).toBe(200)
          expect((await refresh(other.refreshToken)).statusCode).toBe(401)
          expect((await refresh(current.refreshToken)).statusCode).toBe(200)
          expect(await passwordWorks(PASSWORD)).toBe(false)
          expect(await passwordWorks(NEW_PASSWORD)).toBe(true)
          // Access tokens stay unless asked.
          expect(await tokenWorks(token)).toBe(true)
        })
      })

      it('revokes the access tokens when asked', async () => {
        await asOwner(async ({ id, tx }) => {
          const current = await signIn()
          const { token } = await createToken(id)

          const res = await changePassword(current, {
            currentPassword: PASSWORD,
            newPassword: NEW_PASSWORD,
            revokeAccessTokens: true,
          })

          expect(res.statusCode).toBe(200)
          expect(await tokenWorks(token)).toBe(false)
          expect(
            await tx
              .select()
              .from(personalAccessTokensTable)
              .where(isNull(personalAccessTokensTable.revokedAt)),
          ).toEqual([])
        })
      })

      it('refuses a wrong current password and changes nothing', async () => {
        await asOwner(async () => {
          const other = await signIn()
          const current = await signIn()

          const res = await changePassword(current, {
            currentPassword: 'not-the-password',
            newPassword: NEW_PASSWORD,
          })

          expect(res.statusCode).toBe(400)
          expect(res.json()).toMatchObject({
            message: [AUTH_ERRORS.WRONG_CURRENT_PASSWORD],
          })
          expect(await passwordWorks(PASSWORD)).toBe(true)
          expect((await refresh(other.refreshToken)).statusCode).toBe(200)
        })
      })

      it('needs a fresh session', async () => {
        await asOwner(async ({ id }) => {
          const stale = `token=${jwt.sign({
            sub: id,
            auth_time:
              Math.floor(Date.now() / 1000) - FRESH_AUTH_MAX_AGE_SECONDS - 5,
          })}`
          const res = await changePassword(
            { cookie: stale },
            { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
          )
          expect(res.statusCode).toBe(403)
          expect(res.json()).toMatchObject({
            message: [AUTH_ERRORS.REAUTHENTICATION_REQUIRED],
          })
          expect(await passwordWorks(PASSWORD)).toBe(true)
        })
      })

      it.each([
        ['shorter than 12 characters', 'short-pw-11'],
        ['longer than 72 bytes', 'é'.repeat(37)],
        ['the current one', PASSWORD],
      ])('refuses a new password %s', async (_label, newPassword) => {
        await asOwner(async () => {
          const res = await changePassword(await signIn(), {
            currentPassword: PASSWORD,
            newPassword,
          })
          expect(res.statusCode).toBe(400)
          expect(await passwordWorks(PASSWORD)).toBe(true)
        })
      })

      it('is session only: an access token is refused', async () => {
        await asOwner(async ({ id }) => {
          const { token } = await app
            .get(AccessTokensService, { strict: false })
            .create(id, { name: 'Script', scope: 'write' })
          const res = await call('POST', '/api/auth/change-password', {
            bearer: token,
            payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
          })
          expect(res.statusCode).toBe(403)
          expect(await passwordWorks(PASSWORD)).toBe(true)
        })
      })

      it('is throttled per IP like the login', async () => {
        await asOwner(async () => {
          const current = await signIn()
          const ip = '192.0.2.77'
          const statuses: number[] = []
          for (let i = 0; i <= THROTTLE_LIMITS.login; i++) {
            statuses.push(
              (
                await changePassword(
                  current,
                  {
                    currentPassword: 'wrong-password',
                    newPassword: NEW_PASSWORD,
                  },
                  ip,
                )
              ).statusCode,
            )
          }
          expect(statuses.slice(0, -1).every((s) => s === 400)).toBe(true)
          expect(statuses.at(-1)).toBe(429)
        })
      })
    })

    describe('reset', () => {
      const requestLink = async () => {
        const res = await call('POST', '/api/auth/forgot-password', {
          payload: { email: EMAIL },
        })
        expect(res.statusCode).toBe(200)
        return new URL(resetUrls.at(-1)!).searchParams.get('token')!
      }
      const reset = (token: string, body: object = {}) =>
        call('POST', '/api/auth/reset-password', {
          payload: { token, password: NEW_PASSWORD, ...body },
        })

      it('ends every session, the one that asked included', async () => {
        await asOwner(async ({ id, tx }) => {
          const first = await signIn()
          const second = await signIn()
          const { token } = await createToken(id)

          const res = await reset(await requestLink())

          expect(res.statusCode, res.body).toBe(200)
          expect((await refresh(first.refreshToken)).statusCode).toBe(401)
          expect((await refresh(second.refreshToken)).statusCode).toBe(401)
          expect(
            await tx
              .select()
              .from(refreshTokensTable)
              .where(isNull(refreshTokensTable.revokedAt)),
          ).toEqual([])
          expect(await passwordWorks(NEW_PASSWORD)).toBe(true)
          expect(await tokenWorks(token)).toBe(true)
        })
      })

      it('revokes the access tokens when asked', async () => {
        await asOwner(async ({ id }) => {
          const { token } = await createToken(id)
          expect(
            (await reset(await requestLink(), { revokeAccessTokens: true }))
              .statusCode,
          ).toBe(200)
          expect(await tokenWorks(token)).toBe(false)
        })
      })

      it('only accepts the latest link, once', async () => {
        await asOwner(async ({ tx }) => {
          const older = await requestLink()
          const latest = await requestLink()

          expect((await reset(older)).statusCode).toBe(400)
          expect(await passwordWorks(PASSWORD)).toBe(true)
          expect((await reset(latest)).statusCode).toBe(200)
          expect((await reset(latest)).statusCode).toBe(400)
          expect(
            await tx
              .select()
              .from(passwordResetTokensTable)
              .where(isNull(passwordResetTokensTable.usedAt)),
          ).toEqual([])
        })
      })

      it('spends a pending link when the password is changed', async () => {
        await asOwner(async () => {
          const link = await requestLink()
          expect(
            (
              await changePassword(await signIn(), {
                currentPassword: PASSWORD,
                newPassword: NEW_PASSWORD,
              })
            ).statusCode,
          ).toBe(200)
          expect(
            (await reset(link, { password: 'yet-another-password' }))
              .statusCode,
          ).toBe(400)
        })
      })

      it('refuses a new password shorter than 12 characters', async () => {
        await asOwner(async () => {
          const res = await reset(await requestLink(), {
            password: 'short-pw-11',
          })
          expect(res.statusCode).toBe(400)
          expect(await passwordWorks(PASSWORD)).toBe(true)
        })
      })
    })

    describe('sign-up and sign-in', () => {
      it('keeps accepting a password set before the 12-character rule', async () => {
        await asOwner(async ({ id, tx }) => {
          await tx
            .update(usersTable)
            .set({ passwordHash: await bcrypt.hash('eight-ch', 4) })
            .where(eq(usersTable.id, id))
          expect(await passwordWorks('eight-ch')).toBe(true)
        })
      })

      it('refuses an unknown email like a wrong password', async () => {
        await asOwner(async () => {
          const res = await call('POST', '/api/auth/login', {
            payload: { email: 'someone@example.test', password: PASSWORD },
          })
          expect(res.statusCode).toBe(401)
          expect(res.json()).toMatchObject({
            message: [AUTH_ERRORS.INVALID_CREDENTIALS],
          })
        })
      })
    })
  },
)
