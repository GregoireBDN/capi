import '#/load-env'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  transactionsTable,
} from '#/database/schema'
import { ManualExpensesService } from './manual-expenses.service'
import { TransactionsService } from './transactions.service'

/**
 * Expenses noted by hand (#137), against the migrated test database. Every
 * test runs in a transaction that is rolled back. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

/** 23:30 UTC on Oct 31 = 00:30 on Nov 1 in Paris. */
const NOW = new Date('2026-10-31T23:30:00Z')

interface Fixture {
  tx: Tx
  service: ManualExpensesService
  checking: string
  outings: string
  groceries: string
  salary: string
}

describe.skipIf(!process.env.DATABASE_URL)(
  'ManualExpensesService (database)',
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

    async function withFixture(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          // Created first: the default account is the oldest open checking.
          const [archived] = await tx
            .insert(accountsTable)
            .values({
              name: 'Old checking',
              type: 'checking',
              createdAt: new Date('2020-01-01T00:00:00Z'),
              archivedAt: new Date('2021-01-01T00:00:00Z'),
            })
            .returning()
          const [savings] = await tx
            .insert(accountsTable)
            .values({
              name: 'Savings',
              type: 'savings',
              createdAt: new Date('2020-02-01T00:00:00Z'),
            })
            .returning()
          const [checking] = await tx
            .insert(accountsTable)
            .values({
              name: 'Checking',
              type: 'checking',
              createdAt: new Date('2020-03-01T00:00:00Z'),
            })
            .returning()
          expect(archived.id).not.toBe(savings.id)
          const [outings, groceries, salary] = await tx
            .insert(categoriesTable)
            .values([
              {
                slug: 'manual_test_outings',
                name: 'Sorties test',
                kind: 'expense',
              },
              {
                slug: 'manual_test_groceries',
                name: 'Courses test',
                kind: 'expense',
              },
              {
                slug: 'manual_test_salary',
                name: 'Salaire test',
                kind: 'income',
              },
            ])
            .returning()
          const database = { db: tx } as never
          await fn({
            tx,
            service: new ManualExpensesService(
              database,
              new TransactionsService(database),
            ),
            checking: checking.id,
            outings: outings.id,
            groceries: groceries.id,
            salary: salary.id,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    async function row(tx: Tx, id: string) {
      const [stored] = await tx
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, id))
      return stored
    }

    it('notes an expense with defaults: today in Paris, checking, category name', async () => {
      await withFixture(async ({ tx, service, checking, outings }) => {
        const created = await service.create(
          { amountCents: 1_250, categoryId: outings },
          NOW,
        )
        expect(created).toMatchObject({
          accountId: checking,
          accountName: 'Checking',
          importId: null,
          bookingDate: '2026-11-01',
          amountCents: -1_250,
          rawLabel: 'Sorties test',
          kind: 'expense',
          categoryId: outings,
          ruleId: null,
          needsReview: false,
          manual: true,
        })
        const stored = await row(tx, created.id)
        expect(stored.balanceAfterCents).toBeNull()
        expect(stored.dedupeHash).toMatch(/^manual:[0-9a-f-]{36}$/)
      })
    })

    it('takes a label, a day and another account', async () => {
      await withFixture(async ({ tx, service, outings }) => {
        const [savings] = await tx
          .select()
          .from(accountsTable)
          .where(eq(accountsTable.name, 'Savings'))
        const created = await service.create(
          {
            amountCents: 990,
            categoryId: outings,
            label: 'Ciné',
            bookingDate: '2026-10-20',
            accountId: savings.id,
          },
          NOW,
        )
        expect(created).toMatchObject({
          accountId: savings.id,
          bookingDate: '2026-10-20',
          rawLabel: 'Ciné',
        })
      })
    })

    it('refuses what is not an expense noted on an open cash account', async () => {
      await withFixture(async ({ tx, service, outings, salary }) => {
        const [archived] = await tx
          .select()
          .from(accountsTable)
          .where(eq(accountsTable.name, 'Old checking'))
        const [pea] = await tx
          .insert(accountsTable)
          .values({ name: 'PEA', type: 'brokerage' })
          .returning()
        const cases = [
          { amountCents: 100, categoryId: salary },
          {
            amountCents: 100,
            categoryId: '00000000-0000-4000-8000-000000000000',
          },
          { amountCents: 100, categoryId: outings, accountId: pea.id },
          { amountCents: 100, categoryId: outings, accountId: archived.id },
          { amountCents: 100, categoryId: outings, bookingDate: '2026-11-02' },
        ]
        for (const dto of cases) {
          await expect(service.create(dto, NOW)).rejects.toBeInstanceOf(
            BadRequestException,
          )
        }
      })
    })

    it('needs a checking account when none is given', async () => {
      await withFixture(async ({ tx, service, outings, checking }) => {
        await tx
          .update(accountsTable)
          .set({ archivedAt: new Date() })
          .where(eq(accountsTable.id, checking))
        await expect(
          service.create({ amountCents: 100, categoryId: outings }, NOW),
        ).rejects.toThrow(/checking account/)
      })
    })

    it('edits it; a default label follows the category', async () => {
      await withFixture(async ({ service, outings, groceries }) => {
        const created = await service.create(
          { amountCents: 1_250, categoryId: outings },
          NOW,
        )
        const moved = await service.update(
          created.id,
          { categoryId: groceries, amountCents: 1_300 },
          NOW,
        )
        expect(moved).toMatchObject({
          categoryId: groceries,
          amountCents: -1_300,
          rawLabel: 'Courses test',
        })
        const labelled = await service.update(
          created.id,
          { label: 'Marché', bookingDate: '2026-10-30' },
          NOW,
        )
        expect(labelled).toMatchObject({
          rawLabel: 'Marché',
          bookingDate: '2026-10-30',
        })
        // A typed label stays when the category changes.
        expect(
          await service.update(created.id, { categoryId: outings }, NOW),
        ).toMatchObject({ rawLabel: 'Marché' })
        expect(
          await service.update(created.id, { label: null }, NOW),
        ).toMatchObject({ rawLabel: 'Sorties test' })
        await expect(
          service.update(created.id, {}, NOW),
        ).rejects.toBeInstanceOf(BadRequestException)
        await expect(
          service.update(created.id, { bookingDate: '2026-12-01' }, NOW),
        ).rejects.toBeInstanceOf(BadRequestException)
      })
    })

    it('deletes it, and never touches an imported transaction', async () => {
      await withFixture(async ({ tx, service, outings, checking }) => {
        const created = await service.create(
          { amountCents: 1_250, categoryId: outings },
          NOW,
        )
        await service.remove(created.id)
        expect(await row(tx, created.id)).toBeUndefined()
        await expect(service.remove(created.id)).rejects.toBeInstanceOf(
          NotFoundException,
        )

        const [imported] = await tx
          .insert(transactionsTable)
          .values({
            accountId: checking,
            bookingDate: '2026-10-10',
            amountCents: -500,
            rawLabel: 'PAIEMENT CB FICTIF',
            kind: 'expense',
            dedupeHash: 'a'.repeat(64),
          })
          .returning()
        await expect(service.remove(imported.id)).rejects.toBeInstanceOf(
          NotFoundException,
        )
        await expect(
          service.update(imported.id, { amountCents: 1 }, NOW),
        ).rejects.toBeInstanceOf(NotFoundException)
        expect(await row(tx, imported.id)).toMatchObject({ amountCents: -500 })
      })
    })
  },
)
