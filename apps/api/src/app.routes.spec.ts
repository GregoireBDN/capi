import fastifyCookie from '@fastify/cookie'
import {
  type CanActivate,
  RequestMethod,
  type Type,
  ValidationPipe,
} from '@nestjs/common'
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants'
import { ModulesContainer } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { RouteOptions } from 'fastify'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from './app.module'
import { AccessTokensService } from './auth/access-tokens/access-tokens.service'
import {
  TOKEN_ACCESS_KEY,
  type TokenAccessLevel,
} from './auth/access-tokens/token-access.decorator'
import { JwtGuard } from './auth/guards/jwt.guard'
import { createFastifyAdapter } from './config/fastify-adapter'
import { DatabaseService } from './database/database.service'
import * as schema from './database/schema'
import { usersTable } from './user/user.schema'

/**
 * Route audit of the whole API (#98): every route requires a session except
 * an explicit public allow-list, and the old unguarded `/api/users` CRUD is
 * gone. Routes are discovered from the controllers' metadata and checked
 * against what Fastify actually registered, so a new controller is audited
 * without touching this file; a new public route has to be added below.
 */

// The app's request logger would print a line per request of the audit.
vi.mock('./config/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config/logger')>()
  return {
    ...actual,
    loggerParams: { pinoHttp: { level: 'silent' } },
  }
})

/** Guards that authenticate the caller. Add new ones (e.g. a bearer guard) here. */
const AUTH_GUARDS: Type<CanActivate>[] = [JwtGuard]

/** The only routes reachable without a session. Keep this list short. */
const PUBLIC_ROUTES = [
  'GET /api/health',
  'GET /api/auth/registration-status',
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
  'POST /api/auth/verify-email',
  // Passkey sign-in (#100): it is how a session starts.
  'POST /api/auth/passkeys/authentication/options',
  'POST /api/auth/passkeys/authentication/verify',
].sort()

/**
 * The only routes a personal access token may call with a method other than
 * GET/HEAD (#73), with the level they declare through `@TokenAccess()`. Every
 * other mutating route stays session-only. `write` routes are the MCP write
 * tools (#77); `read` ones save nothing (previews, suggestions). Never add a
 * DELETE, an import, an account, auth, profile or token-management route here.
 */
const TOKEN_MUTATING_ROUTES: Record<string, TokenAccessLevel> = {
  'PATCH /api/categorization-rules/:id': 'write',
  'PATCH /api/recurring/:id': 'write',
  'PATCH /api/savings/goals/:id': 'write',
  'PATCH /api/transactions/:id': 'write',
  'PATCH /api/transactions/manual/:id': 'write',
  'POST /api/accounts/:id/snapshots/bulk': 'write',
  'POST /api/budgets/suggest': 'read',
  'POST /api/categorization-rules': 'write',
  'POST /api/categorization-rules/apply': 'write',
  'POST /api/categorization-rules/preview': 'read',
  'POST /api/categorization-rules/suggest': 'read',
  'POST /api/recurring/confirm': 'write',
  'POST /api/recurring/detect': 'write',
  'POST /api/savings/goals': 'write',
  'POST /api/transactions/bulk-update': 'write',
  'POST /api/transactions/manual': 'write',
  'PUT /api/accounts/:id/snapshots/:date': 'write',
  'PUT /api/budgets/:categoryId': 'write',
  'PUT /api/savings/target': 'write',
}

const SOME_UUID = '7f0c5a7e-2d1b-4c3a-9e8f-123456789abc'

type Db = PostgresJsDatabase<typeof schema>

interface DiscoveredRoute {
  key: string
  method: string
  path: string
  guarded: boolean
  /** What a personal access token needs to call it (see `JwtGuard`). */
  tokenAccess: TokenAccessLevel
}

function joinPath(...parts: string[]): string {
  const path = parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')
  return `/${path}`
}

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return ['']
  return Array.isArray(value) ? value : [value]
}

function declaredTokenAccess(target: object): TokenAccessLevel | undefined {
  return Reflect.getMetadata(TOKEN_ACCESS_KEY, target) as
    | TokenAccessLevel
    | undefined
}

function hasAuthGuard(target: object): boolean {
  const guards =
    (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ??
    []
  return guards.some((guard) =>
    AUTH_GUARDS.includes(guard as Type<CanActivate>),
  )
}

/** Every route declared by a controller, with whether an auth guard covers it. */
function discoverRoutes(app: NestFastifyApplication): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = []
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as Type | null
      if (!controller) continue
      const classGuarded = hasAuthGuard(controller)
      const classTokenAccess = declaredTokenAccess(controller)
      const prefixes = asArray(
        Reflect.getMetadata(PATH_METADATA, controller) as string | string[],
      )
      const proto = controller.prototype as Record<string, unknown>
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name]
        if (name === 'constructor' || typeof handler !== 'function') continue
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
          | RequestMethod
          | undefined
        if (requestMethod === undefined) continue
        const method = RequestMethod[requestMethod]
        // Same resolution as `JwtGuard`: handler, then class, then the method default.
        const tokenAccess =
          declaredTokenAccess(handler) ??
          classTokenAccess ??
          (method === 'GET' || method === 'HEAD' ? 'read' : 'none')
        const paths = asArray(
          Reflect.getMetadata(PATH_METADATA, handler) as string | string[],
        )
        for (const prefix of prefixes) {
          for (const path of paths) {
            const full = joinPath('api', prefix, path)
            routes.push({
              key: `${method} ${full}`,
              method,
              path: full,
              guarded: classGuarded || hasAuthGuard(handler),
              tokenAccess,
            })
          }
        }
      }
    }
  }
  return routes.sort((a, b) => a.key.localeCompare(b.key))
}

describe('API route audit', () => {
  let app: NestFastifyApplication
  let routes: DiscoveredRoute[]
  const registered: string[] = []
  /** The transaction the app's DatabaseService points at, when one is open. */
  let currentTx: Db | undefined

  beforeAll(async () => {
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
    // What the router really serves, to check the metadata discovery is complete.
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRoute', (route: RouteOptions) => {
        for (const method of [route.method].flat()) {
          if (method !== 'HEAD') registered.push(`${method} ${route.url}`)
        }
      })
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
    routes = discoverRoutes(app)
  })

  afterAll(async () => {
    await app?.close()
  })

  let ipCounter = 0
  /** A fresh client address per request, so the global rate limit never kicks in. */
  function nextIp() {
    ipCounter += 1
    return `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`
  }

  function send(method: string, url: string, cookie?: string) {
    return app.inject({
      method: method as 'GET',
      url,
      remoteAddress: nextIp(),
      headers: cookie ? { cookie } : {},
    })
  }

  it('discovers every route Fastify registered', () => {
    expect(routes.length).toBeGreaterThan(PUBLIC_ROUTES.length)
    expect(routes.map((route) => route.key)).toEqual(
      [...new Set(registered)].sort(),
    )
  })

  it('guards every route except the public allow-list', () => {
    const unguarded = routes
      .filter((route) => !route.guarded)
      .map((route) => route.key)
    expect(unguarded).toEqual(PUBLIC_ROUTES)
  })

  it('answers 401 without a session on every guarded route', async () => {
    const guarded = routes.filter((route) => route.guarded)
    const statuses: Record<string, number> = {}
    for (const route of guarded) {
      const url = route.path.replace(/:\w+/g, SOME_UUID)
      const res = await send(route.method, url)
      statuses[route.key] = res.statusCode
    }
    expect(statuses).toEqual(
      Object.fromEntries(guarded.map((route) => [route.key, 401])),
    )
  })

  describe('personal access tokens', () => {
    const mutating = () =>
      routes.filter(
        (route) =>
          route.guarded && route.method !== 'GET' && route.method !== 'HEAD',
      )

    it('reach only the allow-listed mutating routes', () => {
      const reachable = Object.fromEntries(
        mutating()
          .filter((route) => route.tokenAccess !== 'none')
          .map((route) => [route.key, route.tokenAccess]),
      )
      expect(reachable).toEqual(TOKEN_MUTATING_ROUTES)
    })

    it('never reach a DELETE route', () => {
      const deletes = routes.filter((route) => route.method === 'DELETE')
      expect(deletes.length).toBeGreaterThan(0)
      for (const route of deletes) {
        expect(route.tokenAccess, route.key).toBe('none')
      }
    })

    it.each([
      '/api/access-tokens',
      '/api/profile',
      '/api/auth',
      '/api/imports',
    ])('never reach a mutating route under %s', (prefix) => {
      const scoped = mutating().filter((route) => route.path.startsWith(prefix))
      expect(scoped.length).toBeGreaterThan(0)
      for (const route of scoped) {
        expect(route.tokenAccess, route.key).toBe('none')
      }
    })

    it('never reach token management, even with GET', () => {
      const management = routes.filter((route) =>
        route.path.startsWith('/api/access-tokens'),
      )
      expect(management.length).toBeGreaterThan(0)
      for (const route of management) {
        expect(route.tokenAccess, route.key).toBe('none')
      }
    })
  })

  it('no longer routes the old /api/users CRUD', async () => {
    const calls = [
      ['GET', '/api/users'],
      ['POST', '/api/users'],
      ['GET', `/api/users/${SOME_UUID}`],
      ['PATCH', `/api/users/${SOME_UUID}`],
      ['DELETE', `/api/users/${SOME_UUID}`],
    ] as const
    for (const [method, url] of calls) {
      const res = await send(method, url)
      expect(res.statusCode, `${method} ${url}`).toBe(404)
    }
    expect(routes.some((route) => route.path.startsWith('/api/users'))).toBe(
      false,
    )
  })

  describe.skipIf(!process.env.DATABASE_URL)('with a signed-in owner', () => {
    const ROLLBACK = Symbol('rollback')
    let client: postgres.Sql
    let db: Db

    beforeAll(() => {
      client = postgres(process.env.DATABASE_URL!, { max: 1 })
      db = drizzle(client, { schema })
    })

    afterAll(async () => {
      await client.end()
    })

    /** Runs `fn` with a synthetic owner inside a transaction that is rolled back. */
    async function asOwner(
      fn: (owner: { id: string; cookie: string; tx: Db }) => Promise<void>,
    ) {
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
          const token = app
            .get(JwtService, { strict: false })
            .sign({ sub: owner.id })
          await fn({ id: owner.id, cookie: `token=${token}`, tx })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
        .finally(() => {
          currentTx = undefined
        })
    }

    it('never serializes the password hash from GET /api/auth/me', async () => {
      await asOwner(async ({ id, cookie }) => {
        const res = await send('GET', '/api/auth/me', cookie)
        expect(res.statusCode).toBe(200)
        expect(res.json()).toMatchObject({ id, name: 'Owner Test' })
        expect(res.json()).not.toHaveProperty('passwordHash')
        expect(res.body).not.toContain('synthetic-password-hash')
      })
    })

    it('updates only the name and theme of the signed-in owner', async () => {
      await asOwner(async ({ id, cookie }) => {
        const res = await app.inject({
          method: 'PATCH',
          url: '/api/profile',
          remoteAddress: nextIp(),
          headers: { cookie },
          payload: { name: 'Renamed Owner', theme: 'dark' },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json()).toMatchObject({
          id,
          name: 'Renamed Owner',
          theme: 'dark',
        })
        expect(res.body).not.toContain('synthetic-password-hash')
      })
    })

    it.each([
      { email: 'attacker@example.test' },
      { passwordHash: 'attacker-hash' },
      { id: SOME_UUID },
      { theme: 'neon' },
      { name: '' },
    ])('rejects a profile update with %o', async (payload) => {
      await asOwner(async ({ cookie }) => {
        const res = await app.inject({
          method: 'PATCH',
          url: '/api/profile',
          remoteAddress: nextIp(),
          headers: { cookie },
          payload,
        })
        expect(res.statusCode).toBe(400)
      })
    })

    it('refuses profile and token management to a write token', async () => {
      await asOwner(async ({ id }) => {
        const { token } = await app
          .get(AccessTokensService, { strict: false })
          .create(id, { name: 'Audit token', scope: 'write' })
        const bearer = { authorization: `Bearer ${token}` }
        const calls = [
          ['GET', '/api/auth/me', 200],
          ['PATCH', '/api/profile', 403],
          ['DELETE', '/api/profile', 403],
          ['GET', '/api/access-tokens', 403],
          ['POST', '/api/access-tokens', 403],
          ['DELETE', `/api/access-tokens/${SOME_UUID}`, 403],
        ] as const
        for (const [method, url, status] of calls) {
          const res = await app.inject({
            method,
            url,
            remoteAddress: nextIp(),
            headers: bearer,
            payload: method === 'GET' || method === 'DELETE' ? undefined : {},
          })
          expect(res.statusCode, `${method} ${url}`).toBe(status)
        }
      })
    })

    it('deletes the signed-in owner account', async () => {
      await asOwner(async ({ id, cookie, tx }) => {
        const res = await send('DELETE', '/api/profile', cookie)
        expect(res.statusCode).toBe(204)
        const remaining = await tx
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.id, id))
        expect(remaining).toEqual([])
      })
    })
  })
})
