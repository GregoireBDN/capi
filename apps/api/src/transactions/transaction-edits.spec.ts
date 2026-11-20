import '#/load-env'
import { BadRequestException } from '@nestjs/common'
import { asc, eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import { BudgetsService } from '#/budgets/budgets.service'
import { CategorizationRulesService } from '#/categories/categorization-rules.service'
import { dataUntil } from '#/coverage/coverage'
import * as schema from '#/database/schema'
import {
  accountsTable,
  budgetsTable,
  categoriesTable,
  categorizationRulesTable,
  transactionSplitsTable,
  transactionsTable,
} from '#/database/schema'
import { ImportsService } from '#/imports/imports.service'
import {
  type CicRow,
  cicCsv,
  withBalances,
} from '#/imports/testing/cic-csv-fixture'
import { ManualTransactionsService } from './manual-transactions.service'
import { TransactionsService } from './transactions.service'

/**
 * Hand edits of #74 against the migrated test database: corrections of
 * imported rows (bank values kept for balances, continuity and re-imports),
 * splits (counted per part) and manual transfers (never income or expense).
 * Every test runs in a transaction that is rolled back. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

const SALARY = 'VIR SEPA SALAIRE SOCIETE FICTIVE OCT'
const MARKET = 'PAIEMENT CB 0310 VILLE-EXEMPLE HYPERMARCHE FICTIF CARTE 1234'
const BAR = 'PAIEMENT CB 0610 VILLE-EXEMPLE BAR IMAGINAIRE CARTE 1234 ABCD'
const PAYBACK = 'VIR SEPA RECU AMI FICTIF REMBOURSEMENT'

/** Noon in Paris on the last day of the month of the files. */
const NOW = new Date('2026-10-31T11:00:00Z')

const OCTOBER: Omit<CicRow, 'balanceCents'>[] = [
  { date: '2026-10-01', amountCents: 200_000, label: SALARY },
  { date: '2026-10-05', amountCents: -4_500, label: MARKET },
  { date: '2026-10-28', amountCents: -2_000, label: BAR },
]

interface Fixture {
  tx: Tx
  imports: ImportsService
  manual: ManualTransactionsService
  transactions: TransactionsService
  budgets: BudgetsService
  accounts: AccountsService
  accountId: string
  groceries: string
  household: string
  outings: string
  /** Income category of refunds (« Remboursements »). */
  refunds: string
  /** Transfer category (moves between the owner's accounts). */
  moves: string
  /** Previews and commits `rows` (balances chained from 100 €). */
  importRows: (
    rows: Omit<CicRow, 'balanceCents'>[],
  ) => Promise<{ inserted: number; duplicates: number }>
  byLabel: (label: string) => Promise<typeof transactionsTable.$inferSelect>
}

describe.skipIf(!process.env.DATABASE_URL)(
  'Hand edits of transactions (database)',
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
          await tx.delete(categorizationRulesTable)
          const [account] = await tx
            .insert(accountsTable)
            .values({ name: 'Edits checking', type: 'checking' })
            .returning()
          const [groceries, household, outings] = await tx
            .insert(categoriesTable)
            .values([
              { slug: 'edits_groceries', name: 'Courses', kind: 'expense' },
              { slug: 'edits_household', name: 'Maison', kind: 'expense' },
              { slug: 'edits_outings', name: 'Sorties', kind: 'expense' },
            ])
            .returning()
          const [refunds, moves] = await tx
            .insert(categoriesTable)
            .values([
              { slug: 'edits_refunds', name: 'Remboursés', kind: 'income' },
              {
                slug: 'edits_own_moves',
                name: 'Entre comptes',
                kind: 'transfer',
              },
            ])
            .returning()
          await tx.insert(categorizationRulesTable).values([
            {
              position: 0,
              labelPattern: 'hypermarche',
              categoryId: groceries.id,
            },
            {
              position: 1,
              labelPattern: 'ami fictif',
              categoryId: refunds.id,
            },
            {
              position: 2,
              labelPattern: 'bar imaginaire',
              categoryId: outings.id,
            },
          ])
          const database = { db: tx } as never
          const imports = new ImportsService(
            database,
            new CategorizationRulesService(database),
          )
          const transactions = new TransactionsService(database)
          await fn({
            tx,
            imports,
            manual: new ManualTransactionsService(database, transactions),
            transactions,
            budgets: new BudgetsService(database),
            accounts: new AccountsService(database),
            accountId: account.id,
            groceries: groceries.id,
            household: household.id,
            outings: outings.id,
            refunds: refunds.id,
            moves: moves.id,
            importRows: async (rows) => {
              const previewed = await imports.preview({
                accountId: account.id,
                fileName: 'export.csv',
                buffer: cicCsv(withBalances(10_000, rows)),
              })
              const committed = await imports.commit(previewed.id, {})
              return {
                inserted: committed.counts.inserted,
                duplicates: committed.counts.duplicates,
              }
            },
            byLabel: async (label) => {
              const [row] = await tx
                .select()
                .from(transactionsTable)
                .where(eq(transactionsTable.rawLabel, label))
              return row
            },
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    describe('correcting an imported row', () => {
      it('keeps the bank values and a re-import neither duplicates nor overwrites it', async () => {
        await withFixture(
          async ({
            importRows,
            byLabel,
            transactions,
            accounts,
            accountId,
            tx,
          }) => {
            await importRows(OCTOBER)
            const balanceBefore = await accounts.findOne(accountId)
            const market = await byLabel(MARKET)

            const corrected = await transactions.correct(market.id, {
              amountCents: -3_000,
              bookingDate: '2026-10-07',
            })
            expect(corrected).toMatchObject({
              amountCents: -3_000,
              bookingDate: '2026-10-07',
              originalAmountCents: -4_500,
              originalBookingDate: '2026-10-05',
            })

            // Same file again, and an overlapping one: nothing new.
            expect(await importRows(OCTOBER)).toMatchObject({ inserted: 0 })
            const rows = await tx
              .select()
              .from(transactionsTable)
              .where(eq(transactionsTable.accountId, accountId))
            expect(rows).toHaveLength(3)
            expect(await byLabel(MARKET)).toMatchObject({
              amountCents: -3_000,
              bookingDate: '2026-10-07',
              dedupeHash: market.dedupeHash,
            })

            // The balance and its date stay the bank's.
            expect(await accounts.findOne(accountId)).toMatchObject({
              balanceCents: balanceBefore.balanceCents,
              balanceDate: balanceBefore.balanceDate,
            })
          },
        )
      })

      it('counts the corrected amount in statistics, the bank one in the continuity check', async () => {
        await withFixture(
          async ({ importRows, byLabel, transactions, imports, accountId }) => {
            await importRows(OCTOBER)
            const market = await byLabel(MARKET)
            await transactions.correct(market.id, { amountCents: -3_000 })
            const summary = await transactions.summary({ month: '2026-10' })
            expect(summary.expenseCents).toBe(-5_000)

            // The next statement continues from the bank's balance.
            const november = await imports.preview({
              accountId,
              fileName: 'november.csv',
              buffer: cicCsv(
                withBalances(10_000 + 200_000 - 4_500 - 2_000, [
                  {
                    date: '2026-11-02',
                    amountCents: -1_000,
                    label: BAR.replace('0610', '0211'),
                  },
                ]),
              ),
            })
            expect(november.preview!.continuity).toMatchObject({ ok: true })
          },
        )
      })

      it('goes back to the bank values', async () => {
        await withFixture(async ({ importRows, byLabel, transactions }) => {
          await importRows(OCTOBER)
          const market = await byLabel(MARKET)
          await transactions.correct(market.id, {
            amountCents: -3_000,
            bookingDate: '2026-10-07',
          })
          // Typing the bank value again drops its original.
          expect(
            await transactions.correct(market.id, { amountCents: -4_500 }),
          ).toMatchObject({ amountCents: -4_500, originalAmountCents: null })
          expect(await transactions.restoreBankValues(market.id)).toMatchObject(
            {
              amountCents: -4_500,
              bookingDate: '2026-10-05',
              originalAmountCents: null,
              originalBookingDate: null,
            },
          )
        })
      })

      it('dates the data with the bank date', async () => {
        await withFixture(
          async ({ importRows, byLabel, transactions, tx, accountId }) => {
            await importRows(OCTOBER)
            const bar = await byLabel(BAR)
            await transactions.correct(bar.id, { bookingDate: '2026-10-30' })
            expect(await dataUntil(tx, { accountId, now: NOW })).toBe(
              '2026-10-28',
            )
          },
        )
      })

      it('refuses a manual transaction', async () => {
        await withFixture(async ({ manual, transactions, outings }) => {
          const noted = await manual.create(
            { amountCents: 500, categoryId: outings },
            NOW,
          )
          await expect(
            transactions.correct(noted.id, { amountCents: -600 }),
          ).rejects.toBeInstanceOf(BadRequestException)
        })
      })
    })

    describe('splitting', () => {
      it('counts each part in its category, summing to the amount', async () => {
        await withFixture(
          async ({
            importRows,
            byLabel,
            transactions,
            budgets,
            tx,
            groceries,
            household,
          }) => {
            await importRows(OCTOBER)
            const market = await byLabel(MARKET)
            const split = await transactions.split(market.id, [
              { categoryId: household, amountCents: -1_200 },
              { categoryId: groceries, amountCents: -3_300 },
            ])
            expect(split).toMatchObject({
              amountCents: -4_500,
              // The largest part.
              categoryId: groceries,
              ruleId: null,
              needsReview: false,
            })
            expect(split.splits.map((part) => part.amountCents)).toEqual([
              -1_200, -3_300,
            ])
            expect(split.splits[0].category.name).toBe('Maison')

            await tx.insert(budgetsTable).values([
              {
                categoryId: groceries,
                effectiveFrom: '2026-10-01',
                monthlyTargetCents: 30_000,
              },
              {
                categoryId: household,
                effectiveFrom: '2026-10-01',
                monthlyTargetCents: 5_000,
              },
            ])
            const month = await budgets.month('2026-10', tx, NOW)
            const spent = new Map(
              month.items.map((item) => [item.categoryId, item.spentCents]),
            )
            expect(spent.get(groceries)).toBe(3_300)
            expect(spent.get(household)).toBe(1_200)

            // Filters and totals follow the parts too.
            const inHousehold = await transactions.list({
              categoryId: household,
            })
            expect(inHousehold.items.map((item) => item.id)).toEqual([
              market.id,
            ])
            expect(
              await transactions.summary({ categoryId: household }),
            ).toMatchObject({ count: 1, expenseCents: -1_200 })
            expect(
              await transactions.summary({ month: '2026-10' }),
            ).toMatchObject({ count: 3, expenseCents: -6_500 })
          },
        )
      })

      it('refuses parts that do not sum exactly, of the wrong sign or category', async () => {
        await withFixture(
          async ({
            importRows,
            byLabel,
            transactions,
            groceries,
            household,
          }) => {
            await importRows(OCTOBER)
            const market = await byLabel(MARKET)
            const cases = [
              [
                { categoryId: household, amountCents: -1_200 },
                { categoryId: groceries, amountCents: -3_299 },
              ],
              [
                { categoryId: household, amountCents: 1_200 },
                { categoryId: groceries, amountCents: -5_700 },
              ],
              [
                { categoryId: household, amountCents: -1_200 },
                {
                  categoryId: '00000000-0000-4000-8000-000000000000',
                  amountCents: -3_300,
                },
              ],
            ]
            for (const parts of cases) {
              await expect(
                transactions.split(market.id, parts),
              ).rejects.toBeInstanceOf(BadRequestException)
            }
            expect(await transactions.isSplit(market.id)).toBe(false)
          },
        )
      })

      it('ends with a category for the whole, or on request; the amount is locked meanwhile', async () => {
        await withFixture(
          async ({
            importRows,
            byLabel,
            transactions,
            groceries,
            household,
            outings,
          }) => {
            await importRows(OCTOBER)
            const market = await byLabel(MARKET)
            const parts = [
              { categoryId: household, amountCents: -1_200 },
              { categoryId: groceries, amountCents: -3_300 },
            ]
            await transactions.split(market.id, parts)
            await expect(
              transactions.correct(market.id, { amountCents: -4_000 }),
            ).rejects.toBeInstanceOf(BadRequestException)
            // A date correction is fine.
            await transactions.correct(market.id, { bookingDate: '2026-10-06' })

            const whole = await transactions.update(market.id, {
              categoryId: outings,
            })
            expect(whole).toMatchObject({ categoryId: outings, splits: [] })

            await transactions.split(market.id, parts)
            expect(await transactions.unsplit(market.id)).toMatchObject({
              categoryId: groceries,
              splits: [],
            })
          },
        )
      })

      it('moves the split of a manual transaction to the bank row replacing it', async () => {
        await withFixture(
          async ({
            manual,
            importRows,
            byLabel,
            transactions,
            tx,
            groceries,
            household,
          }) => {
            const noted = await manual.create(
              {
                amountCents: 4_500,
                categoryId: groceries,
                bookingDate: '2026-10-04',
              },
              NOW,
            )
            await transactions.split(noted.id, [
              { categoryId: household, amountCents: -1_500 },
              { categoryId: groceries, amountCents: -3_000 },
            ])
            await importRows(OCTOBER)
            const market = await byLabel(MARKET)
            const parts = await tx
              .select()
              .from(transactionSplitsTable)
              .where(eq(transactionSplitsTable.transactionId, market.id))
              .orderBy(asc(transactionSplitsTable.position))
            expect(parts.map((part) => part.amountCents)).toEqual([
              -1_500, -3_000,
            ])
            expect(market.manual).toBe(false)
          },
        )
      })
    })

    describe('splitting an incoming transaction (#357)', () => {
      const WITH_PAYBACK: Omit<CicRow, 'balanceCents'>[] = [
        ...OCTOBER,
        { date: '2026-10-20', amountCents: 6_000, label: PAYBACK },
      ]

      it('makes a part in an expense category a refund of it, the rest income', async () => {
        await withFixture(
          async ({
            importRows,
            byLabel,
            transactions,
            budgets,
            tx,
            outings,
            refunds,
          }) => {
            await importRows(WITH_PAYBACK)
            const payback = await byLabel(PAYBACK)
            expect(payback).toMatchObject({
              kind: 'income',
              categoryId: refunds,
            })
            await tx.insert(budgetsTable).values([
              {
                categoryId: outings,
                effectiveFrom: '2026-10-01',
                monthlyTargetCents: 5_000,
                tracked: true,
              },
              {
                categoryId: refunds,
                effectiveFrom: '2026-10-01',
                monthlyTargetCents: 3_000,
              },
            ])
            const before = await budgets.month('2026-10', tx, NOW)
            const totalsBefore = await transactions.summary({
              month: '2026-10',
            })

            const split = await transactions.split(payback.id, [
              { categoryId: outings, amountCents: 2_000 },
              { categoryId: refunds, amountCents: 4_000 },
            ])
            expect(split.kind).toBe('income')
            expect(split.categoryId).toBe(refunds)
            expect(
              split.splits.map((part) => [part.category.name, part.kind]),
            ).toEqual([
              ['Sorties', 'expense'],
              ['Remboursés', 'income'],
            ])

            const after = await budgets.month('2026-10', tx, NOW)
            const spent = (month: typeof after) =>
              month.items.find((item) => item.categoryId === outings)
                ?.spentCents
            const received = (month: typeof after) =>
              month.income.items.find((item) => item.categoryId === refunds)
                ?.receivedCents
            // The bar's 20 € are paid back: nothing left spent in outings.
            expect(spent(before)).toBe(2_000)
            expect(spent(after)).toBe(0)
            expect(received(before)).toBe(6_000)
            expect(received(after)).toBe(4_000)
            const envelope = (await budgets.envelopes('2026-10', tx, NOW)).items
            expect(
              envelope.find((item) => item.categoryId === outings),
            ).toMatchObject({ spentCents: 0, remainingCents: 5_000 })

            // Nothing else moves: the 60 € are 40 € of income and 20 € less
            // spent, still one transaction.
            const totalsAfter = await transactions.summary({ month: '2026-10' })
            expect(totalsAfter).toMatchObject({
              count: totalsBefore.count,
              incomeCents: totalsBefore.incomeCents - 2_000,
              expenseCents: totalsBefore.expenseCents + 2_000,
              netCents: totalsBefore.netCents,
            })
            expect(
              await transactions.summary({
                month: '2026-10',
                categoryId: outings,
              }),
            ).toMatchObject({ expenseCents: 0, incomeCents: 0 })
          },
        )
      })

      it('counts an outgoing split between expense categories as before', async () => {
        await withFixture(
          async ({
            importRows,
            byLabel,
            transactions,
            groceries,
            household,
          }) => {
            await importRows(OCTOBER)
            const market = await byLabel(MARKET)
            const split = await transactions.split(market.id, [
              { categoryId: household, amountCents: -1_200 },
              { categoryId: groceries, amountCents: -3_300 },
            ])
            expect(split.splits.map((part) => part.kind)).toEqual([
              'expense',
              'expense',
            ])
            expect(
              await transactions.summary({ month: '2026-10' }),
            ).toMatchObject({ incomeCents: 200_000, expenseCents: -6_500 })
          },
        )
      })

      it('refuses a transfer category beside income or expense ones', async () => {
        await withFixture(
          async ({ importRows, byLabel, transactions, outings, moves }) => {
            await importRows(WITH_PAYBACK)
            const payback = await byLabel(PAYBACK)
            await expect(
              transactions.split(payback.id, [
                { categoryId: outings, amountCents: 2_000 },
                { categoryId: moves, amountCents: 4_000 },
              ]),
            ).rejects.toBeInstanceOf(BadRequestException)
            expect(await transactions.isSplit(payback.id)).toBe(false)
          },
        )
      })

      it('keeps the parts of a transfer transfers', async () => {
        await withFixture(
          async ({ importRows, byLabel, transactions, outings, refunds }) => {
            await importRows(WITH_PAYBACK)
            const payback = await byLabel(PAYBACK)
            await transactions.update(payback.id, { kind: 'transfer' })
            const before = await transactions.summary({ month: '2026-10' })
            const split = await transactions.split(payback.id, [
              { categoryId: outings, amountCents: 2_000 },
              { categoryId: refunds, amountCents: 4_000 },
            ])
            expect(split.splits.map((part) => part.kind)).toEqual([
              'transfer',
              'transfer',
            ])
            expect(
              await transactions.summary({ month: '2026-10' }),
            ).toMatchObject({
              incomeCents: before.incomeCents,
              expenseCents: before.expenseCents,
              transferCount: before.transferCount,
            })
          },
        )
      })

      it('keeps the refund when the bank row replaces a manual transaction', async () => {
        await withFixture(
          async ({
            manual,
            importRows,
            byLabel,
            transactions,
            budgets,
            tx,
            outings,
            refunds,
          }) => {
            const noted = await manual.create(
              {
                amountCents: 6_000,
                direction: 'in',
                kind: 'income',
                categoryId: refunds,
                bookingDate: '2026-10-19',
              },
              NOW,
            )
            await transactions.split(noted.id, [
              { categoryId: outings, amountCents: 2_000 },
              { categoryId: refunds, amountCents: 4_000 },
            ])
            await importRows(WITH_PAYBACK)
            const payback = await byLabel(PAYBACK)
            expect(payback.manual).toBe(false)
            const bankRow = await transactions.findOne(payback.id)
            expect(
              bankRow.splits.map((part) => [part.amountCents, part.kind]),
            ).toEqual([
              [2_000, 'expense'],
              [4_000, 'income'],
            ])
            await tx.insert(budgetsTable).values({
              categoryId: outings,
              effectiveFrom: '2026-10-01',
              monthlyTargetCents: 5_000,
            })
            const month = await budgets.month('2026-10', tx, NOW)
            expect(
              month.items.find((item) => item.categoryId === outings)
                ?.spentCents,
            ).toBe(0)
          },
        )
      })
    })

    describe('manual transfers', () => {
      it('never count as income or expense', async () => {
        await withFixture(async ({ manual, transactions, budgets, tx }) => {
          const [moves] = await tx
            .insert(categoriesTable)
            .values({
              slug: 'edits_moves',
              name: 'Virements',
              kind: 'transfer',
            })
            .returning()
          await manual.create(
            {
              amountCents: 50_000,
              categoryId: moves.id,
              bookingDate: '2026-10-10',
            },
            NOW,
          )
          expect(
            await transactions.summary({ month: '2026-10' }),
          ).toMatchObject({
            incomeCents: 0,
            expenseCents: 0,
            transferCount: 1,
          })
          const month = await budgets.month('2026-10', tx, NOW)
          expect(month.unbudgeted.totalCents).toBe(0)
        })
      })
    })
  },
)
