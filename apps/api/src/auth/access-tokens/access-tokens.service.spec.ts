import '#/load-env'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accessTokenAuditTable,
  personalAccessTokensTable,
  usersTable,
} from '#/database/schema'
import { MAX_ACTIVE_ACCESS_TOKENS } from './access-tokens.constants'
import { AccessTokensService, hashAccessToken } from './access-tokens.service'

/**
 * Integration checks against the dedicated test database (see
 * `vitest.config.ts`). Every test runs in a transaction that is rolled back.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
const NOW = new Date('2026-11-06T10:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const later = (ms: number) => new Date(NOW.getTime() + ms)

describe.skipIf(!process.env.DATABASE_URL)(
  'AccessTokensService (database)',
  () => {
    let client: postgres.Sql
    let db: Db

    beforeAll(() => {
      client = postgres(process.env.DATABASE_URL!, { max: 1 })
      db = drizzle(client, { schema })
    })

    afterAll(async () => {
      await client.end()
    })

    async function inRollback(
      fn: (f: {
        tx: Tx
        tokens: AccessTokensService
        userId: string
      }) => Promise<void>,
    ) {
      await db
        .transaction(async (tx) => {
          const [user] = await tx
            .insert(usersTable)
            .values({ email: 'owner@example.test', name: 'Owner' })
            .returning()
          await fn({
            tx,
            tokens: new AccessTokensService({ db: tx } as never),
            userId: user.id,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    it('returns the token once and stores only its hash and prefix', async () => {
      await inRollback(async ({ tx, tokens, userId }) => {
        const created = await tokens.create(
          userId,
          { name: ' Claude ', scope: 'read' },
          NOW,
        )

        expect(created.token).toMatch(/^fin_pat_[A-Za-z0-9_-]{43}$/)
        expect(created).toMatchObject({
          name: 'Claude',
          scope: 'read',
          tokenPrefix: created.token.slice(0, 12),
          expiresAt: null,
          lastUsedAt: null,
          expired: false,
        })

        const [row] = await tx
          .select()
          .from(personalAccessTokensTable)
          .where(eq(personalAccessTokensTable.id, created.id))
        expect(row.tokenHash).toBe(hashAccessToken(created.token))
        expect(JSON.stringify(row)).not.toContain(created.token)

        const listed = await tokens.list(userId, NOW)
        expect(listed).toHaveLength(1)
        expect(listed[0]).not.toHaveProperty('token')
      })
    })

    it('authenticates an active token and records its last use', async () => {
      await inRollback(async ({ tokens, userId }) => {
        const { id, token } = await tokens.create(
          userId,
          { name: 'Script', scope: 'write' },
          NOW,
        )

        await expect(tokens.authenticate(token, later(1000))).resolves.toEqual({
          id,
          userId,
          scope: 'write',
        })
        const [listed] = await tokens.list(userId, later(2000))
        expect(listed.lastUsedAt).toBe(later(1000).toISOString())

        // Within a minute the last-use date is not rewritten.
        await tokens.authenticate(token, later(30_000))
        const [again] = await tokens.list(userId, later(31_000))
        expect(again.lastUsedAt).toBe(later(1000).toISOString())
      })
    })

    it('rejects malformed and unknown tokens', async () => {
      await inRollback(async ({ tokens }) => {
        await expect(
          tokens.authenticate('not-a-token', NOW),
        ).resolves.toBeNull()
        await expect(
          tokens.authenticate(`fin_pat_${'x'.repeat(43)}`, NOW),
        ).resolves.toBeNull()
      })
    })

    it('rejects an expired token and lists it as expired', async () => {
      await inRollback(async ({ tokens, userId }) => {
        const { token, expiresAt } = await tokens.create(
          userId,
          { name: 'Short', scope: 'read', expiresInDays: 7 },
          NOW,
        )
        expect(expiresAt).toBe(later(7 * DAY_MS).toISOString())

        await expect(
          tokens.authenticate(token, later(7 * DAY_MS - 1)),
        ).resolves.not.toBeNull()
        await expect(
          tokens.authenticate(token, later(7 * DAY_MS)),
        ).resolves.toBeNull()
        const [listed] = await tokens.list(userId, later(8 * DAY_MS))
        expect(listed.expired).toBe(true)
      })
    })

    it('rejects a revoked token and hides it from the list', async () => {
      await inRollback(async ({ tokens, userId }) => {
        const { id, token } = await tokens.create(
          userId,
          { name: 'Old', scope: 'read' },
          NOW,
        )

        await tokens.revoke(userId, id, later(1000))

        await expect(
          tokens.authenticate(token, later(2000)),
        ).resolves.toBeNull()
        await expect(tokens.list(userId, later(2000))).resolves.toEqual([])
        await expect(tokens.revoke(userId, id, later(3000))).rejects.toThrow(
          NotFoundException,
        )
      })
    })

    it("cannot revoke another user's token", async () => {
      await inRollback(async ({ tx, tokens, userId }) => {
        const [other] = await tx
          .insert(usersTable)
          .values({ email: 'other@example.test', name: 'Other' })
          .returning()
        const { id, token } = await tokens.create(
          userId,
          { name: 'Mine', scope: 'read' },
          NOW,
        )

        await expect(tokens.revoke(other.id, id, NOW)).rejects.toThrow(
          NotFoundException,
        )
        await expect(tokens.authenticate(token, NOW)).resolves.not.toBeNull()
      })
    })

    it('caps the number of active tokens', async () => {
      await inRollback(async ({ tokens, userId }) => {
        for (let i = 0; i < MAX_ACTIVE_ACCESS_TOKENS; i++) {
          await tokens.create(
            userId,
            { name: `Token ${i}`, scope: 'read' },
            NOW,
          )
        }
        await expect(
          tokens.create(userId, { name: 'One too many', scope: 'read' }, NOW),
        ).rejects.toThrow(BadRequestException)
      })
    })

    it('renames a token, never one of another user or a revoked one', async () => {
      await inRollback(async ({ tx, tokens, userId }) => {
        const [other] = await tx
          .insert(usersTable)
          .values({ email: 'other@example.test', name: 'Other' })
          .returning()
        const { id } = await tokens.create(
          userId,
          { name: 'Claude', scope: 'read' },
          NOW,
        )

        const renamed = await tokens.rename(
          userId,
          id,
          { name: '  Claude Desktop  ' },
          NOW,
        )
        expect(renamed).toMatchObject({ id, name: 'Claude Desktop' })
        await expect(
          tokens.rename(userId, id, { name: '   ' }, NOW),
        ).rejects.toThrow(BadRequestException)
        await expect(
          tokens.rename(other.id, id, { name: 'Mine now' }, NOW),
        ).rejects.toThrow(NotFoundException)

        await tokens.revoke(userId, id, NOW)
        await expect(
          tokens.rename(userId, id, { name: 'Gone' }, NOW),
        ).rejects.toThrow(NotFoundException)
      })
    })

    it('filters the audit trail by token', async () => {
      await inRollback(async ({ tokens, userId }) => {
        const first = await tokens.create(
          userId,
          { name: 'First', scope: 'read' },
          NOW,
        )
        const second = await tokens.create(
          userId,
          { name: 'Second', scope: 'read' },
          NOW,
        )
        const use = { method: 'GET', route: '/api/accounts', statusCode: 200 }
        await tokens.recordUse({ ...use, tokenId: first.id }, NOW)
        await tokens.recordUse({ ...use, tokenId: second.id }, later(1000))

        const audit = await tokens.audit(userId, 10, first.id)
        expect(audit.map((entry) => entry.tokenName)).toEqual(['First'])
        await expect(tokens.audit(userId, 10)).resolves.toHaveLength(2)
      })
    })

    it('keeps an audit trail and prunes entries past the retention period', async () => {
      await inRollback(async ({ tx, tokens, userId }) => {
        const { id } = await tokens.create(
          userId,
          { name: 'Audited', scope: 'read' },
          NOW,
        )
        const use = {
          tokenId: id,
          method: 'GET',
          route: '/api/accounts',
          statusCode: 200,
        }

        await tokens.recordUse(use, NOW)
        await tokens.recordUse({ ...use, statusCode: 403 }, later(1000))

        const audit = await tokens.audit(userId, 10)
        expect(audit.map((entry) => entry.statusCode)).toEqual([403, 200])
        expect(audit[0]).toMatchObject({
          tokenName: 'Audited',
          route: '/api/accounts',
        })

        // 91 days later the first prune of this process removes both old rows.
        await tokens.recordUse(use, later(91 * DAY_MS))
        const rows = await tx.select().from(accessTokenAuditTable)
        expect(rows).toHaveLength(1)
      })
    })
  },
)
