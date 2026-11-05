import '#/load-env'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { eq, inArray } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CategorizationRulesService } from '#/categories/categorization-rules.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  categorizationRulesTable,
  type InsertTransaction,
  transactionsTable,
} from '#/database/schema'
import { TransactionsService } from './transactions.service'

/**
 * Integration checks against the migrated database (see
 * `domain-schema.spec.ts`). Each test starts from an empty transaction table
 * inside a transaction that is rolled back, so the local database is left
 * untouched. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'

describe.skipIf(!process.env.DATABASE_URL)(
  'TransactionsService (database)',
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
      service: TransactionsService
      rules: CategorizationRulesService
      checking: string
      savings: string
      groceries: string
      salary: string
      livret: string
    }

    async function withFixture(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          await tx.delete(transactionsTable)
          await tx.delete(categorizationRulesTable)
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
              {
                slug: 'test_groceries',
                name: 'Test groceries',
                kind: 'expense',
                color: '#d97706',
              },
              { slug: 'test_salary', name: 'Test salary', kind: 'income' },
              { slug: 'test_livret', name: 'Test livret', kind: 'transfer' },
            ])
            .returning()
          const bySlug = new Map(categories.map((c) => [c.slug, c.id]))
          // The services only read `db`; the transaction stands in for it, and
          // their own transactions become savepoints.
          const database = { db: tx } as never
          await fn({
            tx,
            service: new TransactionsService(database),
            rules: new CategorizationRulesService(database),
            checking: checking.id,
            savings: savings.id,
            groceries: bySlug.get('test_groceries')!,
            salary: bySlug.get('test_salary')!,
            livret: bySlug.get('test_livret')!,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    let hash = 0
    function transaction(
      accountId: string,
      overrides: Partial<InsertTransaction> = {},
    ) {
      hash++
      return {
        accountId,
        bookingDate: '2026-01-15',
        amountCents: -1_234,
        rawLabel: 'PAIEMENT CB 1501 TESTVILLE FAKEMART CARTE 4XXX0000',
        kind: 'expense',
        dedupeHash: `test-hash-${hash}`,
        ...overrides,
      } satisfies InsertTransaction
    }

    async function insert(tx: Tx, rows: InsertTransaction[]) {
      return tx.insert(transactionsTable).values(rows).returning()
    }

    async function reload(tx: Tx, id: string) {
      const [row] = await tx
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.id, id))
      return row
    }

    describe('list', () => {
      it('returns newest first with account and category, plus the total', async () => {
        await withFixture(async ({ tx, service, checking, groceries }) => {
          const [older, newer, sameDay] = await insert(tx, [
            transaction(checking, { bookingDate: '2026-01-10' }),
            transaction(checking, {
              bookingDate: '2026-02-01',
              categoryId: groceries,
            }),
            transaction(checking, { bookingDate: '2026-01-10' }),
          ])

          const result = await service.list({})

          expect(result.total).toBe(3)
          expect(result).toMatchObject({ page: 1, limit: 20 })
          const [tieFirst, tieSecond] = [older.id, sameDay.id].sort().reverse()
          expect(result.items.map((t) => t.id)).toEqual([
            newer.id,
            tieFirst,
            tieSecond,
          ])
          expect(result.items[0]).toMatchObject({
            accountName: 'Test checking',
            bookingDate: '2026-02-01',
            amountCents: -1_234,
            category: {
              id: groceries,
              slug: 'test_groceries',
              name: 'Test groceries',
              color: '#d97706',
              kind: 'expense',
            },
          })
          expect(result.items[1].category).toBeNull()
        })
      })

      it('paginates with a stable order', async () => {
        await withFixture(async ({ tx, service, checking }) => {
          await insert(
            tx,
            Array.from({ length: 5 }, (_, i) =>
              transaction(checking, { bookingDate: `2026-01-0${i + 1}` }),
            ),
          )

          const first = await service.list({ page: 1, limit: 2 })
          const third = await service.list({ page: 3, limit: 2 })

          expect(first.total).toBe(5)
          expect(first.items.map((t) => t.bookingDate)).toEqual([
            '2026-01-05',
            '2026-01-04',
          ])
          expect(third.items.map((t) => t.bookingDate)).toEqual(['2026-01-01'])
        })
      })

      it('filters by review flag, account, category, kind, dates and text', async () => {
        await withFixture(
          async ({ tx, service, checking, savings, groceries, livret }) => {
            const [review, filed, transfer, other] = await insert(tx, [
              transaction(checking, {
                needsReview: true,
                bookingDate: '2026-03-01',
              }),
              transaction(checking, {
                categoryId: groceries,
                rawLabel: 'CB SHOP 100%_OFF',
                bookingDate: '2026-03-15',
              }),
              transaction(savings, {
                categoryId: livret,
                kind: 'transfer',
                rawLabel: 'VIR LIVRET',
                merchant: 'Livret Test',
                bookingDate: '2026-04-01',
              }),
              transaction(savings, { bookingDate: '2026-05-01' }),
            ])
            const ids = async (query: Parameters<typeof service.list>[0]) =>
              (await service.list(query)).items.map((t) => t.id).sort()

            expect(await ids({ needsReview: true })).toEqual([review.id])
            expect(await ids({ accountId: savings })).toEqual(
              [transfer.id, other.id].sort(),
            )
            expect(await ids({ categoryId: groceries })).toEqual([filed.id])
            expect(await ids({ uncategorized: true })).toEqual(
              [review.id, other.id].sort(),
            )
            expect(await ids({ uncategorized: false })).toEqual(
              [filed.id, transfer.id].sort(),
            )
            expect(await ids({ kind: 'transfer' })).toEqual([transfer.id])
            expect(await ids({ from: '2026-03-15', to: '2026-04-01' })).toEqual(
              [filed.id, transfer.id].sort(),
            )
            // Merchant and label, case-insensitive; LIKE wildcards are literal.
            expect(await ids({ q: 'livret test' })).toEqual([transfer.id])
            expect(await ids({ q: '100%_' })).toEqual([filed.id])
            expect(await ids({ q: '%' })).toEqual([filed.id])
          },
        )
      })

      it('sorts by date or by signed amount, ties broken by date then id', async () => {
        await withFixture(async ({ tx, service, checking }) => {
          const [a, b, c, d] = await insert(tx, [
            transaction(checking, {
              bookingDate: '2026-01-10',
              amountCents: -5_000,
            }),
            transaction(checking, {
              bookingDate: '2026-01-20',
              amountCents: 200_000,
            }),
            transaction(checking, {
              bookingDate: '2026-01-05',
              amountCents: -5_000,
            }),
            transaction(checking, {
              bookingDate: '2026-01-15',
              amountCents: -120,
            }),
          ])
          const ids = async (
            sort: Parameters<typeof service.list>[0]['sort'],
          ) => (await service.list({ sort })).items.map((t) => t.id)

          expect(await ids(undefined)).toEqual([b.id, d.id, a.id, c.id])
          expect(await ids('date_desc')).toEqual([b.id, d.id, a.id, c.id])
          expect(await ids('date_asc')).toEqual([c.id, a.id, d.id, b.id])
          // Same amount: newest first.
          expect(await ids('amount_asc')).toEqual([a.id, c.id, d.id, b.id])
          expect(await ids('amount_desc')).toEqual([b.id, d.id, a.id, c.id])
        })
      })

      it('filters by the one-off flag', async () => {
        await withFixture(async ({ tx, service, checking }) => {
          const [oneOff, regular] = await insert(tx, [
            transaction(checking, { isOneOff: true }),
            transaction(checking),
          ])
          const ids = async (isOneOff: boolean) =>
            (await service.list({ isOneOff })).items.map((t) => t.id)
          expect(await ids(true)).toEqual([oneOff.id])
          expect(await ids(false)).toEqual([regular.id])
        })
      })

      it('takes a calendar month, first and last days included', async () => {
        await withFixture(async ({ tx, service, checking }) => {
          await insert(
            tx,
            [
              '2023-12-31',
              '2024-01-01',
              '2024-01-31',
              '2024-02-01',
              '2024-02-29',
              '2024-03-01',
              '2024-12-31',
              '2025-01-01',
            ].map((bookingDate) => transaction(checking, { bookingDate })),
          )
          const dates = async (month: string) =>
            (await service.list({ month, sort: 'date_asc' })).items.map(
              (t) => t.bookingDate,
            )

          expect(await dates('2024-01')).toEqual(['2024-01-01', '2024-01-31'])
          // Leap year.
          expect(await dates('2024-02')).toEqual(['2024-02-01', '2024-02-29'])
          // Year rollover.
          expect(await dates('2024-12')).toEqual(['2024-12-31'])
          expect(await dates('2023-12')).toEqual(['2023-12-31'])
          expect(await dates('2024-06')).toEqual([])
        })
      })

      it('rejects month combined with from or to', async () => {
        await withFixture(async ({ service }) => {
          await expect(
            service.list({ month: '2026-01', from: '2026-01-01' }),
          ).rejects.toBeInstanceOf(BadRequestException)
          await expect(
            service.summary({ month: '2026-01', to: '2026-01-31' }),
          ).rejects.toBeInstanceOf(BadRequestException)
        })
      })

      it('rejects categoryId combined with uncategorized', async () => {
        await withFixture(async ({ service, groceries }) => {
          await expect(
            service.list({ categoryId: groceries, uncategorized: true }),
          ).rejects.toBeInstanceOf(BadRequestException)
        })
      })
    })

    describe('summary', () => {
      it('sums income and expense, never transfers, with one-offs apart', async () => {
        await withFixture(
          async ({ tx, service, checking, savings, groceries, livret }) => {
            await insert(tx, [
              transaction(checking, { kind: 'income', amountCents: 250_000 }),
              transaction(checking, {
                kind: 'income',
                amountCents: 30_000,
                isOneOff: true,
              }),
              transaction(checking, {
                categoryId: groceries,
                amountCents: -4_550,
              }),
              transaction(checking, { amountCents: -90_000, isOneOff: true }),
              // A refund filed as an expense reduces the expenses.
              transaction(checking, { amountCents: 1_000 }),
              // Moves between own accounts: counted, never summed.
              transaction(checking, {
                kind: 'transfer',
                categoryId: livret,
                amountCents: -50_000,
              }),
              transaction(savings, {
                kind: 'transfer',
                categoryId: livret,
                amountCents: 50_000,
              }),
            ])

            expect(await service.summary({})).toEqual({
              count: 7,
              incomeCents: 280_000,
              expenseCents: -93_550,
              netCents: 186_450,
              oneOffIncomeCents: 30_000,
              oneOffExpenseCents: -90_000,
              transferCount: 2,
            })
          },
        )
      })

      it('applies the same filters as the list', async () => {
        await withFixture(async ({ tx, service, checking, savings }) => {
          await insert(tx, [
            transaction(checking, {
              bookingDate: '2026-01-31',
              amountCents: -1_000,
            }),
            transaction(checking, {
              bookingDate: '2026-02-01',
              amountCents: -2_000,
              needsReview: true,
            }),
            transaction(savings, {
              bookingDate: '2026-02-28',
              kind: 'income',
              amountCents: 500,
              rawLabel: 'INTERETS TEST',
            }),
            transaction(checking, {
              bookingDate: '2026-02-10',
              kind: 'transfer',
              amountCents: -10_000,
            }),
          ])

          expect(await service.summary({ month: '2026-02' })).toMatchObject({
            count: 3,
            incomeCents: 500,
            expenseCents: -2_000,
            netCents: -1_500,
            transferCount: 1,
          })
          expect(
            await service.summary({ month: '2026-02', accountId: checking }),
          ).toMatchObject({ count: 2, incomeCents: 0, expenseCents: -2_000 })
          expect(await service.summary({ needsReview: true })).toMatchObject({
            count: 1,
            expenseCents: -2_000,
          })
          expect(await service.summary({ q: 'interets' })).toMatchObject({
            count: 1,
            incomeCents: 500,
            expenseCents: 0,
          })
          expect(await service.summary({ kind: 'transfer' })).toEqual({
            count: 1,
            incomeCents: 0,
            expenseCents: 0,
            netCents: 0,
            oneOffIncomeCents: 0,
            oneOffExpenseCents: 0,
            transferCount: 1,
          })
        })
      })

      it('returns zeros when nothing matches', async () => {
        await withFixture(async ({ service }) => {
          expect(await service.summary({ month: '1999-01' })).toEqual({
            count: 0,
            incomeCents: 0,
            expenseCents: 0,
            netCents: 0,
            oneOffIncomeCents: 0,
            oneOffExpenseCents: 0,
            transferCount: 0,
          })
        })
      })
    })

    describe('reviewCount', () => {
      it('counts transactions waiting for review', async () => {
        await withFixture(async ({ tx, service, checking }) => {
          await insert(tx, [
            transaction(checking, { needsReview: true }),
            transaction(checking, { needsReview: true }),
            transaction(checking),
          ])
          expect(await service.reviewCount()).toBe(2)
        })
      })
    })

    describe('update', () => {
      it('files a category by hand, with its kind, and leaves review', async () => {
        await withFixture(
          async ({ tx, service, rules, checking, groceries, livret }) => {
            const rule = await rules.create({
              labelPattern: 'FAKEMART',
              categoryId: groceries,
            })
            const [row] = await insert(tx, [
              transaction(checking, {
                categoryId: groceries,
                ruleId: rule.id,
                needsReview: true,
              }),
            ])

            const updated = await service.update(row.id, { categoryId: livret })

            expect(updated).toMatchObject({
              id: row.id,
              categoryId: livret,
              ruleId: null,
              kind: 'transfer',
              needsReview: false,
              accountName: 'Test checking',
              category: { slug: 'test_livret', kind: 'transfer' },
            })
            // A manual category survives re-applying the rules.
            await rules.apply()
            expect(await reload(tx, row.id)).toMatchObject({
              categoryId: livret,
              ruleId: null,
              kind: 'transfer',
            })
          },
        )
      })

      it('honours an explicit kind and review flag with a category', async () => {
        await withFixture(async ({ tx, service, checking, groceries }) => {
          const [row] = await insert(tx, [
            transaction(checking, { needsReview: true }),
          ])

          const updated = await service.update(row.id, {
            categoryId: groceries,
            kind: 'transfer',
            needsReview: true,
          })

          expect(updated).toMatchObject({
            categoryId: groceries,
            kind: 'transfer',
            needsReview: true,
          })
        })
      })

      it('validates without a category: review flag, one-off, note', async () => {
        await withFixture(async ({ tx, service, checking, groceries }) => {
          const [row] = await insert(tx, [
            transaction(checking, { categoryId: groceries, needsReview: true }),
          ])

          const updated = await service.update(row.id, {
            needsReview: false,
            isOneOff: true,
            note: 'Synthetic note',
          })

          expect(updated).toMatchObject({
            categoryId: groceries,
            needsReview: false,
            isOneOff: true,
            note: 'Synthetic note',
          })
          await service.update(row.id, { note: null })
          expect((await reload(tx, row.id)).note).toBeNull()
        })
      })

      it('removes a category, keeping the kind unless sent', async () => {
        await withFixture(async ({ tx, service, checking, livret }) => {
          const [row] = await insert(tx, [
            transaction(checking, { categoryId: livret, kind: 'transfer' }),
          ])

          const updated = await service.update(row.id, {
            categoryId: null,
            needsReview: true,
          })

          expect(updated).toMatchObject({
            categoryId: null,
            category: null,
            ruleId: null,
            kind: 'transfer',
            needsReview: true,
          })
        })
      })

      it('pins a rule categorization when only the kind changes', async () => {
        await withFixture(
          async ({ tx, service, rules, checking, groceries }) => {
            const rule = await rules.create({
              labelPattern: 'FAKEMART',
              categoryId: groceries,
            })
            const [kept, changed] = await insert(tx, [
              transaction(checking, { categoryId: groceries, ruleId: rule.id }),
              transaction(checking, { categoryId: groceries, ruleId: rule.id }),
            ])

            await service.update(kept.id, { kind: 'expense' })
            await service.update(changed.id, { kind: 'transfer' })

            expect(await reload(tx, kept.id)).toMatchObject({
              ruleId: rule.id,
              kind: 'expense',
            })
            expect(await reload(tx, changed.id)).toMatchObject({
              ruleId: null,
              kind: 'transfer',
              categoryId: groceries,
            })
          },
        )
      })

      it('restores a rule categorization (undo)', async () => {
        await withFixture(
          async ({ tx, service, rules, checking, groceries, salary }) => {
            const rule = await rules.create({
              labelPattern: 'FAKEMART',
              categoryId: groceries,
            })
            const [row] = await insert(tx, [transaction(checking)])

            await expect(
              service.update(row.id, { categoryId: salary, ruleId: rule.id }),
            ).rejects.toThrow(/category of the rule/)
            await expect(
              service.update(row.id, { ruleId: rule.id }),
            ).rejects.toThrow(/requires a categoryId/)
            await expect(
              service.update(row.id, {
                categoryId: groceries,
                ruleId: UNKNOWN_ID,
              }),
            ).rejects.toThrow(/does not match any rule/)

            const restored = await service.update(row.id, {
              categoryId: groceries,
              ruleId: rule.id,
              kind: 'expense',
              needsReview: true,
            })
            expect(restored).toMatchObject({
              categoryId: groceries,
              ruleId: rule.id,
              needsReview: true,
            })
          },
        )
      })

      it('rejects an unknown category or transaction', async () => {
        await withFixture(async ({ tx, service, checking, groceries }) => {
          const [row] = await insert(tx, [transaction(checking)])
          await expect(
            service.update(row.id, { categoryId: UNKNOWN_ID }),
          ).rejects.toBeInstanceOf(BadRequestException)
          await expect(
            service.update(UNKNOWN_ID, { categoryId: groceries }),
          ).rejects.toBeInstanceOf(NotFoundException)
          expect((await reload(tx, row.id)).categoryId).toBeNull()
        })
      })
    })

    describe('bulkUpdate', () => {
      it('applies the same changes to every listed transaction', async () => {
        await withFixture(async ({ tx, service, checking, groceries }) => {
          const rows = await insert(tx, [
            transaction(checking, { needsReview: true }),
            transaction(checking, { needsReview: true, amountCents: 5_000 }),
            transaction(checking, { needsReview: true }),
          ])
          const ids = rows.slice(0, 2).map((r) => r.id)

          const result = await service.bulkUpdate({
            ids: [...ids, UNKNOWN_ID],
            categoryId: groceries,
            isOneOff: true,
          })

          expect(result).toEqual({ updated: 2 })
          const updated = await tx
            .select()
            .from(transactionsTable)
            .where(inArray(transactionsTable.id, ids))
          for (const row of updated) {
            expect(row).toMatchObject({
              categoryId: groceries,
              ruleId: null,
              kind: 'expense',
              needsReview: false,
              isOneOff: true,
            })
          }
          expect(await reload(tx, rows[2].id)).toMatchObject({
            categoryId: null,
            needsReview: true,
          })
        })
      })

      it('validates in bulk and rolls back everything on error', async () => {
        await withFixture(async ({ tx, service, checking, groceries }) => {
          const rows = await insert(tx, [
            transaction(checking, { categoryId: groceries, needsReview: true }),
            transaction(checking, { categoryId: groceries, needsReview: true }),
          ])
          const ids = rows.map((r) => r.id)

          await expect(
            service.bulkUpdate({ ids, categoryId: UNKNOWN_ID }),
          ).rejects.toBeInstanceOf(BadRequestException)
          await expect(service.bulkUpdate({ ids })).rejects.toThrow(
            /Nothing to update/,
          )
          expect(await service.reviewCount()).toBe(2)

          await expect(
            service.bulkUpdate({ ids, needsReview: false }),
          ).resolves.toEqual({ updated: 2 })
          expect(await service.reviewCount()).toBe(0)
        })
      })
    })
  },
)
