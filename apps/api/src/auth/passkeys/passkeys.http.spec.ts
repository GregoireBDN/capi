import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/server'
import { eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '#/app.module'
import { AccessTokensService } from '#/auth/access-tokens/access-tokens.service'
import { refreshTokensTable } from '#/auth/auth.schema'
import { createFastifyAdapter } from '#/config/fastify-adapter'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import { usersTable } from '#/user/user.schema'
import { THROTTLE_LIMITS } from '#/throttle.config'
import {
  webauthnChallengesTable,
  webauthnCredentialsTable,
} from './passkeys.schema'
import { SoftAuthenticator } from './testing/soft-authenticator'

/**
 * Passkeys through the real Nest + Fastify stack and the test database, with a
 * software authenticator whose responses `@simplewebauthn/server` verifies for
 * real (no mock of the verification). Each test runs in a rolled-back
 * transaction. The app's relying party is the default `APP_URL`
 * (`http://localhost:3000`, RP id `localhost`).
 */

vi.mock('#/config/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/config/logger')>()
  return { ...actual, loggerParams: { pinoHttp: { level: 'silent' } } }
})

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')

interface Owner {
  id: string
  tx: Db
  /** Session cookie with a sign-in a minute ago (fresh). */
  fresh: string
  /** Session cookie whose last sign-in is older than the fresh window. */
  stale: string
}

describe.skipIf(!process.env.DATABASE_URL)('Passkeys (HTTP)', () => {
  let app: NestFastifyApplication
  let client: postgres.Sql
  let db: Db
  let currentTx: Db | undefined
  let jwt: JwtService

  beforeAll(async () => {
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
  /** A fresh client address per call, unless a test wants to hit a limit. */
  const nextIp = () => {
    ipCounter += 1
    return `203.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`
  }

  function call(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    {
      cookie,
      payload,
      ip,
      bearer,
    }: { cookie?: string; payload?: object; ip?: string; bearer?: string } = {},
  ) {
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

  const nowSeconds = () => Math.floor(Date.now() / 1000)

  async function asOwner(fn: (owner: Owner) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        currentTx = tx
        const [owner] = await tx
          .insert(usersTable)
          .values({
            email: 'owner@example.test',
            name: 'Owner Test',
            passwordHash: 'synthetic-password-hash',
            emailVerifiedAt: new Date(),
          })
          .returning({ id: usersTable.id })
        const sign = (authTime: number) =>
          `token=${jwt.sign({ sub: owner.id, auth_time: authTime })}`
        await fn({
          id: owner.id,
          tx,
          fresh: sign(nowSeconds() - 60),
          stale: sign(nowSeconds() - 10 * 60),
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

  /** Adds a passkey to the owner's account through the API. */
  async function registerPasskey(owner: Owner, name = 'iPhone') {
    const authenticator = new SoftAuthenticator()
    const options = await call(
      'POST',
      '/api/auth/passkeys/registration/options',
      {
        cookie: owner.fresh,
      },
    )
    expect(options.statusCode).toBe(200)
    const creation = options.json<PublicKeyCredentialCreationOptionsJSON>()
    const verify = await call(
      'POST',
      '/api/auth/passkeys/registration/verify',
      {
        cookie: owner.fresh,
        payload: { response: authenticator.register(creation), name },
      },
    )
    expect(verify.statusCode, verify.body).toBe(201)
    return { authenticator, passkey: verify.json<{ id: string }>() }
  }

  async function signInOptions() {
    const res = await call('POST', '/api/auth/passkeys/authentication/options')
    expect(res.statusCode).toBe(200)
    return res.json<PublicKeyCredentialRequestOptionsJSON>()
  }

  const signIn = (response: object, ip?: string) =>
    call('POST', '/api/auth/passkeys/authentication/verify', {
      payload: { response },
      ip,
    })

  function cookiesOf(res: { cookies: { name: string; value: string }[] }) {
    return Object.fromEntries(res.cookies.map((c) => [c.name, c.value]))
  }

  describe('registration', () => {
    it('asks for a discoverable credential with user verification', async () => {
      await asOwner(async (owner) => {
        const res = await call(
          'POST',
          '/api/auth/passkeys/registration/options',
          { cookie: owner.fresh },
        )
        const options = res.json<PublicKeyCredentialCreationOptionsJSON>()
        expect(options.rp).toEqual({ id: 'localhost', name: 'Finances' })
        expect(options.user.name).toBe('owner@example.test')
        expect(options.authenticatorSelection).toMatchObject({
          residentKey: 'required',
          userVerification: 'required',
        })
        const [stored] = await owner.tx.select().from(webauthnChallengesTable)
        expect(stored).toMatchObject({
          purpose: 'registration',
          challenge: options.challenge,
          userId: owner.id,
        })
      })
    })

    it('saves the passkey and lists it without its credential id or key', async () => {
      await asOwner(async (owner) => {
        const { authenticator, passkey } = await registerPasskey(owner)
        expect(passkey).toMatchObject({
          name: 'iPhone',
          deviceType: 'multiDevice',
          backedUp: true,
          lastUsedAt: null,
        })

        const list = await call('GET', '/api/auth/passkeys', {
          cookie: owner.fresh,
        })
        expect(list.statusCode).toBe(200)
        expect(list.json()).toEqual([passkey])
        const [row] = await owner.tx.select().from(webauthnCredentialsTable)
        expect(row.credentialId).toBe(authenticator.credentialId)
        expect(row.transports).toEqual(['internal', 'hybrid'])
        expect(list.body).not.toContain(row.credentialId)
        expect(list.body).not.toContain(row.publicKey)
        // The challenge is gone once answered.
        expect(await owner.tx.select().from(webauthnChallengesTable)).toEqual(
          [],
        )
      })
    })

    it('excludes the passkeys already registered', async () => {
      await asOwner(async (owner) => {
        const { authenticator } = await registerPasskey(owner)
        const res = await call(
          'POST',
          '/api/auth/passkeys/registration/options',
          { cookie: owner.fresh },
        )
        expect(
          res.json<PublicKeyCredentialCreationOptionsJSON>().excludeCredentials,
        ).toEqual([
          {
            id: authenticator.credentialId,
            type: 'public-key',
            transports: ['internal', 'hybrid'],
          },
        ])
      })
    })

    it('needs a fresh session', async () => {
      await asOwner(async (owner) => {
        const noAuthTime = `token=${jwt.sign({ sub: owner.id })}`
        for (const cookie of [owner.stale, noAuthTime]) {
          const res = await call(
            'POST',
            '/api/auth/passkeys/registration/options',
            { cookie },
          )
          expect(res.statusCode).toBe(403)
          expect(res.json<{ message: string[] }>().message).toEqual([
            'Recent authentication required',
          ])
        }

        // Options obtained while fresh can't be completed once stale.
        const options = await call(
          'POST',
          '/api/auth/passkeys/registration/options',
          { cookie: owner.fresh },
        )
        const verify = await call(
          'POST',
          '/api/auth/passkeys/registration/verify',
          {
            cookie: owner.stale,
            payload: {
              response: new SoftAuthenticator().register(options.json()),
            },
          },
        )
        expect(verify.statusCode).toBe(403)
        expect(await owner.tx.select().from(webauthnCredentialsTable)).toEqual(
          [],
        )
      })
    })

    it('refuses a wrong origin, a wrong RP id and a replayed challenge', async () => {
      await asOwner(async (owner) => {
        const options = async () =>
          (
            await call('POST', '/api/auth/passkeys/registration/options', {
              cookie: owner.fresh,
            })
          ).json<PublicKeyCredentialCreationOptionsJSON>()
        const verify = (response: object) =>
          call('POST', '/api/auth/passkeys/registration/verify', {
            cookie: owner.fresh,
            payload: { response },
          })
        const authenticator = new SoftAuthenticator()

        const wrongOrigin = await verify(
          authenticator.register(await options(), {
            origin: 'https://evil.example',
          }),
        )
        expect(wrongOrigin.statusCode).toBe(400)
        const wrongRpId = await verify(
          authenticator.register(await options(), { rpId: 'evil.example' }),
        )
        expect(wrongRpId.statusCode).toBe(400)

        const response = authenticator.register(await options())
        expect((await verify(response)).statusCode).toBe(201)
        const replay = await verify(response)
        expect(replay.statusCode).toBe(400)
        expect(replay.json<{ message: string[] }>().message).toEqual([
          'Invalid or expired passkey challenge',
        ])
        expect(
          await owner.tx.select().from(webauthnCredentialsTable),
        ).toHaveLength(1)
      })
    })
  })

  describe('sign-in', () => {
    it('issues the same session as a password login', async () => {
      await asOwner(async (owner) => {
        const { authenticator, passkey } = await registerPasskey(owner)
        const options = await signInOptions()
        expect(options).toMatchObject({
          rpId: 'localhost',
          userVerification: 'required',
        })
        expect(options.allowCredentials ?? []).toEqual([])

        const res = await signIn(authenticator.authenticate(options))
        expect(res.statusCode, res.body).toBe(200)
        expect(res.json()).toEqual({ success: true })
        const cookies = cookiesOf(res)
        expect(Object.keys(cookies).sort()).toEqual(['refresh_token', 'token'])
        const access = res.cookies.find((c) => c.name === 'token')!
        expect(access).toMatchObject({
          httpOnly: true,
          sameSite: 'Lax',
          path: '/',
        })
        const claims = jwt.verify<{ sub: string; auth_time: number }>(
          cookies['token'],
        )
        expect(claims.sub).toBe(owner.id)
        expect(Math.abs(claims.auth_time - nowSeconds())).toBeLessThan(5)

        // The new session can call the API and add a passkey (fresh).
        const me = await call('GET', '/api/auth/me', {
          cookie: `token=${cookies['token']}`,
        })
        expect(me.json()).toMatchObject({ id: owner.id })
        const [used] = await owner.tx
          .select()
          .from(webauthnCredentialsTable)
          .where(eq(webauthnCredentialsTable.id, passkey.id))
        expect(used.lastUsedAt).not.toBeNull()

        // Refresh rotation keeps the sign-in time; reuse burns the family.
        const refreshed = await call('POST', '/api/auth/refresh', {
          cookie: `refresh_token=${cookies['refresh_token']}`,
        })
        expect(refreshed.statusCode).toBe(200)
        const renewed = jwt.verify<{ auth_time: number }>(
          cookiesOf(refreshed)['token'],
        )
        expect(renewed.auth_time).toBe(claims.auth_time)
        const reused = await call('POST', '/api/auth/refresh', {
          cookie: `refresh_token=${cookies['refresh_token']}`,
        })
        expect(reused.statusCode).toBe(401)
        const family = await owner.tx
          .select({ revokedAt: refreshTokensTable.revokedAt })
          .from(refreshTokensTable)
          .where(eq(refreshTokensTable.userId, owner.id))
        expect(family.every((row) => row.revokedAt !== null)).toBe(true)
      })
    })

    it('refuses a replayed or expired challenge', async () => {
      await asOwner(async (owner) => {
        const { authenticator } = await registerPasskey(owner)
        const response = authenticator.authenticate(await signInOptions())
        expect((await signIn(response)).statusCode).toBe(200)
        const replay = await signIn(response)
        expect(replay.statusCode).toBe(401)
        expect(replay.cookies).toEqual([])

        const late = authenticator.authenticate(await signInOptions())
        await owner.tx
          .update(webauthnChallengesTable)
          .set({ expiresAt: new Date(Date.now() - 1000) })
        const expired = await signIn(late)
        expect(expired.statusCode).toBe(401)
        expect(expired.json<{ message: string[] }>().message).toEqual([
          'Invalid or expired passkey challenge',
        ])
      })
    })

    it('refuses a registration challenge and an unknown one', async () => {
      await asOwner(async (owner) => {
        const { authenticator } = await registerPasskey(owner)
        const creation = await call(
          'POST',
          '/api/auth/passkeys/registration/options',
          { cookie: owner.fresh },
        )
        const borrowed = authenticator.authenticate({
          challenge:
            creation.json<PublicKeyCredentialCreationOptionsJSON>().challenge,
          rpId: 'localhost',
        })
        expect((await signIn(borrowed)).statusCode).toBe(401)
        const made_up = authenticator.authenticate({
          challenge: Buffer.from('never issued').toString('base64url'),
          rpId: 'localhost',
        })
        expect((await signIn(made_up)).statusCode).toBe(401)
        expect((await signIn({ id: 'x', response: {} })).statusCode).toBe(401)
      })
    })

    it('refuses a wrong origin, a wrong RP id and a missing user verification', async () => {
      await asOwner(async (owner) => {
        const { authenticator } = await registerPasskey(owner)
        for (const options of [
          { origin: 'https://evil.example' },
          { origin: 'http://localhost:3001' },
          { rpId: 'evil.example' },
          { skipUserVerification: true },
        ]) {
          const res = await signIn(
            authenticator.authenticate(await signInOptions(), options),
          )
          expect(res.statusCode, JSON.stringify(options)).toBe(401)
          expect(res.json<{ message: string[] }>().message).toEqual([
            'Passkey sign-in failed',
          ])
          expect(res.cookies).toEqual([])
        }
      })
    })

    it('refuses an unknown passkey', async () => {
      await asOwner(async () => {
        const stranger = new SoftAuthenticator()
        const res = await signIn(stranger.authenticate(await signInOptions()))
        expect(res.statusCode).toBe(401)
      })
    })
  })

  describe('management', () => {
    it('renames a passkey', async () => {
      await asOwner(async (owner) => {
        const { passkey } = await registerPasskey(owner)
        const res = await call('PATCH', `/api/auth/passkeys/${passkey.id}`, {
          cookie: owner.stale,
          payload: { name: '  Mac  ' },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json()).toMatchObject({ id: passkey.id, name: 'Mac' })
        const empty = await call('PATCH', `/api/auth/passkeys/${passkey.id}`, {
          cookie: owner.stale,
          payload: { name: '' },
        })
        expect(empty.statusCode).toBe(400)
      })
    })

    it('revokes a passkey, which can no longer sign in', async () => {
      await asOwner(async (owner) => {
        const { authenticator, passkey } = await registerPasskey(owner)
        const pending = authenticator.authenticate(await signInOptions())
        const revoked = await call(
          'DELETE',
          `/api/auth/passkeys/${passkey.id}`,
          { cookie: owner.fresh },
        )
        expect(revoked.statusCode).toBe(204)
        expect((await signIn(pending)).statusCode).toBe(401)
        expect(
          (await signIn(authenticator.authenticate(await signInOptions())))
            .statusCode,
        ).toBe(401)
        const again = await call('DELETE', `/api/auth/passkeys/${passkey.id}`, {
          cookie: owner.fresh,
        })
        expect(again.statusCode).toBe(404)
      })
    })

    it('is session only: access tokens are refused', async () => {
      await asOwner(async (owner) => {
        const { passkey } = await registerPasskey(owner)
        const { token } = await app
          .get(AccessTokensService, { strict: false })
          .create(owner.id, { name: 'Script', scope: 'write' })
        const calls = [
          ['GET', '/api/auth/passkeys'],
          ['POST', '/api/auth/passkeys/registration/options'],
          ['POST', '/api/auth/passkeys/registration/verify'],
          ['PATCH', `/api/auth/passkeys/${passkey.id}`],
          ['DELETE', `/api/auth/passkeys/${passkey.id}`],
        ] as const
        for (const [method, url] of calls) {
          const res = await call(method, url, {
            bearer: token,
            payload:
              method === 'GET' || method === 'DELETE'
                ? undefined
                : { name: 'x' },
          })
          expect(res.statusCode, `${method} ${url}`).toBe(403)
        }
        expect(
          await owner.tx.select().from(webauthnCredentialsTable),
        ).toHaveLength(1)
      })
    })
  })

  describe('throttling', () => {
    it('limits sign-in attempts per IP like the login route', async () => {
      await asOwner(async () => {
        const ip = '192.0.2.10'
        const statuses: number[] = []
        for (let i = 0; i <= THROTTLE_LIMITS.passkeyVerify; i++) {
          statuses.push(
            (await signIn({ id: 'x', response: {} }, ip)).statusCode,
          )
        }
        expect(statuses).toEqual([
          ...Array<number>(THROTTLE_LIMITS.passkeyVerify).fill(401),
          429,
        ])
      })
    })

    it('limits sign-in options per IP', async () => {
      await asOwner(async () => {
        const ip = '192.0.2.11'
        const statuses: number[] = []
        for (let i = 0; i <= THROTTLE_LIMITS.passkeyOptions; i++) {
          statuses.push(
            (
              await call('POST', '/api/auth/passkeys/authentication/options', {
                ip,
              })
            ).statusCode,
          )
        }
        expect(statuses.at(-1)).toBe(429)
        expect(statuses.slice(0, -1).every((status) => status === 200)).toBe(
          true,
        )
      })
    })
  })
})
