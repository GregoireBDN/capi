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
  type InsertTransaction,
  recurringItemsTable,
  transactionsTable,
} from '#/database/schema'
import { addMonths } from './dates'
import { RecurringService } from './recurring.service'

/**
 * Integration checks against the migrated test database. Each test runs in a
 * transaction that is rolled back, starting without transactions or
 * recurring items. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
const TODAY = '2026-11-06'
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

describe.skipIf(!process.env.DATABASE_URL)(
  'RecurringService (database)',
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

    interface Fixture {
      tx: Tx
      service: RecurringService
      checking: string
      savings: string
      subscriptions: string
      rent: string
      groceries: string
      salary: string
      insert: (rows: Partial<InsertTransaction>[]) => Promise<void>
    }

    let sequence = 0

    async function withFixture(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          await tx.delete(recurringItemsTable)
          await tx.delete(transactionsTable)
          const [checking, savings] = await tx
            .insert(accountsTable)
            .values([
              { name: 'Test checking', type: 'checking' },
              { name: 'Test savings', type: 'savings' },
            ])
            .returning()
          const categories = await tx
            .insert(categoriesTable)
            .values([
              { slug: 'test_groceries', name: 'Test courses', kind: 'expense' },
              { slug: 'test_salary', name: 'Test salaire', kind: 'income' },
            ])
            .returning()
          const bySlug = new Map(categories.map((c) => [c.slug, c.id]))
          // The fixed-cost default and `isSubscription` follow the real
          // slugs: reuse the seeded categories, or create them.
          await tx
            .insert(categoriesTable)
            .values([
              { slug: 'subscriptions', name: 'Abonnements', kind: 'expense' },
              { slug: 'rent', name: 'Loyer', kind: 'expense' },
            ])
            .onConflictDoNothing()
          const real = new Map(
            (
              await tx
                .select({ id: categoriesTable.id, slug: categoriesTable.slug })
                .from(categoriesTable)
            ).map((c) => [c.slug, c.id]),
          )
          const insert = async (rows: Partial<InsertTransaction>[]) => {
            await tx.insert(transactionsTable).values(
              rows.map((row) => ({
                accountId: checking.id,
                bookingDate: '2026-01-01',
                amountCents: -100,
                rawLabel: 'PRLV SEPA DIVERS',
                kind: 'expense' as const,
                dedupeHash: `recurring-spec-${++sequence}`,
                ...row,
              })),
            )
          }
          await fn({
            tx,
            // The service only reads `db`; its transactions become savepoints.
            service: new RecurringService({ db: tx } as never),
            checking: checking.id,
            savings: savings.id,
            subscriptions: real.get('subscriptions')!,
            rent: real.get('rent')!,
            groceries: bySlug.get('test_groceries')!,
            salary: bySlug.get('test_salary')!,
            insert,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    /** `count` monthly rows ending at `last`. */
    function monthly(
      last: string,
      count: number,
      row: Partial<InsertTransaction> & { amountCents: number },
      amount?: (i: number) => number,
    ): Partial<InsertTransaction>[] {
      return Array.from({ length: count }, (_, i) => ({
        ...row,
        bookingDate: addMonths(last, i - count + 1),
        amountCents: amount ? amount(i) : row.amountCents,
      }))
    }

    async function seedHousehold(f: Fixture) {
      await f.insert([
        ...monthly('2026-10-02', 12, {
          rawLabel: 'PRLV SEPA SOCIETE IMMO EXEMPLE',
          amountCents: -80_000,
          categoryId: f.rent,
        }),
        ...monthly(
          '2026-10-12',
          10,
          {
            rawLabel: 'PRLV SEPA STREAMFLIX',
            amountCents: -1_099,
            categoryId: f.subscriptions,
          },
          (i) => (i < 7 ? -1_099 : -1_299),
        ),
        ...monthly('2026-10-28', 12, {
          rawLabel: 'VIR SEPA EMPLOYEUR EXEMPLE',
          amountCents: 250_000,
          kind: 'income',
          categoryId: f.salary,
        }),
        // Noise: groceries several times a week.
        ...Array.from({ length: 40 }, (_, i) => ({
          rawLabel: 'PAIEMENT CB 0101 PARIS SUPERMARCHE EXEMPLE CARTE 1234',
          bookingDate: addMonths('2026-07-01', 0, 1 + ((i * 3) % 28)),
          amountCents: -(1_000 + ((i * 1_237) % 9_000)),
          categoryId: f.groceries,
        })),
        // Transfers to own savings and one-offs never make a series.
        ...monthly('2026-10-05', 12, {
          rawLabel: 'VIR SEPA LIVRET EXEMPLE',
          amountCents: -20_000,
          kind: 'transfer',
        }),
        ...monthly('2026-10-20', 6, {
          rawLabel: 'PRLV SEPA EXCEPTIONNEL EXEMPLE',
          amountCents: -5_000,
          isOneOff: true,
        }),
      ])
    }

    it('creates suggestions for the active series only', async () => {
      await withFixture(async (f) => {
        await seedHousehold(f)
        const result = await f.service.detect(TODAY)
        expect(result).toMatchObject({
          detectedCount: 3,
          createdCount: 3,
          updatedCount: 0,
          removedCount: 0,
          suggestedCount: 3,
        })
        const items = await f.service.list('suggested')
        expect(items.map((i) => i.merchantKey).sort()).toEqual([
          'EMPLOYEUR EXEMPLE',
          'SOCIETE IMMO EXEMPLE',
          'STREAMFLIX',
        ])
        const stream = items.find((i) => i.merchantKey === 'STREAMFLIX')!
        expect(stream).toMatchObject({
          accountName: 'Test checking',
          direction: 'debit',
          cadence: 'monthly',
          amountType: 'fixed',
          typicalAmountCents: 1_299,
          previousAmountCents: 1_099,
          priceChangeCents: 200,
          priceChangedOn: '2026-08-12',
          monthlyEquivalentCents: 1_299,
          yearlyCostCents: 15_588,
          isSubscription: true,
          isFixedCost: true,
          nextExpectedDate: '2026-11-12',
          active: true,
          occurrenceCount: 10,
          searchText: 'Streamflix',
        })
        expect(stream.occurrences).toHaveLength(6)
        expect(stream.occurrences[0].date).toBe('2026-10-12')
        const salary = items.find((i) => i.direction === 'credit')!
        expect(salary.isFixedCost).toBe(false)
      })
    })

    it('re-detects idempotently and keeps user decisions', async () => {
      await withFixture(async (f) => {
        await seedHousehold(f)
        await f.service.detect(TODAY)
        const items = await f.service.list()
        const rent = items.find(
          (i) => i.merchantKey === 'SOCIETE IMMO EXEMPLE',
        )!
        const stream = items.find((i) => i.merchantKey === 'STREAMFLIX')!
        await f.service.update(rent.id, {
          status: 'confirmed',
          name: 'Loyer',
          notes: 'Bail 2025',
        })
        await f.service.update(stream.id, { status: 'dismissed' })

        const again = await f.service.detect(TODAY)
        expect(again).toMatchObject({
          createdCount: 0,
          updatedCount: 3,
          removedCount: 0,
          suggestedCount: 1,
        })
        const after = await f.service.list()
        expect(after).toHaveLength(3)
        expect(after.find((i) => i.id === rent.id)).toMatchObject({
          status: 'confirmed',
          name: 'Loyer',
          notes: 'Bail 2025',
        })
        // Dismissed items are never suggested again.
        expect(after.find((i) => i.id === stream.id)?.status).toBe('dismissed')
      })
    })

    it('removes suggestions that are no longer detected', async () => {
      await withFixture(async (f) => {
        await seedHousehold(f)
        await f.service.detect(TODAY)
        // The streaming charges are flagged one-off: no series any more.
        await f.tx
          .update(transactionsTable)
          .set({ isOneOff: true })
          .where(eq(transactionsTable.rawLabel, 'PRLV SEPA STREAMFLIX'))
        const result = await f.service.detect(TODAY)
        expect(result.removedCount).toBe(1)
        expect(
          (await f.service.list()).map((i) => i.merchantKey),
        ).not.toContain('STREAMFLIX')
      })
    })

    it('sums confirmed active items: fixed, variable, subscriptions, credits', async () => {
      await withFixture(async (f) => {
        await seedHousehold(f)
        await f.insert(
          monthly('2026-10-15', 6, {
            rawLabel: 'PRLV SEPA SALLE SPORT EXEMPLE',
            amountCents: -3_000,
          }),
        )
        await f.service.detect(TODAY)
        const items = await f.service.list()
        const confirmed = await f.service.confirm([
          ...items.map((i) => i.id),
          UNKNOWN_ID,
        ])
        expect(confirmed.confirmedCount).toBe(4)

        const summary = await f.service.summary()
        // Rent 800 + streaming 12.99 fixed; gym 30 not a fixed cost.
        expect(summary.debits.fixed).toEqual({
          yearlyCents: (80_000 + 1_299) * 12,
          monthlyCents: 81_299,
          count: 2,
        })
        expect(summary.debits.variable).toEqual({
          yearlyCents: 36_000,
          monthlyCents: 3_000,
          count: 1,
        })
        expect(summary.debits.subscriptions.count).toBe(1)
        expect(summary.debits.yearlyCents).toBe(
          summary.debits.fixed.yearlyCents +
            summary.debits.variable.yearlyCents,
        )
        expect(summary.debits.monthlyCents).toBe(
          Math.round(summary.debits.yearlyCents / 12),
        )
        expect(summary.credits).toEqual({
          yearlyCents: 3_000_000,
          monthlyCents: 250_000,
          count: 1,
        })
        expect(summary.suggestedCount).toBe(0)
      })
    })

    it('applies a cadence override to the costs and next date', async () => {
      await withFixture(async (f) => {
        await f.insert(
          monthly('2026-10-03', 4, {
            rawLabel: 'PRLV SEPA ASSUREUR EXEMPLE',
            amountCents: -6_000,
          }),
        )
        await f.service.detect(TODAY)
        const [item] = await f.service.list()
        const updated = await f.service.update(item.id, { cadence: 'yearly' })
        expect(updated).toMatchObject({
          cadence: 'yearly',
          detectedCadence: 'monthly',
          cadenceOverridden: true,
          yearlyCostCents: 6_000,
          monthlyEquivalentCents: 500,
        })
        const reset = await f.service.update(item.id, { cadence: 'monthly' })
        expect(reset.cadenceOverridden).toBe(false)
      })
    })

    it('validates updates', async () => {
      await withFixture(async (f) => {
        await expect(
          f.service.update(UNKNOWN_ID, { status: 'confirmed' }),
        ).rejects.toBeInstanceOf(NotFoundException)
        await f.insert(
          monthly('2026-10-03', 4, {
            rawLabel: 'PRLV SEPA ASSUREUR EXEMPLE',
            amountCents: -6_000,
          }),
        )
        await f.service.detect(TODAY)
        const [item] = await f.service.list()
        await expect(
          f.service.update(item.id, { categoryId: UNKNOWN_ID }),
        ).rejects.toBeInstanceOf(BadRequestException)
        const updated = await f.service.update(item.id, {
          categoryId: f.rent,
          isFixedCost: true,
          notes: null,
        })
        expect(updated).toMatchObject({ categoryId: f.rent, isFixedCost: true })
      })
    })

    it('marks a confirmed series inactive once it stops', async () => {
      await withFixture(async (f) => {
        await f.insert(
          monthly('2026-07-09', 6, {
            rawLabel: 'PRLV SEPA VIDEO EXEMPLE',
            amountCents: -899,
          }),
        )
        await f.service.detect(TODAY)
        const [item] = await f.service.list()
        await f.service.update(item.id, { status: 'confirmed' })
        // Three more months of data, without the subscription.
        await f.insert([
          { rawLabel: 'PRLV SEPA AUTRE EXEMPLE', bookingDate: '2026-10-20' },
        ])
        const [after] = await f.service.list('confirmed')
        expect(after.active).toBe(false)
        expect((await f.service.summary()).inactiveCount).toBe(1)
        // Inactive series are not suggested; the confirmed one is kept.
        const result = await f.service.detect(TODAY)
        expect(result.removedCount).toBe(0)
        expect(await f.service.list()).toHaveLength(1)
      })
    })
  },
)
