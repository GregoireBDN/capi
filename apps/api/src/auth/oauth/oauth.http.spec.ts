import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as crypto from 'node:crypto'
import postgres from 'postgres'
import * as bcrypt from 'bcryptjs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '#/app.module'
import { AccessTokensService } from '#/auth/access-tokens/access-tokens.service'
import { hashAccessToken } from '#/auth/access-tokens/access-tokens.service'
import { FRESH_AUTH_MAX_AGE_SECONDS } from '#/auth/auth.constants'
import { createFastifyAdapter } from '#/config/fastify-adapter'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import { usersTable } from '#/user/user.schema'
import {
  oauthAuditTable,
  oauthGrantsTable,
  oauthTokensTable,
} from './oauth.schema'

/**
 * The whole remote MCP OAuth flow (#78) through the real Nest + Fastify stack
 * on the test database, with `REMOTE_MCP_ENABLED=true`: registration, consent
 * (fresh session), code + PKCE S256, refresh rotation and reuse, revocation,
 * scope enforcement on the API and the audit. Each test runs in a rolled-back
 * transaction. Synthetic data only.
 */

const ISSUER = 'https://mcp.example.test'
const RESOURCE = `${ISSUER}/mcp`
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'

vi.mock('#/config/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/config/logger')>()
  return { ...actual, loggerParams: { pinoHttp: { level: 'silent' } } }
})

vi.mock('#/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/config/env')>()
  return {
    ...actual,
    env: {
      ...actual.env,
      remoteMcp: {
        enabled: true,
        issuer: 'https://mcp.example.test',
        resource: 'https://mcp.example.test/mcp',
        authorizationEndpoint: 'http://localhost:3000/oauth/authorize',
        redirectUris: [
          'https://claude.ai/api/mcp/auth_callback',
          'https://claude.com/api/mcp/auth_callback',
        ],
      },
    },
  }
})

type Db = PostgresJsDatabase<typeof schema>

const ROLLBACK = Symbol('rollback')
const PASSWORD = 'synthetic-password-1'
const SOME_UUID = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'

interface TokenPair {
  access_token: string
  refresh_token: string
  scope: string
  expires_in: number
  token_type: string
}

interface Owner {
  id: string
  tx: Db
  /** Session signed in a minute ago. */
  fresh: string
  /** Session signed in just over the fresh window ago. */
  stale: string
}

const pkce = () => {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url')
  return { verifier, challenge }
}

describe.skipIf(!process.env.DATABASE_URL)('Remote MCP OAuth (HTTP)', () => {
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
    return `203.0.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`
  }

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    {
      cookie,
      bearer,
      payload,
    }: { cookie?: string; bearer?: string; payload?: object } = {},
  ) =>
    app.inject({
      method,
      url,
      remoteAddress: nextIp(),
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      payload,
    })

  const nowSeconds = () => Math.floor(Date.now() / 1000)

  async function asOwner(fn: (owner: Owner) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        currentTx = tx
        const [user] = await tx
          .insert(usersTable)
          .values({
            email: 'owner@example.test',
            name: 'Owner Test',
            passwordHash,
            emailVerifiedAt: new Date(),
          })
          .returning({ id: usersTable.id })
        const sign = (authTime: number) =>
          `token=${jwt.sign({ sub: user.id, auth_time: authTime })}`
        await fn({
          id: user.id,
          tx,
          fresh: sign(nowSeconds() - 60),
          stale: sign(nowSeconds() - FRESH_AUTH_MAX_AGE_SECONDS - 5),
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

  async function registerClient(): Promise<string> {
    const res = await call('POST', '/api/oauth/register', {
      payload: {
        client_name: 'Claude',
        redirect_uris: [CALLBACK],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    return res.json<{ client_id: string }>().client_id
  }

  const authorizeParams = (
    clientId: string,
    challenge: string,
    extra: Record<string, string> = {},
  ) => ({
    client_id: clientId,
    redirect_uri: CALLBACK,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    scope: 'read write',
    state: 'state-123',
    resource: RESOURCE,
    ...extra,
  })

  /** Consent with a fresh session; returns the code from the redirect. */
  async function approve(
    owner: Owner,
    clientId: string,
    challenge: string,
    allowWrite: boolean,
  ): Promise<string> {
    const res = await call('POST', '/api/oauth/authorize', {
      cookie: owner.fresh,
      payload: { ...authorizeParams(clientId, challenge), allowWrite },
    })
    expect(res.statusCode, res.body).toBe(200)
    const redirect = new URL(res.json<{ redirectTo: string }>().redirectTo)
    expect(`${redirect.origin}${redirect.pathname}`).toBe(CALLBACK)
    expect(redirect.searchParams.get('state')).toBe('state-123')
    expect(redirect.searchParams.get('iss')).toBe(ISSUER)
    return redirect.searchParams.get('code')!
  }

  const exchange = (clientId: string, code: string, verifier: string) =>
    call('POST', '/api/oauth/token', {
      payload: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: CALLBACK,
        client_id: clientId,
        code_verifier: verifier,
        resource: RESOURCE,
      },
    })

  const refresh = (clientId: string, refreshToken: string) =>
    call('POST', '/api/oauth/token', {
      payload: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        resource: RESOURCE,
      },
    })

  /** Registration, consent and code exchange in one go. */
  async function connect(owner: Owner, allowWrite = true) {
    const clientId = await registerClient()
    const { verifier, challenge } = pkce()
    const code = await approve(owner, clientId, challenge, allowWrite)
    const res = await exchange(clientId, code, verifier)
    expect(res.statusCode, res.body).toBe(200)
    return { clientId, tokens: res.json<TokenPair>() }
  }

  const tokenInfo = (access: string) =>
    call('GET', '/api/oauth/token-info', { bearer: access })

  it('publishes RFC 8414 metadata with S256 and public clients only', async () => {
    const res = await call('GET', '/api/oauth/metadata')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: 'http://localhost:3000/oauth/authorize',
      token_endpoint: `${ISSUER}/oauth/token`,
      registration_endpoint: `${ISSUER}/oauth/register`,
      revocation_endpoint: `${ISSUER}/oauth/revoke`,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['read', 'write'],
    })
  })

  describe('registration', () => {
    it('registers a public client with an allow-listed redirect URI', async () => {
      await asOwner(async () => {
        const res = await call('POST', '/api/oauth/register', {
          payload: { client_name: 'Claude', redirect_uris: [CALLBACK] },
        })
        expect(res.statusCode).toBe(201)
        expect(res.json()).toMatchObject({
          client_name: 'Claude',
          redirect_uris: [CALLBACK],
          token_endpoint_auth_method: 'none',
        })
        expect(res.json<{ client_id: string }>().client_id).toMatch(/^fin_cli_/)
      })
    })

    it.each([
      [
        'a redirect URI outside the allow-list',
        { redirect_uris: ['https://evil.example/callback'] },
        'invalid_redirect_uri',
      ],
      [
        'a confidential client',
        {
          redirect_uris: [CALLBACK],
          token_endpoint_auth_method: 'client_secret_basic',
        },
        'invalid_client_metadata',
      ],
      ['no redirect URI', { client_name: 'x' }, 'invalid_client_metadata'],
      [
        'another grant type',
        { redirect_uris: [CALLBACK], grant_types: ['client_credentials'] },
        'invalid_client_metadata',
      ],
    ])('refuses %s', async (_name, payload, error) => {
      await asOwner(async () => {
        const res = await call('POST', '/api/oauth/register', { payload })
        expect(res.statusCode).toBe(400)
        expect(res.json()).toMatchObject({ error })
      })
    })
  })

  describe('consent', () => {
    it('describes the request to the signed-in owner', async () => {
      await asOwner(async (owner) => {
        const clientId = await registerClient()
        const query = new URLSearchParams(
          authorizeParams(clientId, pkce().challenge),
        )
        const res = await call('GET', `/api/oauth/authorize?${query}`, {
          cookie: owner.stale,
        })
        expect(res.statusCode, res.body).toBe(200)
        expect(res.json()).toEqual({
          clientName: 'Claude',
          redirectHost: 'claude.ai',
          requestedScope: 'write',
        })
        // Anonymous visitors are not told anything.
        const anonymous = await call('GET', `/api/oauth/authorize?${query}`)
        expect(anonymous.statusCode).toBe(401)
      })
    })

    it('needs a fresh session to approve', async () => {
      await asOwner(async (owner) => {
        const clientId = await registerClient()
        const res = await call('POST', '/api/oauth/authorize', {
          cookie: owner.stale,
          payload: {
            ...authorizeParams(clientId, pkce().challenge),
            allowWrite: true,
          },
        })
        expect(res.statusCode).toBe(403)
        expect(res.json<{ message: string[] }>().message).toEqual([
          'Recent authentication required',
        ])
      })
    })

    it.each([
      ['an unknown client', { client_id: 'fin_cli_unknown' }, 'Unknown client'],
      [
        'another redirect URI',
        { redirect_uri: 'https://claude.com/api/mcp/auth_callback' },
        'Invalid redirect URI',
      ],
      [
        'the plain PKCE method',
        { code_challenge_method: 'plain' },
        'PKCE with S256 is required',
      ],
      [
        'no PKCE challenge',
        { code_challenge: '' },
        'PKCE with S256 is required',
      ],
      [
        'an implicit grant',
        { response_type: 'token' },
        'Unsupported response type',
      ],
      ['an unknown scope', { scope: 'read admin' }, 'Invalid scope'],
      [
        'another resource',
        { resource: 'https://other.example/mcp' },
        'Invalid resource',
      ],
    ])('refuses %s', async (_name, extra, message) => {
      await asOwner(async (owner) => {
        const clientId = await registerClient()
        const res = await call('POST', '/api/oauth/authorize', {
          cookie: owner.fresh,
          payload: {
            ...authorizeParams(clientId, pkce().challenge, extra),
            allowWrite: true,
          },
        })
        expect(res.statusCode).toBe(400)
        expect(res.json<{ message: string[] }>().message).toEqual([message])
      })
    })

    it('sends a refusal back to the client with its state', async () => {
      await asOwner(async (owner) => {
        const clientId = await registerClient()
        const res = await call('POST', '/api/oauth/authorize/deny', {
          cookie: owner.stale,
          payload: authorizeParams(clientId, pkce().challenge),
        })
        expect(res.statusCode).toBe(200)
        const redirect = new URL(res.json<{ redirectTo: string }>().redirectTo)
        expect(redirect.searchParams.get('error')).toBe('access_denied')
        expect(redirect.searchParams.get('state')).toBe('state-123')
        expect(redirect.searchParams.get('code')).toBeNull()
      })
    })

    it('is never reachable with a token', async () => {
      await asOwner(async (owner) => {
        const { tokens } = await connect(owner)
        const res = await call('POST', '/api/oauth/authorize', {
          bearer: tokens.access_token,
          payload: { allowWrite: true },
        })
        expect(res.statusCode).toBe(403)
        const grants = await call('GET', '/api/oauth/grants', {
          bearer: tokens.access_token,
        })
        expect(grants.statusCode).toBe(403)
      })
    })
  })

  describe('code exchange', () => {
    it('issues a short-lived access token and a refresh token for the approved scope', async () => {
      await asOwner(async (owner) => {
        const { tokens } = await connect(owner, true)
        expect(tokens).toMatchObject({
          token_type: 'Bearer',
          expires_in: 900,
          scope: 'read write',
        })
        expect(tokens.access_token).toMatch(/^fin_oat_[A-Za-z0-9_-]{43}$/)
        expect(tokens.refresh_token).toMatch(/^fin_ort_[A-Za-z0-9_-]{43}$/)
        const info = await tokenInfo(tokens.access_token)
        expect(info.statusCode).toBe(200)
        expect(info.json()).toMatchObject({ scope: 'write' })
        // Only hashes are stored.
        const stored = await owner.tx.select().from(oauthTokensTable)
        expect(stored.map((row) => row.tokenHash).sort()).toEqual(
          [
            hashAccessToken(tokens.access_token),
            hashAccessToken(tokens.refresh_token),
          ].sort(),
        )
      })
    })

    it('grants read only when the owner leaves writes unticked', async () => {
      await asOwner(async (owner) => {
        const { tokens } = await connect(owner, false)
        expect(tokens.scope).toBe('read')
      })
    })

    it('refuses a wrong PKCE verifier and burns the code', async () => {
      await asOwner(async (owner) => {
        const clientId = await registerClient()
        const { verifier, challenge } = pkce()
        const code = await approve(owner, clientId, challenge, true)
        const wrong = await exchange(clientId, code, pkce().verifier)
        expect(wrong.statusCode).toBe(400)
        expect(wrong.json()).toEqual({
          error: 'invalid_grant',
          error_description: 'Invalid authorization code',
        })
        const retry = await exchange(clientId, code, verifier)
        expect(retry.json()).toMatchObject({ error: 'invalid_grant' })
      })
    })

    it('refuses a replayed code and revokes what it produced', async () => {
      await asOwner(async (owner) => {
        const clientId = await registerClient()
        const { verifier, challenge } = pkce()
        const code = await approve(owner, clientId, challenge, true)
        const first = await exchange(clientId, code, verifier)
        expect(first.statusCode).toBe(200)
        const replay = await exchange(clientId, code, verifier)
        expect(replay.statusCode).toBe(400)
        expect(replay.json()).toMatchObject({ error: 'invalid_grant' })
        const access = first.json<TokenPair>().access_token
        expect((await tokenInfo(access)).statusCode).toBe(401)
      })
    })

    it.each([
      ['another client', { client_id: 'fin_cli_other' }, 'invalid_grant'],
      [
        'another redirect URI',
        { redirect_uri: 'https://claude.com/api/mcp/auth_callback' },
        'invalid_grant',
      ],
      [
        'another resource',
        { resource: 'https://other.example/mcp' },
        'invalid_target',
      ],
    ])('refuses a code presented with %s', async (_name, extra, error) => {
      await asOwner(async (owner) => {
        const clientId = await registerClient()
        const { verifier, challenge } = pkce()
        const code = await approve(owner, clientId, challenge, true)
        const res = await call('POST', '/api/oauth/token', {
          payload: {
            grant_type: 'authorization_code',
            code,
            redirect_uri: CALLBACK,
            client_id: clientId,
            code_verifier: verifier,
            ...extra,
          },
        })
        expect(res.statusCode).toBe(400)
        expect(res.json()).toMatchObject({ error })
      })
    })

    it('refuses an expired code', async () => {
      await asOwner(async (owner) => {
        const clientId = await registerClient()
        const { verifier, challenge } = pkce()
        const code = await approve(owner, clientId, challenge, true)
        await owner.tx
          .update(schema.oauthAuthorizationCodesTable)
          .set({ expiresAt: new Date(Date.now() - 1000) })
        const res = await exchange(clientId, code, verifier)
        expect(res.json()).toMatchObject({ error: 'invalid_grant' })
      })
    })

    it('answers unsupported grant types in RFC form', async () => {
      const res = await call('POST', '/api/oauth/token', {
        payload: { grant_type: 'client_credentials' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json()).toMatchObject({ error: 'unsupported_grant_type' })
    })
  })

  describe('refresh', () => {
    it('rotates the refresh token', async () => {
      await asOwner(async (owner) => {
        const { clientId, tokens } = await connect(owner)
        const res = await refresh(clientId, tokens.refresh_token)
        expect(res.statusCode, res.body).toBe(200)
        const next = res.json<TokenPair>()
        expect(next.refresh_token).not.toBe(tokens.refresh_token)
        expect(next.scope).toBe('read write')
        expect((await tokenInfo(next.access_token)).statusCode).toBe(200)
      })
    })

    it('revokes the whole grant when a rotated refresh token is reused', async () => {
      await asOwner(async (owner) => {
        const { clientId, tokens } = await connect(owner)
        const next = (
          await refresh(clientId, tokens.refresh_token)
        ).json<TokenPair>()
        // Past the grace period for racing refreshes.
        await owner.tx
          .update(oauthTokensTable)
          .set({ rotatedAt: new Date(Date.now() - 60_000) })
          .where(
            eq(
              oauthTokensTable.tokenHash,
              hashAccessToken(tokens.refresh_token),
            ),
          )
        const reuse = await refresh(clientId, tokens.refresh_token)
        expect(reuse.statusCode).toBe(400)
        expect(reuse.json()).toEqual({
          error: 'invalid_grant',
          error_description: 'Invalid refresh token',
        })
        expect((await tokenInfo(next.access_token)).statusCode).toBe(401)
        expect((await refresh(clientId, next.refresh_token)).statusCode).toBe(
          400,
        )
        const [grant] = await owner.tx.select().from(oauthGrantsTable)
        expect(grant.revokedAt).not.toBeNull()
      })
    })

    it('keeps the grant when two refreshes race (grace period)', async () => {
      await asOwner(async (owner) => {
        const { clientId, tokens } = await connect(owner)
        const next = (
          await refresh(clientId, tokens.refresh_token)
        ).json<TokenPair>()
        const racing = await refresh(clientId, tokens.refresh_token)
        expect(racing.json()).toMatchObject({ error: 'invalid_grant' })
        expect((await tokenInfo(next.access_token)).statusCode).toBe(200)
      })
    })

    it('refuses another client or a wider scope', async () => {
      await asOwner(async (owner) => {
        const { clientId, tokens } = await connect(owner, false)
        const wider = await call('POST', '/api/oauth/token', {
          payload: {
            grant_type: 'refresh_token',
            refresh_token: tokens.refresh_token,
            client_id: clientId,
            scope: 'read write',
          },
        })
        expect(wider.json()).toMatchObject({ error: 'invalid_scope' })
        const other = await connect(owner, false)
        const stolen = await refresh(clientId, other.tokens.refresh_token)
        expect(stolen.json()).toMatchObject({ error: 'invalid_grant' })
      })
    })
  })

  describe('revocation', () => {
    it('lets the owner disconnect an application from the profile', async () => {
      await asOwner(async (owner) => {
        const { clientId, tokens } = await connect(owner)
        const list = await call('GET', '/api/oauth/grants', {
          cookie: owner.stale,
        })
        expect(list.statusCode).toBe(200)
        const [grant] = list.json<
          {
            id: string
            clientName: string
            redirectHost: string
            scope: string
          }[]
        >()
        expect(grant).toMatchObject({
          clientName: 'Claude',
          redirectHost: 'claude.ai',
          scope: 'write',
        })
        const revoked = await call('DELETE', `/api/oauth/grants/${grant.id}`, {
          cookie: owner.stale,
        })
        expect(revoked.statusCode).toBe(204)
        expect((await tokenInfo(tokens.access_token)).statusCode).toBe(401)
        expect((await refresh(clientId, tokens.refresh_token)).statusCode).toBe(
          400,
        )
        const after = await call('GET', '/api/oauth/grants', {
          cookie: owner.stale,
        })
        expect(after.json()).toEqual([])
        const again = await call('DELETE', `/api/oauth/grants/${grant.id}`, {
          cookie: owner.stale,
        })
        expect(again.statusCode).toBe(404)
      })
    })

    it('revokes a grant through the RFC 7009 endpoint with its refresh token', async () => {
      await asOwner(async (owner) => {
        const { clientId, tokens } = await connect(owner)
        const res = await call('POST', '/api/oauth/revoke', {
          payload: { token: tokens.refresh_token, client_id: clientId },
        })
        expect(res.statusCode).toBe(200)
        expect((await tokenInfo(tokens.access_token)).statusCode).toBe(401)
        // Unknown tokens are not an error (RFC 7009 §2.2).
        const unknown = await call('POST', '/api/oauth/revoke', {
          payload: { token: `fin_ort_${'x'.repeat(43)}` },
        })
        expect(unknown.statusCode).toBe(200)
      })
    })

    it('revokes only the access token when that is what is presented', async () => {
      await asOwner(async (owner) => {
        const { clientId, tokens } = await connect(owner)
        await call('POST', '/api/oauth/revoke', {
          payload: { token: tokens.access_token },
        })
        expect((await tokenInfo(tokens.access_token)).statusCode).toBe(401)
        expect((await refresh(clientId, tokens.refresh_token)).statusCode).toBe(
          200,
        )
      })
    })

    it('disconnects every application when a password change asks to revoke tokens', async () => {
      await asOwner(async (owner) => {
        const { clientId, tokens } = await connect(owner)
        const res = await call('POST', '/api/auth/change-password', {
          cookie: owner.fresh,
          payload: {
            currentPassword: PASSWORD,
            newPassword: 'another-synthetic-password',
            revokeAccessTokens: true,
          },
        })
        expect(res.statusCode, res.body).toBeLessThan(300)
        expect((await tokenInfo(tokens.access_token)).statusCode).toBe(401)
        expect((await refresh(clientId, tokens.refresh_token)).statusCode).toBe(
          400,
        )
      })
    })

    it('refuses an expired access token', async () => {
      await asOwner(async (owner) => {
        const { tokens } = await connect(owner)
        await owner.tx
          .update(oauthTokensTable)
          .set({ expiresAt: new Date(Date.now() - 1000) })
          .where(eq(oauthTokensTable.kind, 'access'))
        expect((await tokenInfo(tokens.access_token)).statusCode).toBe(401)
      })
    })
  })

  describe('on the API', () => {
    it('limits a read connection to reads, like a read personal access token', async () => {
      await asOwner(async (owner) => {
        const { tokens } = await connect(owner, false)
        const bearer = tokens.access_token
        expect(
          (await call('GET', '/api/accounts', { bearer })).statusCode,
        ).toBe(200)
        const write = await call('PATCH', `/api/transactions/${SOME_UUID}`, {
          bearer,
          payload: { note: 'x' },
        })
        expect(write.statusCode).toBe(403)
      })
    })

    it('lets a write connection call the write routes, never the session-only ones', async () => {
      await asOwner(async (owner) => {
        const { tokens } = await connect(owner, true)
        const bearer = tokens.access_token
        const write = await call('PATCH', `/api/transactions/${SOME_UUID}`, {
          bearer,
          payload: { note: 'x' },
        })
        // Past the guard: the transaction does not exist.
        expect(write.statusCode).toBe(404)
        expect(
          (await call('GET', '/api/access-tokens', { bearer })).statusCode,
        ).toBe(403)
        expect(
          (
            await call('DELETE', `/api/transactions/manual/${SOME_UUID}`, {
              bearer,
            })
          ).statusCode,
        ).toBe(403)
        expect(
          (
            await call('POST', '/api/access-tokens', {
              bearer,
              payload: { name: 'x', scope: 'write' },
            })
          ).statusCode,
        ).toBe(403)
      })
    })

    it('answers token-info to OAuth access tokens only', async () => {
      await asOwner(async (owner) => {
        const pat = await app
          .get(AccessTokensService, { strict: false })
          .create(owner.id, { name: 'Script', scope: 'write' })
        expect((await tokenInfo(pat.token)).statusCode).toBe(403)
        expect(
          (await call('GET', '/api/oauth/token-info', { cookie: owner.stale }))
            .statusCode,
        ).toBe(403)
        const { tokens } = await connect(owner)
        // A refresh token is not an access token.
        expect((await tokenInfo(tokens.refresh_token)).statusCode).toBe(401)
      })
    })

    it('audits every call made with an OAuth token, refused ones included', async () => {
      await asOwner(async (owner) => {
        const { tokens } = await connect(owner, false)
        await call('GET', '/api/accounts', { bearer: tokens.access_token })
        await call('PATCH', `/api/transactions/${SOME_UUID}`, {
          bearer: tokens.access_token,
          payload: { note: 'x' },
        })
        await vi.waitFor(async () => {
          const rows = await owner.tx.select().from(oauthAuditTable)
          expect(rows).toHaveLength(2)
        })
        const audit = await call('GET', '/api/oauth/audit', {
          cookie: owner.stale,
        })
        expect(
          audit
            .json<
              {
                method: string
                route: string
                statusCode: number
                clientName: string
              }[]
            >()
            .map(({ method, route, statusCode, clientName }) => ({
              method,
              route,
              statusCode,
              clientName,
            }))
            .sort((a, b) => a.method.localeCompare(b.method)),
        ).toEqual([
          {
            method: 'GET',
            route: '/api/accounts',
            statusCode: 200,
            clientName: 'Claude',
          },
          {
            method: 'PATCH',
            route: '/api/transactions/:id',
            statusCode: 403,
            clientName: 'Claude',
          },
        ])
        // The personal access token audit is untouched.
        const patAudit = await owner.tx
          .select()
          .from(schema.accessTokenAuditTable)
        expect(patAudit).toEqual([])
      })
    })
  })
})
