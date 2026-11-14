import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server'
import * as bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '#/app.module'
import { personalAccessTokensTable } from '#/auth/access-tokens/access-tokens.schema'
import { AUTH_ERRORS, FRESH_AUTH_MAX_AGE_SECONDS } from '#/auth/auth.constants'
import { webauthnCredentialsTable } from '#/auth/passkeys/passkeys.schema'
import { SoftAuthenticator } from '#/auth/passkeys/testing/soft-authenticator'
import { createFastifyAdapter } from '#/config/fastify-adapter'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import { usersTable } from '#/user/user.schema'

/**
 * Routes that hand over or destroy the account need a recent sign-in (#176):
 * creating an access token, revoking a passkey, deleting the account. Real
 * Nest + Fastify stack on the test database, real password and passkey
 * sign-ins; each test runs in a rolled-back transaction.
 */

vi.mock('#/config/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/config/logger')>()
  return { ...actual, loggerParams: { pinoHttp: { level: 'silent' } } }
})

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')
const EMAIL = 'owner@example.test'
const PASSWORD = 'synthetic-password-1'

interface Owner {
  id: string
  tx: Db
  /** Sign-in a minute ago. */
  fresh: string
  /** Sign-in just over the fresh window ago. */
  stale: string
  /** Access JWT without `auth_time` (issued before the claim existed). */
  legacy: string
  /** A passkey on the account, through its software authenticator. */
  authenticator: SoftAuthenticator
  passkeyId: string
}

type Route = {
  name: string
  method: 'POST' | 'DELETE'
  url: (owner: Owner) => string
  payload?: object
  success: number
  /** Checks the action really happened (or not). */
  done: (owner: Owner) => Promise<boolean>
}

const ROUTES: Route[] = [
  {
    name: 'creating an access token',
    method: 'POST',
    url: () => '/api/access-tokens',
    payload: { name: 'Script', scope: 'write' },
    success: 201,
    done: async ({ tx }) =>
      (await tx.select().from(personalAccessTokensTable)).length === 1,
  },
  {
    name: 'revoking a passkey',
    method: 'DELETE',
    url: ({ passkeyId }) => `/api/auth/passkeys/${passkeyId}`,
    success: 204,
    done: async ({ tx, passkeyId }) =>
      (
        await tx
          .select()
          .from(webauthnCredentialsTable)
          .where(eq(webauthnCredentialsTable.id, passkeyId))
      ).length === 0,
  },
  {
    name: 'deleting the account',
    method: 'DELETE',
    url: () => '/api/profile',
    success: 204,
    done: async ({ tx, id }) =>
      (await tx.select().from(usersTable).where(eq(usersTable.id, id)))
        .length === 0,
  },
]

describe.skipIf(!process.env.DATABASE_URL)('Fresh session (HTTP)', () => {
  let app: NestFastifyApplication
  let client: postgres.Sql
  let db: Db
  let currentTx: Db | undefined
  let jwt: JwtService
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
    jwt = app.get(JwtService, { strict: false })
  })

  afterAll(async () => {
    await app?.close()
    await client?.end()
  })

  let ipCounter = 0
  const nextIp = () => {
    ipCounter += 1
    return `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`
  }

  const call = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    { cookie, payload }: { cookie?: string; payload?: object } = {},
  ) =>
    app.inject({
      method,
      url,
      remoteAddress: nextIp(),
      headers: cookie ? { cookie } : {},
      payload,
    })

  const accessCookie = (res: { cookies: { name: string; value: string }[] }) =>
    `token=${res.cookies.find((c) => c.name === 'token')?.value ?? ''}`

  const nowSeconds = () => Math.floor(Date.now() / 1000)

  async function asOwner(fn: (owner: Owner) => Promise<void>) {
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
        const sign = (authTime?: number) =>
          `token=${jwt.sign(
            authTime === undefined
              ? { sub: user.id }
              : { sub: user.id, auth_time: authTime },
          )}`
        const fresh = sign(nowSeconds() - 60)

        // A passkey to revoke, and to sign in with.
        const authenticator = new SoftAuthenticator()
        const options = await call(
          'POST',
          '/api/auth/passkeys/registration/options',
          { cookie: fresh },
        )
        const verify = await call(
          'POST',
          '/api/auth/passkeys/registration/verify',
          {
            cookie: fresh,
            payload: {
              response: authenticator.register(
                options.json<PublicKeyCredentialCreationOptionsJSON>(),
              ),
              name: 'iPhone',
            },
          },
        )
        expect(verify.statusCode, verify.body).toBe(201)

        await fn({
          id: user.id,
          tx,
          fresh,
          stale: sign(nowSeconds() - FRESH_AUTH_MAX_AGE_SECONDS - 5),
          legacy: sign(),
          authenticator,
          passkeyId: verify.json<{ id: string }>().id,
        })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
      .finally(() => {
        currentTx = undefined
      })
  }

  async function passwordSignIn(): Promise<string> {
    const res = await call('POST', '/api/auth/login', {
      payload: { email: EMAIL, password: PASSWORD },
    })
    expect(res.statusCode, res.body).toBe(200)
    return accessCookie(res)
  }

  async function passkeySignIn(owner: Owner): Promise<string> {
    const options = await call(
      'POST',
      '/api/auth/passkeys/authentication/options',
    )
    const res = await call('POST', '/api/auth/passkeys/authentication/verify', {
      payload: {
        response: owner.authenticator.authenticate(
          options.json<PublicKeyCredentialRequestOptionsJSON>(),
        ),
      },
    })
    expect(res.statusCode, res.body).toBe(200)
    return accessCookie(res)
  }

  describe.each(ROUTES)('$name', (route) => {
    const send = (owner: Owner, cookie: string) =>
      call(route.method, route.url(owner), { cookie, payload: route.payload })

    it('is refused with a sign-in older than 5 minutes or without its time', async () => {
      await asOwner(async (owner) => {
        for (const cookie of [owner.stale, owner.legacy]) {
          const res = await send(owner, cookie)
          expect(res.statusCode).toBe(403)
          expect(res.json()).toMatchObject({
            message: [AUTH_ERRORS.REAUTHENTICATION_REQUIRED],
          })
        }
        expect(await route.done(owner)).toBe(false)
      })
    })

    it('is refused after a refresh of a stale session', async () => {
      await asOwner(async (owner) => {
        // A refresh renews the access token, not the sign-in time.
        const login = await call('POST', '/api/auth/login', {
          payload: { email: EMAIL, password: PASSWORD },
        })
        // The first `refresh_token` cookie clears the legacy path.
        const refreshToken = login.cookies
          .filter((c) => c.name === 'refresh_token')
          .at(-1)!.value
        const old = new Date(
          (nowSeconds() - FRESH_AUTH_MAX_AGE_SECONDS - 5) * 1000,
        )
        await owner.tx
          .update(schema.refreshTokensTable)
          .set({ authenticatedAt: old })
        const refreshed = await call('POST', '/api/auth/refresh', {
          cookie: `refresh_token=${refreshToken}`,
        })
        expect(refreshed.statusCode).toBe(200)
        expect((await send(owner, accessCookie(refreshed))).statusCode).toBe(
          403,
        )
        expect(await route.done(owner)).toBe(false)
      })
    })

    it('succeeds after a password sign-in', async () => {
      await asOwner(async (owner) => {
        expect((await send(owner, owner.stale)).statusCode).toBe(403)
        const res = await send(owner, await passwordSignIn())
        expect(res.statusCode, res.body).toBe(route.success)
        expect(await route.done(owner)).toBe(true)
      })
    })

    it('succeeds after a passkey sign-in', async () => {
      await asOwner(async (owner) => {
        expect((await send(owner, owner.stale)).statusCode).toBe(403)
        const res = await send(owner, await passkeySignIn(owner))
        expect(res.statusCode, res.body).toBe(route.success)
        expect(await route.done(owner)).toBe(true)
      })
    })
  })

  it('leaves the other account routes to any session', async () => {
    await asOwner(async (owner) => {
      for (const [method, url] of [
        ['GET', '/api/access-tokens'],
        ['GET', '/api/auth/passkeys'],
        ['GET', '/api/auth/me'],
      ] as const) {
        expect(
          (await call(method, url, { cookie: owner.stale })).statusCode,
        ).toBe(200)
      }
      const rename = await app.inject({
        method: 'PATCH',
        url: `/api/auth/passkeys/${owner.passkeyId}`,
        remoteAddress: nextIp(),
        headers: { cookie: owner.stale },
        payload: { name: 'Mac' },
      })
      expect(rename.statusCode).toBe(200)
    })
  })
})
