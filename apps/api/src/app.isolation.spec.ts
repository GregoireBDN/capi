import fastifyCookie from '@fastify/cookie'
import { ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { sql } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from './app.module'
import { AccessTokensService } from './auth/access-tokens/access-tokens.service'
import { createFastifyAdapter } from './config/fastify-adapter'
import { createOpenApiDocument } from './config/swagger'
import { DatabaseService } from './database/database.service'
import { generateDemoData } from './database/demo/demo-data'
import { setOwner } from './database/owner-scope'
import * as schema from './database/schema'
import { APP_ROLE } from './database/app-role'
import { registerMultipart } from './imports/upload/multipart'
import { usersTable } from './user/user.schema'

/**
 * Isolation between two users (#558, ADR 0009): user B gets the demo's whole
 * data set, user A a fresh account, and A calls every route of the OpenAPI
 * document with B's ids. Every one answers 404 (never 403 or 409, which
 * would confirm the id exists), B's rows are byte for byte the same after
 * all the calls, and no list or summary A reads carries one of B's ids or
 * labels. Routes come from the document, so a new one is covered by default.
 */

vi.mock('./config/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config/logger')>()
  return { ...actual, loggerParams: { pinoHttp: { level: 'silent' } } }
})

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

interface OpenApiSchema {
  $ref?: string
  type?: string
  format?: string
  enum?: unknown[]
  items?: OpenApiSchema
  properties?: Record<string, OpenApiSchema>
  required?: string[]
  minItems?: number
  minimum?: number
  allOf?: OpenApiSchema[]
  oneOf?: OpenApiSchema[]
  anyOf?: OpenApiSchema[]
  pattern?: string
}
interface OpenApiOperation {
  parameters?: {
    name: string
    in: string
    required?: boolean
    schema?: OpenApiSchema
  }[]
  requestBody?: {
    content: Record<string, { schema?: OpenApiSchema }>
  }
}
interface Route {
  key: string
  method: string
  path: string
  operation: OpenApiOperation
}

/** Global reference data (prices, securities): shared on purpose (ADR 0009). */
const GLOBAL_ROUTES = [
  'PUT /api/crypto/prices/{assetId}',
  'PUT /api/securities/{isin}/prices/{day}',
]

/** Months are the caller's own, never someone else's ids. */
const OWN_MONTH_ROUTES = /\/month-close\/\{month\}/

const ROLLBACK = Symbol('rollback')

describe.skipIf(!process.env.DATABASE_URL).each([
  {
    lock: 'policies',
    about: 'row-level security alone, as the API connects (#557)',
  },
  {
    lock: 'services',
    about: 'the policies switched off: the check of path ids alone',
  },
] as const)('isolation between two users (#558), $about', ({ lock }) => {
  {
    let app: NestFastifyApplication
    let client: postgres.Sql
    let tx: Tx
    let currentTx: Tx | undefined
    let release: () => void
    let done: Promise<void>
    let routes: Route[]
    let components: Record<string, OpenApiSchema>
    let userA: string
    let userB: string
    let cookieA: string
    let tokenA: string
    let tokenB: string
    let cookieB: string
    let fingerprintBefore: Record<string, string>
    /** The ISIN of one of B's position lines (securities are global). */
    let isinB = 'FR0000120271'
    /** Ids that never existed: what A gets for them is what B's ids must get. */
    let ids: 'B' | 'random' = 'B'
    /** B's rows by table, for path ids. */
    const idsB = new Map<string, Record<string, unknown>[]>()
    /** Every id of B's rows, and B's labels, that A must never read. */
    const secretsB = new Set<string>()

    let ip = 0
    const nextIp = () => {
      ip += 1
      return `198.51.${Math.floor(ip / 250)}.${(ip % 250) + 1}`
    }

    function send(
      method: string,
      url: string,
      auth: { cookie?: string; bearer?: string },
      payload?: unknown,
    ) {
      return app.inject({
        method: method as 'GET',
        url,
        remoteAddress: nextIp(),
        headers: {
          ...(auth.cookie ? { cookie: auth.cookie } : {}),
          ...(auth.bearer ? { authorization: `Bearer ${auth.bearer}` } : {}),
        },
        ...(payload === undefined ? {} : { payload: payload as object }),
      })
    }

    /** B's rows of `table`, read as the tables' owner. */
    function rowsOf(table: string) {
      return idsB.get(table) ?? []
    }
    function firstOf(
      table: string,
      where?: (row: Record<string, unknown>) => boolean,
    ) {
      return rowsOf(table).find((row) => !where || where(row))
    }

    async function fingerprintB(): Promise<Record<string, string>> {
      const [{ role }] = await tx.execute<{ role: string }>(
        sql`select current_user as role`,
      )
      await tx.execute(sql`reset role`)
      try {
        const tables = await tx.execute<{ table_name: string }>(sql`
          select c.table_name from information_schema.columns c
          join information_schema.tables t
            on t.table_schema = c.table_schema and t.table_name = c.table_name
          where c.table_schema = 'public' and c.column_name = 'user_id'
            and t.table_type = 'BASE TABLE'
          order by c.table_name`)
        const result: Record<string, string> = {}
        for (const { table_name } of tables) {
          const [row] = await tx.execute<{ digest: string | null }>(
            sql.raw(
              `select md5(string_agg(t::text, ',' order by t::text)) as digest
               from "${table_name}" t where user_id = '${userB}'`,
            ),
          )
          result[table_name] = row?.digest ?? 'empty'
        }
        return result
      } finally {
        await tx.execute(sql.raw(`set local role "${role}"`))
      }
    }

    beforeAll(async () => {
      client = postgres(process.env.DATABASE_URL!, {
        max: 1,
        onnotice: () => {},
      })
      const db = drizzle(client, { schema })
      // One transaction for the whole suite, rolled back at the end.
      const opened = new Promise<Tx>((resolve) => {
        done = db
          .transaction(async (open) => {
            resolve(open)
            await new Promise<void>((r) => (release = r))
            throw ROLLBACK
          })
          .catch((error: unknown) => {
            if (error !== ROLLBACK) throw error
          })
      })
      tx = await opened
      currentTx = tx

      // `db` is the suite's transaction; each request is a savepoint of it
      // as its user, like the request scope of production.
      const database = Object.create(
        DatabaseService.prototype,
      ) as DatabaseService
      Object.defineProperty(database, 'fixed', { get: () => currentTx })
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DatabaseService)
        .useValue(database)
        .compile()
      app = moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter(),
        { logger: false },
      )
      await app.register(fastifyCookie)
      await registerMultipart(app)
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

      const document = createOpenApiDocument(app)
      components = (document.components?.schemas ?? {}) as Record<
        string,
        OpenApiSchema
      >
      routes = Object.entries(document.paths).flatMap(([path, item]) =>
        Object.entries(item as Record<string, OpenApiOperation>)
          .filter(([method]) =>
            ['get', 'post', 'put', 'patch', 'delete'].includes(method),
          )
          .map(([method, operation]) => ({
            key: `${method.toUpperCase()} ${path}`,
            method: method.toUpperCase(),
            path,
            operation,
          })),
      )

      if (lock === 'services') {
        // Rolled back with the rest: the policies are off for this run only.
        const tables = await tx.execute<{ table_name: string }>(sql`
          select table_name from information_schema.columns
          where table_schema = 'public' and column_name = 'user_id'`)
        for (const { table_name } of tables) {
          await tx.execute(
            sql.raw(`alter table "${table_name}" disable row level security`),
          )
        }
      }

      // B: the demo's whole data set, plus the identity rows it lacks.
      await generateDemoData(tx, { bcryptRounds: 4 })
      const [b] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(sql`${usersTable.email} = 'usertest@finances.test'`)
      userB = b.id
      await setOwner(tx, userB)
      const tokens = app.get(AccessTokensService, { strict: false })
      tokenB = (await tokens.create(userB, { name: 'B', scope: 'write' })).token
      await seedMissingRows(tx, userB)

      // A: a fresh account with nothing in it.
      const [a] = await tx
        .insert(usersTable)
        .values({
          email: 'user-a@capi.test',
          name: 'User A',
          emailVerifiedAt: new Date(),
        })
        .returning({ id: usersTable.id })
      userA = a.id
      tokenA = (await tokens.create(userA, { name: 'A', scope: 'write' })).token
      cookieA = `token=${app.get(JwtService, { strict: false }).sign({
        sub: userA,
        auth_time: Math.floor(Date.now() / 1000),
      })}`

      // What B owns, read as the tables' owner.
      const tables = await tx.execute<{ table_name: string }>(sql`
        select table_name from information_schema.columns
        where table_schema = 'public' and column_name = 'user_id'`)
      for (const { table_name } of tables) {
        const rows = await tx.execute<Record<string, unknown>>(
          sql.raw(`select * from "${table_name}" where user_id = '${userB}'`),
        )
        idsB.set(table_name, [...rows])
        for (const row of rows) {
          if (typeof row.id === 'string') secretsB.add(row.id)
          if (
            table_name === 'transactions' &&
            typeof row.raw_label === 'string'
          )
            secretsB.add(row.raw_label)
        }
      }

      const lineB = firstOf('position_lines')
      if (lineB) {
        const [security] = await tx.execute<{ isin: string }>(
          sql`select isin from securities where id = ${lineB.security_id as string}`,
        )
        isinB = security.isin
      }

      cookieB = `token=${app.get(JwtService, { strict: false }).sign({
        sub: userB,
        auth_time: Math.floor(Date.now() / 1000),
      })}`
      fingerprintBefore = await fingerprintB()

      // From here on, the app reads and writes as the API does.
      await tx.execute(sql.raw(`set local role ${APP_ROLE}`))
    }, 120_000)

    afterAll(async () => {
      await app?.close()
      release?.()
      await done
      await client?.end()
    })

    /** A value for a path parameter: B's row of the matching kind. */
    function pathValue(route: Route, name: string): string | undefined {
      const value = pathValueOfB(route, name)
      if (ids === 'random' && value && /^[0-9a-f-]{36}$/.test(value))
        return crypto.randomUUID()
      return value
    }

    function pathValueOfB(route: Route, name: string): string | undefined {
      const path = route.path
      const account = (type?: string) =>
        firstOf('accounts', (row) => !type || row.type === type)?.id as
          | string
          | undefined
      switch (name) {
        case 'id': {
          const prefix = path.split('/')[2]
          if (prefix === 'accounts') {
            if (/wallet/.test(path))
              return firstOf(
                'accounts',
                (row) => row.crypto_source === 'wallet',
              )?.id as string
            if (/holdings|crypto/.test(path)) return account('crypto')
            if (/positions/.test(path)) return account('brokerage')
            if (/dividends/.test(path)) return account('securities')
            if (/snapshots|performance|invested-base/.test(path))
              return account('life_insurance')
            return account('checking')
          }
          const byPrefix: Record<string, string> = {
            'access-tokens': 'personal_access_tokens',
            categories: 'categories',
            'categorization-rules': 'categorization_rules',
            imports: 'imports',
            'import-profiles': 'import_profiles',
            recurring: 'recurring_items',
            contacts: 'contacts',
            'crypto-movements': 'crypto_movements',
            'crypto-imports': 'crypto_imports',
            envelopes: 'envelopes',
            oauth: 'oauth_grants',
          }
          if (prefix === 'transactions') {
            return firstOf('transactions', (row) =>
              path.includes('/manual/') ? row.manual === true : !row.manual,
            )?.id as string
          }
          if (prefix === 'receivables') {
            if (path.includes('/offsets/'))
              return firstOf('receivable_offsets')?.id as string
            if (path.includes('/payments/'))
              return firstOf('receivable_payments')?.id as string
            return firstOf('receivables')?.id as string
          }
          if (prefix === 'auth') {
            if (path.includes('/passkeys/'))
              return firstOf('webauthn_credentials')?.id as string
            return firstOf('refresh_tokens')?.family_id as string
          }
          const table = byPrefix[prefix]
          return table ? (firstOf(table)?.id as string) : undefined
        }
        case 'categoryId':
          return firstOf('categories')?.id as string
        case 'transactionId':
          return firstOf('transactions')?.id as string
        case 'holdingId':
          return firstOf('crypto_holdings')?.id as string
        case 'keyId':
          return firstOf('crypto_wallet_keys')?.id as string
        case 'tokenId':
          return firstOf('crypto_wallet_tokens')?.id as string
        case 'dividendId':
          return firstOf('dividends')?.id as string
        case 'lineNumber':
          return '1'
        case 'date':
          return String(firstOf('balance_snapshots')?.date ?? '2026-01-31')
        case 'asOf':
          return String(firstOf('position_statements')?.as_of ?? '2026-01-31')
        case 'isin':
          return isinB
        case 'month':
          return '2026-01'
        default:
          return undefined
      }
    }

    function resolveSchema(schema: OpenApiSchema | undefined): OpenApiSchema {
      if (!schema) return {}
      if (schema.$ref) {
        const name = schema.$ref.split('/').pop()!
        return resolveSchema(components[name])
      }
      if (schema.allOf?.length) {
        return schema.allOf.reduce<OpenApiSchema>((merged, part) => {
          const resolved = resolveSchema(part)
          return {
            ...merged,
            ...resolved,
            properties: { ...merged.properties, ...resolved.properties },
            required: [
              ...(merged.required ?? []),
              ...(resolved.required ?? []),
            ],
          }
        }, {})
      }
      return schema
    }

    /** B's id for a body field that names a row (`accountId`, …). */
    function bodyId(name: string): string | undefined {
      const table: Record<string, string> = {
        accountId: 'accounts',
        counterpartAccountId: 'accounts',
        categoryId: 'categories',
        transactionId: 'transactions',
        contactId: 'contacts',
        receivableId: 'receivables',
        envelopeId: 'envelopes',
        recurringItemId: 'recurring_items',
        importId: 'imports',
        ruleId: 'categorization_rules',
        profileId: 'import_profiles',
      }
      const key = table[name]
      if (!key) return undefined
      if (ids === 'random') return crypto.randomUUID()
      return firstOf(key)?.id as string | undefined
    }

    /** A body that passes validation where it can, naming B's rows. */
    function sample(schema: OpenApiSchema | undefined, name = ''): unknown {
      const s = resolveSchema(schema)
      const variant = s.oneOf?.[0] ?? s.anyOf?.[0]
      if (variant) return sample(variant, name)
      if (s.enum?.length) return s.enum[0]
      switch (s.type) {
        case 'object':
        case undefined: {
          if (!s.properties) return s.type === 'object' ? {} : undefined
          const body: Record<string, unknown> = {}
          // A contact is named by id or by name, neither required alone.
          const fields = [...(s.required ?? [])]
          if (s.properties.contactId) fields.push('contactId')
          for (const field of fields) {
            body[field] = sample(s.properties[field], field)
          }
          return body
        }
        case 'array':
          return Array.from({ length: Math.max(1, s.minItems ?? 1) }, () =>
            sample(s.items, name.replace(/s$/, '')),
          )
        case 'integer':
        case 'number':
          return Math.max(s.minimum ?? 1, 1)
        case 'boolean':
          return false
        default: {
          if (name === 'assetId') return 'bitcoin'
          if (name === 'isin') return isinB
          if (/quantity|price/i.test(name)) return '1.5'
          if (s.format === 'uuid' || /Id$/.test(name))
            return bodyId(name) ?? bodyId(`${name}Id`) ?? crypto.randomUUID()
          if (s.format === 'date' || /(On|Date|date|day|asOf)$/.test(name))
            return '2026-01-15'
          if (/month/i.test(name)) return '2026-01'
          return 'Test'
        }
      }
    }

    /** Per route, a body the validation accepts when the generic one can't do. */
    function override(route: Route): unknown {
      const contactId =
        ids === 'random'
          ? crypto.randomUUID()
          : (firstOf('contacts')?.id as string)
      switch (route.key) {
        case 'PUT /api/accounts/{id}/crypto-source':
          return { cryptoSource: 'exchange', cryptoProvider: 'binance' }
        case 'PUT /api/import-profiles/{id}':
          return {
            name: 'Profil',
            headers: ['Jour', 'Texte', 'Somme'],
            encoding: 'utf-8',
            delimiter: ';',
            decimalSeparator: ',',
            dateFormat: 'dd/mm/yyyy',
            columns: { date: 'Jour', label: 'Texte', amount: 'Somme' },
          }
        case 'POST /api/accounts/{id}/wallet-tokens':
          return { assetId: 'usd-coin', symbol: 'USDC', name: 'USD Coin' }
        case 'PUT /api/transactions/{id}/shares':
          return { shares: [{ contactId, amountCents: 100 }] }
        case 'PUT /api/recurring/{id}/share':
          return { contactId, bps: 5_000 }
        default:
          return undefined
      }
    }

    function call(route: Route, url: string) {
      const content = route.operation.requestBody?.content
      if (content?.['multipart/form-data']) {
        const boundary = 'isolation-boundary'
        return app.inject({
          method: route.method as 'POST',
          url,
          remoteAddress: nextIp(),
          headers: {
            cookie: cookieA,
            'content-type': `multipart/form-data; boundary=${boundary}`,
          },
          payload: [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="export.csv"',
            'Content-Type: text/csv',
            '',
            'Date,Montant',
            '2026-01-15,1',
            `--${boundary}--`,
            '',
          ].join('\r\n'),
        })
      }
      const json = content?.['application/json']
      const payload =
        route.method === 'GET' || route.method === 'DELETE'
          ? undefined
          : (override(route) ?? (json ? sample(json.schema) : undefined) ?? {})
      return send(route.method, url, { cookie: cookieA }, payload)
    }

    function idRoutes() {
      return routes.filter(
        (route) =>
          route.path.includes('{') &&
          !GLOBAL_ROUTES.includes(route.key) &&
          !OWN_MONTH_ROUTES.test(route.path),
      )
    }

    it('has one of B’s rows for every path id', () => {
      const missing: string[] = []
      for (const route of idRoutes()) {
        for (const [, name] of route.path.matchAll(/\{(\w+)\}/g)) {
          if (!pathValue(route, name)) missing.push(`${route.key} {${name}}`)
        }
      }
      expect(missing).toEqual([])
    })

    it('lets B read its own rows by the same addresses (control)', async () => {
      const statuses: Record<string, number> = {}
      for (const route of idRoutes().filter((r) => r.method === 'GET')) {
        const url = route.path.replace(
          /\{(\w+)\}/g,
          (_, name: string) => pathValue(route, name)!,
        )
        statuses[route.key] = (
          await send('GET', url, { cookie: cookieB })
        ).statusCode
      }
      if (lock === 'policies')
        expect(Object.keys(statuses).length).toBeGreaterThan(15)
      expect(statuses).toEqual(
        Object.fromEntries(Object.keys(statuses).map((key) => [key, 200])),
      )
    })

    it('answers 404 to A for every route that names one of B’s rows', async () => {
      const statuses: Record<string, number> = {}
      for (const route of idRoutes()) {
        const url = route.path.replace(
          /\{(\w+)\}/g,
          (_, name: string) => pathValue(route, name) ?? crypto.randomUUID(),
        )
        const res = await call(route, url)
        statuses[route.key] = res.statusCode
      }
      expect(statuses).toEqual(
        Object.fromEntries(Object.keys(statuses).map((key) => [key, 404])),
      )
    }, 120_000)

    /** Routes without a path id whose body names one of B's rows. */
    function bodyRoutes() {
      return routes.filter((route) => {
        // Bodies are the policies' and composite keys' (#555) to check.
        if (lock === 'services') return false
        if (route.path.includes('{') || route.method === 'GET') return false
        const json = route.operation.requestBody?.content['application/json']
        if (!json) return false
        const body = JSON.stringify(override(route) ?? sample(json.schema))
        return [...secretsB].some((secret) => body.includes(secret))
      })
    }

    it('answers A for B’s ids exactly as for ids that never existed', async () => {
      const checked = [...idRoutes(), ...bodyRoutes()]
      if (lock === 'policies')
        expect(checked.length).toBeGreaterThan(idRoutes().length + 5)
      const answer = async (which: 'B' | 'random') => {
        ids = which
        const answers: Record<string, string> = {}
        for (const route of checked) {
          const url = route.path.replace(
            /\{(\w+)\}/g,
            (_, name: string) => pathValue(route, name) ?? crypto.randomUUID(),
          )
          const res = await call(route, url)
          const body = res.json() as { message?: unknown }
          answers[route.key] =
            `${res.statusCode} ${JSON.stringify(body.message)}`
        }
        ids = 'B'
        return answers
      }
      const ofB = await answer('B')
      expect(ofB).toEqual(await answer('random'))
    }, 120_000)

    it('leaves every row of B as it was after all of A’s calls', async () => {
      expect(await fingerprintB()).toEqual(fingerprintBefore)
    }, 120_000)

    // Lists and summaries rely on the policies, which the API refuses to
    // start without (`database/row-security.ts`).
    it.skipIf(lock === 'services')(
      'never shows A one of B’s rows in a list or a summary',
      async () => {
        const leaks: Record<string, string> = {}
        let shownToB = 0
        const reads = routes.filter(
          (route) =>
            route.method === 'GET' &&
            (!route.path.includes('{') || OWN_MONTH_ROUTES.test(route.path)),
        )
        for (const route of reads) {
          const query = (route.operation.parameters ?? [])
            .filter((p) => p.in === 'query' && p.required)
            .map((p) => {
              ids = 'random'
              const value = sample(p.schema, p.name)
              ids = 'B'
              return `${p.name}=${encodeURIComponent(String(value))}`
            })
            .join('&')
          const url =
            route.path.replace('{month}', '2026-01') +
            (query ? `?${query}` : '')
          for (const auth of [{ cookie: cookieA }, { bearer: tokenA }]) {
            const res = await send('GET', url, auth)
            const found = [...secretsB].find((secret) =>
              res.body.includes(secret),
            )
            if (found) leaks[route.key] = `${res.statusCode}`
          }
          // Control: the same read shows B its own rows.
          const own = await send('GET', url, { cookie: cookieB })
          if ([...secretsB].some((secret) => own.body.includes(secret)))
            shownToB += 1
        }
        expect(leaks).toEqual({})
        expect(shownToB).toBeGreaterThan(20)
      },
      120_000,
    )

    it.skipIf(lock === 'services')(
      'gives the tokens of A and B two different accounts_overview',
      async () => {
        // What the MCP's accounts_overview reads (apps/mcp/src/tools/accounts.ts).
        const overview = async (bearer: string) => {
          const [dashboard, envelopes] = await Promise.all([
            send('GET', '/api/dashboard/overview', { bearer }),
            send('GET', '/api/envelopes', { bearer }),
          ])
          expect([dashboard.statusCode, envelopes.statusCode]).toEqual([
            200, 200,
          ])
          return dashboard.body + envelopes.body
        }
        const accountsOfB = rowsOf('accounts')
          .filter((row) => row.archived_at == null)
          .map((row) => row.id as string)
        const ofB = await overview(tokenB)
        expect(accountsOfB.filter((id) => !ofB.includes(id))).toEqual([])
        const ofA = await overview(tokenA)
        expect([...secretsB].filter((secret) => ofA.includes(secret))).toEqual(
          [],
        )
      },
    )
  }
})

/**
 * B's rows the demo has no use for: a passkey, a session, an OAuth grant,
 * an import profile, a wallet's key and token, an offset.
 */
async function seedMissingRows(tx: Tx, userId: string) {
  await tx.insert(schema.webauthnCredentialsTable).values({
    userId,
    credentialId: `cred-${userId}`,
    publicKey: 'synthetic-public-key',
    deviceType: 'multiDevice',
    name: 'Passkey B',
  })
  await tx.insert(schema.refreshTokensTable).values({
    userId,
    familyId: crypto.randomUUID(),
    tokenHash: `hash-${userId}`,
    expiresAt: new Date(Date.now() + 86_400_000),
  })
  const [client] = await tx
    .insert(schema.oauthClientsTable)
    .values({
      clientId: `client-${userId}`.slice(0, 64),
      clientName: 'Client B',
      redirectUris: ['https://example.test/callback'],
    })
    .returning({ id: schema.oauthClientsTable.id })
  await tx.insert(schema.oauthGrantsTable).values({
    userId,
    clientId: client.id,
    scope: 'read',
    resource: 'https://example.test/mcp',
    expiresAt: new Date(Date.now() + 86_400_000),
  })
  await tx.insert(schema.importProfilesTable).values({
    name: 'Profil B',
    target: 'cash',
    encoding: 'utf-8',
    delimiter: ';',
    decimalSeparator: ',',
    dateFormat: 'dd/mm/yyyy',
    headers: ['Jour', 'Texte', 'Somme'],
    columns: { date: 'Jour', label: 'Texte', amount: 'Somme' },
  })
  const [wallet] = await tx
    .insert(schema.accountsTable)
    .values({
      name: 'Wallet B',
      type: 'crypto',
      cryptoSource: 'wallet',
      position: 99,
    })
    .returning({ id: schema.accountsTable.id })
  await tx.insert(schema.cryptoWalletKeysTable).values({
    accountId: wallet.id,
    family: 'evm',
    publicKey: '0x000000000000000000000000000000000000dEaD',
    chains: ['ethereum'],
  })
  await tx.insert(schema.cryptoWalletTokensTable).values({
    accountId: wallet.id,
    assetId: 'usd-coin',
    symbol: 'USDC',
    name: 'USD Coin',
  })
  const [contact] = await tx
    .select({ id: schema.contactsTable.id })
    .from(schema.contactsTable)
    .where(sql`${schema.contactsTable.userId} = ${userId}`)
    .limit(1)
  // The offset's repayments are checked at commit, which never comes.
  await tx.insert(schema.receivableOffsetsTable).values({
    contactId: contact.id,
    amountCents: 100,
    offsetOn: '2026-01-15',
  })
}
