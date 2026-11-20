import '#/load-env'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  categoriesTable,
  transactionsTable,
} from '#/database/schema'
import { ManualTransactionsService } from './manual-transactions.service'
import { TransactionsService } from './transactions.service'
import { bankRows } from '#/transactions/testing/bank-rows'

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
  service: ManualTransactionsService
  checking: string
  outings: string
  groceries: string
  salary: string
}

describe.skipIf(!process.env.DATABASE_URL)(
  'ManualTransactionsService (database)',
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
            service: new ManualTransactionsService(
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

    it('refuses an unknown category, a closed or non-cash account, a future day', async () => {
      await withFixture(async ({ tx, service, outings }) => {
        const [archived] = await tx
          .select()
          .from(accountsTable)
          .where(eq(accountsTable.name, 'Old checking'))
        const [pea] = await tx
          .insert(accountsTable)
          .values({ name: 'PEA', type: 'brokerage' })
          .returning()
        const cases = [
          { amountCents: 100 },
          { amountCents: 100, label: null },
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

    it('counts in the balance after the bank anchor, never dating it', async () => {
      await withFixture(async ({ tx, service, outings, salary, checking }) => {
        await tx.insert(transactionsTable).values(
          await bankRows(tx, {
            accountId: checking,
            bookingDate: '2026-10-10',
            amountCents: -500,
            balanceAfterCents: 99_500,
            rawLabel: 'PAIEMENT CB FICTIF',
            kind: 'expense',
            dedupeHash: 'b'.repeat(64),
          }),
        )
        await service.create({ amountCents: 1_250, categoryId: outings }, NOW)
        await service.create(
          {
            amountCents: 10_000,
            categoryId: salary,
            bookingDate: '2026-10-20',
          },
          NOW,
        )
        // Already in the bank's anchor day: not counted twice.
        await service.create(
          { amountCents: 700, categoryId: outings, bookingDate: '2026-10-10' },
          NOW,
        )
        const accounts = new AccountsService({ db: tx } as never)
        expect(await accounts.findOne(checking)).toMatchObject({
          balanceCents: 99_500 - 1_250 + 10_000,
          balanceDate: '2026-10-10',
        })
      })
    })

    it('makes the balance of an account only fed by hand', async () => {
      await withFixture(async ({ tx, service, outings, salary }) => {
        const [cash] = await tx
          .insert(accountsTable)
          .values({ name: 'Cash', type: 'savings' })
          .returning()
        await service.create(
          {
            amountCents: 5_000,
            categoryId: salary,
            accountId: cash.id,
            bookingDate: '2026-10-01',
          },
          NOW,
        )
        await service.create(
          {
            amountCents: 1_200,
            categoryId: outings,
            accountId: cash.id,
            bookingDate: '2026-10-15',
          },
          NOW,
        )
        const accounts = new AccountsService({ db: tx } as never)
        expect(await accounts.findOne(cash.id)).toMatchObject({
          balanceCents: 3_800,
          balanceDate: '2026-10-15',
        })
      })
    })

    it('keeps a meal-voucher card: credits income, payments expenses, balance from them (#298)', async () => {
      await withFixture(async ({ tx, service, groceries, checking }) => {
        const [card] = await tx
          .insert(accountsTable)
          .values({ name: 'Titres-restaurant', type: 'meal_voucher' })
          .returning()
        const [vouchers] = await tx
          .insert(categoriesTable)
          .values({
            slug: 'manual_test_meal_vouchers',
            name: 'Titres-restaurant test',
            kind: 'income',
          })
          .returning()
        const credit = await service.create(
          {
            amountCents: 18_900,
            kind: 'income',
            categoryId: vouchers.id,
            accountId: card.id,
            bookingDate: '2026-10-02',
            label: 'Crédit titres-restaurant',
          },
          NOW,
        )
        const payment = await service.create(
          {
            amountCents: 2_340,
            categoryId: groceries,
            accountId: card.id,
            bookingDate: '2026-10-12',
          },
          NOW,
        )
        expect([credit.amountCents, credit.kind]).toEqual([18_900, 'income'])
        expect([payment.amountCents, payment.kind]).toEqual([-2_340, 'expense'])

        const accounts = new AccountsService({ db: tx } as never)
        expect(await accounts.findOne(card.id)).toMatchObject({
          balanceCents: 16_560,
          balanceDate: '2026-10-12',
        })

        // Both sides count, at their real amounts, never as a transfer.
        const summary = await new TransactionsService({
          db: tx,
        } as never).summary({ accountId: card.id, month: '2026-10' })
        expect(summary).toMatchObject({
          count: 2,
          incomeCents: 18_900,
          expenseCents: -2_340,
          transferCount: 0,
        })

        // The default account stays the checking one.
        const noted = await service.create(
          { amountCents: 500, categoryId: groceries },
          NOW,
        )
        expect(noted.accountId).toBe(checking)
      })
    })

    it('caps the meal-voucher card at 25 € of payments a day (#298)', async () => {
      await withFixture(
        async ({ tx, service, groceries, salary, checking }) => {
          const [card] = await tx
            .insert(accountsTable)
            .values({ name: 'Titres-restaurant', type: 'meal_voucher' })
            .returning()
          const pay = (amountCents: number, bookingDate = '2026-10-12') =>
            service.create(
              {
                amountCents,
                categoryId: groceries,
                accountId: card.id,
                bookingDate,
              },
              NOW,
            )
          const first = await pay(1_500)
          await pay(1_000)
          // 25 € reached: one cent more is refused, another day is not.
          await expect(pay(1)).rejects.toThrow('capped at 25 €')
          await expect(pay(2_600, '2026-10-13')).rejects.toBeInstanceOf(
            BadRequestException,
          )
          await pay(2_500, '2026-10-13')
          // An edit counts without its own previous amount.
          await service.update(first.id, { amountCents: 1_500, note: 'x' }, NOW)
          await expect(
            service.update(first.id, { amountCents: 1_600 }, NOW),
          ).rejects.toThrow('capped at 25 €')
          await expect(
            service.update(first.id, { bookingDate: '2026-10-13' }, NOW),
          ).rejects.toThrow('capped at 25 €')
          // Credits, refunds and other accounts are never capped.
          await service.create(
            {
              amountCents: 20_000,
              kind: 'income',
              categoryId: salary,
              accountId: card.id,
              bookingDate: '2026-10-12',
            },
            NOW,
          )
          await service.create(
            {
              amountCents: 3_000,
              direction: 'in',
              categoryId: groceries,
              accountId: card.id,
              bookingDate: '2026-10-12',
            },
            NOW,
          )
          await service.create(
            {
              amountCents: 9_000,
              categoryId: groceries,
              accountId: checking,
              bookingDate: '2026-10-12',
            },
            NOW,
          )
        },
      )
    })

    it('enters income and transfers with the sign of their direction', async () => {
      await withFixture(async ({ tx, service, salary }) => {
        const income = await service.create(
          { amountCents: 250_000, categoryId: salary, isOneOff: true },
          NOW,
        )
        expect(income).toMatchObject({
          amountCents: 250_000,
          kind: 'income',
          isOneOff: true,
          needsReview: false,
        })
        const [moves] = await tx
          .insert(categoriesTable)
          .values({
            slug: 'manual_test_moves',
            name: 'Épargne test',
            kind: 'transfer',
          })
          .returning()
        const out = await service.create(
          { amountCents: 30_000, categoryId: moves.id, note: 'Livret' },
          NOW,
        )
        expect(out).toMatchObject({
          amountCents: -30_000,
          kind: 'transfer',
          note: 'Livret',
        })
        const back = await service.create(
          {
            amountCents: 5_000,
            kind: 'transfer',
            direction: 'in',
            label: 'Retour',
          },
          NOW,
        )
        expect(back).toMatchObject({
          amountCents: 5_000,
          kind: 'transfer',
          categoryId: null,
          rawLabel: 'Retour',
          // No category: the review queue.
          needsReview: true,
        })
        // A refund: an expense coming in.
        expect(
          await service.create(
            {
              amountCents: 1_500,
              kind: 'expense',
              direction: 'in',
              label: 'Remb.',
            },
            NOW,
          ),
        ).toMatchObject({ amountCents: 1_500, kind: 'expense' })
      })
    })

    it('edits the kind, direction, one-off flag and note; the sign stays otherwise', async () => {
      await withFixture(async ({ service, outings, salary }) => {
        const created = await service.create(
          { amountCents: 1_250, categoryId: outings },
          NOW,
        )
        expect(
          await service.update(created.id, { amountCents: 2_000 }, NOW),
        ).toMatchObject({ amountCents: -2_000 })
        expect(
          await service.update(
            created.id,
            { categoryId: salary, direction: 'in' },
            NOW,
          ),
        ).toMatchObject({ amountCents: 2_000, kind: 'income' })
        // A categorized row has its category's kind (#368).
        await expect(
          service.update(created.id, { kind: 'transfer' }, NOW),
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(
          await service.update(
            created.id,
            { isOneOff: true, note: 'Note' },
            NOW,
          ),
        ).toMatchObject({
          amountCents: 2_000,
          kind: 'income',
          isOneOff: true,
          note: 'Note',
        })
        expect(
          await service.update(
            created.id,
            { categoryId: null, kind: 'transfer', note: null },
            NOW,
          ),
        ).toMatchObject({
          categoryId: null,
          kind: 'transfer',
          needsReview: true,
          note: null,
        })
      })
    })

    it('unlinks a prepaid payment that stops being an expense (#367)', async () => {
      await withFixture(async ({ tx, service, checking, outings, salary }) => {
        const created = await service.create(
          { amountCents: 12_000, categoryId: outings },
          NOW,
        )
        const [plan] = await tx
          .insert(schema.recurringItemsTable)
          .values({
            accountId: checking,
            merchantKey: 'abonnement fictif',
            direction: 'debit',
            name: 'Abonnement fictif',
            status: 'confirmed',
            isFixedCost: true,
            cadence: 'yearly',
            amountType: 'fixed',
            typicalAmountCents: 12_000,
            confidence: 1,
            lastSeenDate: '2026-10-31',
            termMonths: 12,
          })
          .returning()
        await tx
          .update(transactionsTable)
          .set({ prepaidItemId: plan.id })
          .where(eq(transactionsTable.id, created.id))

        await service.update(
          created.id,
          { categoryId: salary, direction: 'in' },
          NOW,
        )
        expect(await row(tx, created.id)).toMatchObject({
          kind: 'income',
          prepaidItemId: null,
        })
      })
    })

    it('suggests typed labels and frequent merchants with their usual category', async () => {
      await withFixture(
        async ({ tx, service, checking, outings, groceries, salary }) => {
          const note = (
            label: string | undefined,
            categoryId: string,
            day: string,
          ) =>
            service.create(
              { amountCents: 500, categoryId, label, bookingDate: day },
              NOW,
            )
          // Typed three times, twice under one category: no dominant one.
          await note('Fournil Fictif', groceries, '2026-10-01')
          await note('fournil fictif ', groceries, '2026-10-05')
          await note('Fournil fictif', outings, '2026-10-06')
          // Typed twice, always the same category; spelt as last typed.
          await note('ciné test', outings, '2026-09-01')
          await note('Ciné Test', outings, '2026-10-02')
          // Left to its default label (the category name): not typed.
          await note(undefined, outings, '2026-10-03')
          // Over a year old: forgotten.
          await note('Vieux libellé', outings, '2025-10-01')
          // Another kind.
          await service.create(
            {
              amountCents: 500,
              categoryId: salary,
              label: 'Prime fictive',
              direction: 'in',
              bookingDate: '2026-10-04',
            },
            NOW,
          )
          const imported = (merchant: string, day: string, hash: string) => ({
            accountId: checking,
            bookingDate: day,
            amountCents: -900,
            rawLabel: `CB ${merchant.toUpperCase()} 01/10`,
            merchant,
            kind: 'expense' as const,
            categoryId: groceries,
            dedupeHash: hash.repeat(64),
          })
          await tx.insert(transactionsTable).values(
            await bankRows(tx, [
              // Seen four times: suggested, filed under groceries.
              imported('Épicerie Fictive', '2026-10-10', 'a'),
              imported('Épicerie Fictive', '2026-10-11', 'b'),
              imported('Épicerie Fictive', '2026-10-12', 'c'),
              imported('Épicerie Fictive', '2026-10-13', 'd'),
              // Seen once: left out.
              imported('Magasin Unique', '2026-10-14', 'e'),
              // Seen twice, but more than six months ago.
              imported('Ancien Magasin', '2026-03-01', 'f'),
              imported('Ancien Magasin', '2026-03-02', '0'),
            ]),
          )

          const ours = new Set([
            'Fournil fictif',
            'Ciné Test',
            'Épicerie Fictive',
            'Sorties test',
            'Vieux libellé',
            'Prime fictive',
            'Magasin Unique',
            'Ancien Magasin',
          ])
          const { items } = await service.suggestions('expense', NOW)
          expect(items.filter((item) => ours.has(item.label))).toEqual([
            { label: 'Fournil fictif', categoryId: null },
            { label: 'Épicerie Fictive', categoryId: groceries },
            { label: 'Ciné Test', categoryId: outings },
          ])

          const income = await service.suggestions('income', NOW)
          expect(income.items.filter((item) => ours.has(item.label))).toEqual([
            { label: 'Prime fictive', categoryId: salary },
          ])

          // Most used categories of the kind over 90 days: groceries (4
          // imported + 2 typed) before outings (3 typed + the default one).
          const ranked = (await service.suggestions('expense', NOW)).categoryIds
          expect(
            ranked.filter((id) => id === groceries || id === outings),
          ).toEqual([groceries, outings])
          expect(ranked).not.toContain(salary)
          expect(income.categoryIds).toContain(salary)

          // An archived category is no longer filled in.
          await tx
            .update(categoriesTable)
            .set({ archivedAt: NOW })
            .where(eq(categoriesTable.id, outings))
          const afterArchive = await service.suggestions('expense', NOW)
          expect(afterArchive.items).toContainEqual({
            label: 'Ciné Test',
            categoryId: null,
          })
          expect(afterArchive.categoryIds).not.toContain(outings)
        },
      )
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
          .values(
            await bankRows(tx, {
              accountId: checking,
              bookingDate: '2026-10-10',
              amountCents: -500,
              rawLabel: 'PAIEMENT CB FICTIF',
              kind: 'expense',
              dedupeHash: 'a'.repeat(64),
            }),
          )
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
