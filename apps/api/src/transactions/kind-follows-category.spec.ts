import '#/load-env'
import { randomUUID } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import * as schema from '#/database/schema'
import {
  categoriesTable,
  transactionLinesView,
  transactionsTable,
} from '#/database/schema'
import type { TransactionKind } from '#/database/schema/domain-enums'
import { ManualTransactionsService } from './manual-transactions.service'
import { TransactionsService } from './transactions.service'

/**
 * A categorized transaction or split part has its category's kind (#368,
 * ADR 0005 R1): the `transactions_kind_follows_category` trigger, the API's
 * 400s and what the statistics read. Against the test database, each test in
 * a rolled-back transaction. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
const ROLLBACK = Symbol('rollback')
const NOW = new Date('2026-11-05T10:00:00Z')

describe.skipIf(!process.env.DATABASE_URL)(
  'kind follows the category (database)',
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
      tx: Db
      transactions: TransactionsService
      manual: ManualTransactionsService
      checking: string
      livret: string
      restaurants: string
      salary: string
      savings: string
      /** Inserts a row straight into the table, bypassing the API. */
      row: (values: {
        amountCents: number
        kind: TransactionKind
        categoryId?: string | null
        counterpartAccountId?: string | null
      }) => Promise<string>
      read: (id: string) => Promise<{
        kind: TransactionKind
        categoryId: string | null
        counterpartAccountId: string | null
        needsReview: boolean
      }>
      /** Sum of the transaction's lines per kind, as statistics read them. */
      lines: (id: string) => Promise<Record<string, number>>
    }

    async function inRollback(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          const database = { db: tx } as never
          const accounts = new AccountsService(database)
          const transactions = new TransactionsService(database)
          const manual = new ManualTransactionsService(database, transactions)
          const checking = (
            await accounts.create({
              name: 'Test checking',
              type: 'checking',
              institution: 'Test bank',
            })
          ).id
          const livret = (
            await accounts.create({
              name: 'Test livret',
              type: 'savings',
              institution: 'Test bank',
            })
          ).id
          const category = async (kind: TransactionKind, name: string) => {
            const [created] = await tx
              .insert(categoriesTable)
              .values({
                slug: `test-${kind}-${randomUUID().slice(0, 8)}`,
                name,
                kind,
              })
              .returning({ id: categoriesTable.id })
            return created.id
          }
          const fixture: Fixture = {
            tx: tx as unknown as Db,
            transactions,
            manual,
            checking,
            livret,
            restaurants: await category('expense', 'Test restaurants'),
            salary: await category('income', 'Test salary'),
            savings: await category('transfer', 'Test savings'),
            row: async (values) => {
              const [created] = await tx
                .insert(transactionsTable)
                .values({
                  accountId: checking,
                  bookingDate: '2026-10-10',
                  rawLabel: 'TEST ROW',
                  dedupeHash: randomUUID().replaceAll('-', ''),
                  ...values,
                })
                .returning({ id: transactionsTable.id })
              return created.id
            },
            read: async (id) => {
              const [found] = await tx
                .select({
                  kind: transactionsTable.kind,
                  categoryId: transactionsTable.categoryId,
                  counterpartAccountId: transactionsTable.counterpartAccountId,
                  needsReview: transactionsTable.needsReview,
                })
                .from(transactionsTable)
                .where(eq(transactionsTable.id, id))
              return found
            },
            lines: async (id) => {
              const rows = await tx
                .select({
                  kind: transactionLinesView.kind,
                  total:
                    sql<number>`sum(${transactionLinesView.amountCents})`.mapWith(
                      Number,
                    ),
                })
                .from(transactionLinesView)
                .where(eq(transactionLinesView.id, id))
                .groupBy(transactionLinesView.kind)
              return Object.fromEntries(rows.map((r) => [r.kind, r.total]))
            },
          }
          await fn(fixture)
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    describe('trigger', () => {
      it('gives an inserted row its category kind, whatever was written', async () => {
        await inRollback(async ({ row, read, restaurants, salary }) => {
          const refund = await row({
            amountCents: 12_00,
            kind: 'income',
            categoryId: restaurants,
          })
          expect((await read(refund)).kind).toBe('expense')
          const loweredIncome = await row({
            amountCents: -50_00,
            kind: 'expense',
            categoryId: salary,
          })
          expect((await read(loweredIncome)).kind).toBe('income')
          // An uncategorized row keeps the kind it was given.
          const uncategorized = await row({
            amountCents: 5_00,
            kind: 'transfer',
          })
          expect((await read(uncategorized)).kind).toBe('transfer')
        })
      })

      it('keeps the kind on updates and drops what the new kind refuses', async () => {
        await inRollback(
          async ({ tx, row, read, livret, restaurants, savings }) => {
            const id = await row({
              amountCents: -100_00,
              kind: 'transfer',
              categoryId: savings,
              counterpartAccountId: livret,
            })
            // A kind written alone on a categorized row is put back.
            await tx
              .update(transactionsTable)
              .set({ kind: 'expense' })
              .where(eq(transactionsTable.id, id))
            expect(await read(id)).toMatchObject({
              kind: 'transfer',
              counterpartAccountId: livret,
            })
            // Another category brings its kind; a transfer link goes with it.
            await tx
              .update(transactionsTable)
              .set({ categoryId: restaurants })
              .where(eq(transactionsTable.id, id))
            expect(await read(id)).toMatchObject({
              kind: 'expense',
              counterpartAccountId: null,
            })
            // Without a category, the kind is free again.
            await tx
              .update(transactionsTable)
              .set({ categoryId: null, kind: 'income' })
              .where(eq(transactionsTable.id, id))
            expect((await read(id)).kind).toBe('income')
          },
        )
      })

      it('leaves no categorized row with another kind', async () => {
        await inRollback(async ({ tx, row, restaurants, salary }) => {
          await row({
            amountCents: 1_00,
            kind: 'income',
            categoryId: restaurants,
          })
          await row({
            amountCents: -1_00,
            kind: 'transfer',
            categoryId: salary,
          })
          const [{ mismatched }] = await tx
            .select({ mismatched: sql<number>`count(*)`.mapWith(Number) })
            .from(transactionsTable)
            .innerJoin(
              categoriesTable,
              and(
                eq(categoriesTable.id, transactionsTable.categoryId),
                sql`${categoriesTable.kind} <> ${transactionsTable.kind}`,
              ),
            )
          expect(mismatched).toBe(0)
        })
      })
    })

    describe('statistics', () => {
      it('counts a positive amount in an expense category as a refund of it, split or not', async () => {
        await inRollback(
          async ({ transactions, row, lines, restaurants, salary }) => {
            const refund = await row({
              amountCents: 30_00,
              kind: 'income',
              categoryId: restaurants,
            })
            expect(await lines(refund)).toEqual({ expense: 30_00 })

            const split = await row({ amountCents: 100_00, kind: 'income' })
            const dto = await transactions.split(split, [
              { categoryId: restaurants, amountCents: 30_00 },
              { categoryId: salary, amountCents: 70_00 },
            ])
            // The largest part's category, and with it its kind.
            expect(dto).toMatchObject({ categoryId: salary, kind: 'income' })
            expect(dto.splits?.map((part) => part.kind)).toEqual([
              'expense',
              'income',
            ])
            expect(await lines(split)).toEqual({
              expense: 30_00,
              income: 70_00,
            })
          },
        )
      })

      it('counts a negative amount in an income category as lowering it, split or not', async () => {
        await inRollback(
          async ({ transactions, row, lines, read, restaurants, salary }) => {
            const lowered = await row({
              amountCents: -40_00,
              kind: 'expense',
              categoryId: salary,
            })
            expect(await lines(lowered)).toEqual({ income: -40_00 })

            const split = await row({ amountCents: -100_00, kind: 'expense' })
            await transactions.split(split, [
              { categoryId: salary, amountCents: -60_00 },
              { categoryId: restaurants, amountCents: -40_00 },
            ])
            expect((await read(split)).kind).toBe('income')
            expect(await lines(split)).toEqual({
              income: -60_00,
              expense: -40_00,
            })
          },
        )
      })
    })

    describe('API', () => {
      it('refuses a kind sent against the category (400)', async () => {
        await inRollback(async ({ transactions, row, read, restaurants }) => {
          const id = await row({ amountCents: -10_00, kind: 'expense' })
          await expect(
            transactions.update(id, {
              categoryId: restaurants,
              kind: 'income',
            }),
          ).rejects.toBeInstanceOf(BadRequestException)
          await expect(
            transactions.bulkUpdate({
              ids: [id],
              categoryId: restaurants,
              kind: 'transfer',
            }),
          ).rejects.toBeInstanceOf(BadRequestException)
          // The category's own kind is accepted.
          const filed = await transactions.update(id, {
            categoryId: restaurants,
            kind: 'expense',
          })
          expect(filed).toMatchObject({
            kind: 'expense',
            categoryId: restaurants,
          })
          expect((await read(id)).needsReview).toBe(false)
        })
      })

      it('accepts a kind alone on uncategorized rows only', async () => {
        await inRollback(async ({ transactions, row, restaurants }) => {
          const loose = await row({ amountCents: -10_00, kind: 'expense' })
          const filed = await row({
            amountCents: -10_00,
            kind: 'expense',
            categoryId: restaurants,
          })
          expect(
            (await transactions.update(loose, { kind: 'transfer' })).kind,
          ).toBe('transfer')
          await expect(
            transactions.update(filed, { kind: 'transfer' }),
          ).rejects.toBeInstanceOf(BadRequestException)
          await expect(
            transactions.bulkUpdate({ ids: [loose, filed], kind: 'income' }),
          ).rejects.toBeInstanceOf(BadRequestException)
          // Its own kind changes nothing and is accepted.
          expect(
            (await transactions.update(filed, { kind: 'expense' })).kind,
          ).toBe('expense')
          // Removing the category frees the kind in the same change.
          expect(
            await transactions.update(filed, {
              categoryId: null,
              kind: 'income',
            }),
          ).toMatchObject({ categoryId: null, kind: 'income' })
        })
      })

      it('applies the rule to manual transactions', async () => {
        await inRollback(async ({ manual, checking, restaurants, salary }) => {
          await expect(
            manual.create(
              {
                amountCents: 12_00,
                direction: 'in',
                kind: 'income',
                categoryId: restaurants,
                accountId: checking,
                bookingDate: '2026-11-01',
              },
              NOW,
            ),
          ).rejects.toBeInstanceOf(BadRequestException)
          const refund = await manual.create(
            {
              amountCents: 12_00,
              direction: 'in',
              categoryId: restaurants,
              accountId: checking,
              bookingDate: '2026-11-01',
            },
            NOW,
          )
          expect(refund).toMatchObject({ kind: 'expense', amountCents: 12_00 })
          await expect(
            manual.update(refund.id, { kind: 'income' }, NOW),
          ).rejects.toBeInstanceOf(BadRequestException)
          await expect(
            manual.update(
              refund.id,
              { categoryId: salary, kind: 'expense' },
              NOW,
            ),
          ).rejects.toBeInstanceOf(BadRequestException)
          expect(
            await manual.update(refund.id, { categoryId: salary }, NOW),
          ).toMatchObject({ kind: 'income', categoryId: salary })
          expect(
            await manual.update(
              refund.id,
              { categoryId: null, label: 'Test', kind: 'transfer' },
              NOW,
            ),
          ).toMatchObject({ kind: 'transfer', categoryId: null })
        })
      })
    })
  },
)
