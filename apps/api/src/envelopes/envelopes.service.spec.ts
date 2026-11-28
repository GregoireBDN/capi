import { asSpecOwner } from '#/database/testing/spec-owner'
import '#/load-env'
import { eq, sql } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import { BudgetsService } from '#/budgets/budgets.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  budgetsTable,
  categoriesTable,
  envelopeCategoriesTable,
  envelopeMovementsTable,
  envelopeSplitKeysTable,
  envelopesTable,
  type InsertTransaction,
  transactionsTable,
} from '#/database/schema'
import { restoreAbsorbedManual } from '#/imports/undo/import-undo'
import { bankRows } from '#/transactions/testing/bank-rows'
import { EnvelopesService, envelopePlan, splitByKey } from './envelopes.service'
import { attributeSpend } from './paid'

/**
 * Envelopes (#429, ADR 0008) against the test database: every test runs in a
 * transaction that is rolled back. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
/** 6 November 2026, mid-morning in Paris. */
const NOW = new Date('2026-11-06T10:00:00Z')
/** 1 November 2026: envelopes created before the month's operations. */
const EARLY = new Date('2026-11-01T10:00:00Z')

describe('envelope arithmetic', () => {
  it('splits a saving by the key, rounded down, the rest « libre »', () => {
    expect(
      splitByKey(30_001, [
        { envelopeId: 'a', basisPoints: 3_333 },
        { envelopeId: 'b', basisPoints: 1 },
        { envelopeId: 'c', basisPoints: 2_000 },
      ]),
    ).toEqual([
      { envelopeId: 'a', amountCents: 9_999 },
      { envelopeId: 'b', amountCents: 3 },
      { envelopeId: 'c', amountCents: 6_000 },
    ])
    expect(splitByKey(99, [{ envelopeId: 'a', basisPoints: 100 }])).toEqual([])
  })

  it('attributes what an envelope paid to the lines in order, each at most its part', () => {
    expect(
      attributeSpend(-12_000, [
        { categoryId: 'food', amountCents: -5_000 },
        { categoryId: 'refund', amountCents: 1_000 },
        { categoryId: 'hotel', amountCents: -10_000 },
      ]),
    ).toEqual([
      { categoryId: 'food', paidCents: 5_000 },
      { categoryId: 'hotel', paidCents: 7_000 },
    ])
    // A share added since: the lines cap it.
    expect(
      attributeSpend(-10_000, [{ categoryId: 'food', amountCents: -6_000 }]),
    ).toEqual([{ categoryId: 'food', paidCents: 6_000 }])
    // A refund gives back.
    expect(
      attributeSpend(2_000, [{ categoryId: 'food', amountCents: 2_000 }]),
    ).toEqual([{ categoryId: 'food', paidCents: -2_000 }])
  })

  it('spreads what is missing over the month ends left', () => {
    expect(envelopePlan(122_100, 400_000, '2027-06-30', '2026-11-26')).toEqual({
      remainingCents: 277_900,
      progressRatio: 122_100 / 400_000,
      reached: false,
      monthsLeft: 8,
      targetDatePassed: false,
      requiredMonthlyCents: 34_738,
    })
    expect(envelopePlan(100, null, null, '2026-11-26')).toMatchObject({
      remainingCents: null,
      requiredMonthlyCents: null,
    })
    expect(envelopePlan(100, 1_000, '2026-10-01', '2026-11-26')).toMatchObject({
      targetDatePassed: true,
      requiredMonthlyCents: null,
    })
  })
})

describe.skipIf(!process.env.DATABASE_URL)(
  'EnvelopesService (database)',
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
      envelopes: EnvelopesService
      accounts: AccountsService
      budgets: BudgetsService
      checking: string
      livret: string
      trip: string
      food: string
      saving: string
      move: string
    }

    let hash = 0
    function row(
      accountId: string,
      bookingDate: string,
      amountCents: number,
      kind: InsertTransaction['kind'],
      overrides: Partial<InsertTransaction> = {},
    ): InsertTransaction {
      hash++
      return {
        accountId,
        bookingDate,
        amountCents,
        kind,
        rawLabel: 'OPERATION TEST FICTIVE',
        dedupeHash: `envelope-test-${hash}`,
        ...overrides,
      }
    }

    async function insert(
      tx: Tx,
      rows: InsertTransaction | InsertTransaction[],
    ) {
      return tx
        .insert(transactionsTable)
        .values(await bankRows(tx, rows))
        .returning({ id: transactionsTable.id })
    }

    async function inRollback(fn: (f: Fixture) => Promise<void>) {
      await db
        .transaction(async (tx) => {
          await asSpecOwner(tx)
          const database = { db: tx } as never
          const accounts = new AccountsService(database)
          const envelopes = new EnvelopesService(database, accounts)
          const budgets = new BudgetsService(database)
          const [checking, livret] = await tx
            .insert(accountsTable)
            .values([
              { name: 'Courant test', type: 'checking' },
              { name: 'Livret test', type: 'savings' },
            ])
            .returning({ id: accountsTable.id })
          const categories = await tx
            .insert(categoriesTable)
            .values([
              { slug: 'env-test-trip', name: 'Voyage test', kind: 'expense' },
              { slug: 'env-test-food', name: 'Repas test', kind: 'expense' },
              {
                slug: 'env-test-saving',
                name: 'Épargne test',
                kind: 'transfer',
              },
              { slug: 'env-test-salary', name: 'Salaire test', kind: 'income' },
            ])
            .returning({ id: categoriesTable.id })
          // Opening money: 2 000 € on checking, 5 000 € on the livret.
          await insert(tx, [
            row(checking.id, '2026-10-01', 200_000, 'income', {
              categoryId: categories[3].id,
              createdAt: new Date('2026-10-02T08:00:00Z'),
            }),
            row(livret.id, '2026-10-01', 500_000, 'transfer', {
              categoryId: categories[2].id,
              createdAt: new Date('2026-10-02T08:00:00Z'),
            }),
          ])
          await fn({
            tx,
            envelopes,
            accounts,
            budgets,
            checking: checking.id,
            livret: livret.id,
            trip: categories[0].id,
            food: categories[1].id,
            saving: categories[2].id,
            move: categories[2].id,
          })
          throw ROLLBACK
        })
        .catch((error: unknown) => {
          if (error !== ROLLBACK) throw error
        })
    }

    async function netWorth(accounts: AccountsService) {
      const list = await accounts.list({ includeArchived: true })
      return list.reduce((sum, a) => sum + (a.balanceCents ?? 0), 0)
    }

    it('sets money aside from « libre » without moving net worth', async () => {
      await inRollback(
        async ({ envelopes, accounts, checking, livret, trip }) => {
          const before = await netWorth(accounts)
          const lisbon = await envelopes.create(
            {
              name: 'Lisbonne',
              icon: 'plane',
              color: '#0284c7',
              targetCents: 80_000,
              dueDate: '2027-07-01',
              categoryIds: [trip],
              start: [
                { accountId: livret, amountCents: 30_000 },
                { accountId: checking, amountCents: 10_000 },
              ],
            },
            { now: NOW },
          )
          expect(lisbon).toMatchObject({
            totalCents: 40_000,
            putAsideCents: 40_000,
            categoryIds: [trip],
            plan: { remainingCents: 40_000, monthsLeft: 8 },
          })
          expect(await netWorth(accounts)).toBe(before)

          const split = await envelopes.forAccount(livret)
          expect(split).toMatchObject({
            balanceCents: 500_000,
            allocatedCents: 30_000,
            freeCents: 470_000,
            shortfallCents: 0,
          })
          expect(split.envelopes[0]).toMatchObject({
            name: 'Lisbonne',
            amountCents: 30_000,
            shareOfBalance: 600,
          })
          // Never more than « libre ».
          await expect(
            envelopes.create({
              name: 'Trop',
              start: [{ accountId: checking, amountCents: 190_001 }],
            }),
          ).rejects.toThrow('libre')
          // Only expense categories.
          await expect(
            envelopes.create({ name: 'Mauvais', categoryIds: [livret] }),
          ).rejects.toThrow('Unknown category')
        },
      )
    })

    it('moves money between envelopes and « libre », keeping the history', async () => {
      await inRollback(async ({ envelopes, accounts, livret }) => {
        const a = await envelopes.create({
          name: 'Apport',
          start: [{ accountId: livret, amountCents: 50_000 }],
        })
        const b = await envelopes.create({ name: 'Imprévus' })
        const before = await netWorth(accounts)
        const after = await envelopes.move(
          {
            accountId: livret,
            fromEnvelopeId: a.id,
            toEnvelopeId: b.id,
            amountCents: 20_000,
          },
          { now: NOW },
        )
        expect(after.envelopes.map((x) => [x.name, x.amountCents])).toEqual([
          ['Apport', 30_000],
          ['Imprévus', 20_000],
        ])
        expect(after.freeCents).toBe(450_000)
        expect(await netWorth(accounts)).toBe(before)

        await envelopes.move({
          accountId: livret,
          fromEnvelopeId: b.id,
          toEnvelopeId: null,
          amountCents: 5_000,
        })
        await expect(
          envelopes.move({
            accountId: livret,
            fromEnvelopeId: b.id,
            toEnvelopeId: null,
            amountCents: 15_001,
          }),
        ).rejects.toThrow('More than the envelope holds')

        const detail = await envelopes.detail(b.id, { now: NOW })
        expect(detail.movements.map((x) => [x.reason, x.amountCents])).toEqual(
          expect.arrayContaining([
            ['move', 20_000],
            ['move', -5_000],
          ]),
        )
        expect(
          detail.movements.find((x) => x.amountCents === 20_000),
        ).toMatchObject({
          counterEnvelopeId: a.id,
        })
        expect(detail.history.at(-1)).toMatchObject({
          month: '2026-11',
          totalCents: 15_000,
        })
      })
    })

    it('creates and adds to an envelope from « libre » only, changing no balance or statistic (#518)', async () => {
      await inRollback(
        async ({ tx, envelopes, accounts, checking, livret }) => {
          const flows = async () =>
            (
              await tx.execute<{ n: number; cents: string | null }>(
                sql`select count(*)::int as n, sum(amount_cents)::text as cents from transaction_lines`,
              )
            )[0]
          const balances = async () =>
            (await accounts.list({ includeArchived: true })).map((a) => [
              a.id,
              a.balanceCents,
            ])
          const [beforeFlows, beforeBalances, beforeWorth] = await Promise.all([
            flows(),
            balances(),
            netWorth(accounts),
          ])
          const japan = await envelopes.create(
            {
              name: 'Voyage Japon',
              targetCents: 240_000,
              dueDate: '2027-06-15',
              start: [{ accountId: livret, amountCents: 30_000 }],
            },
            { now: NOW },
          )
          const after = await envelopes.topUp(
            japan.id,
            { accountId: livret, amountCents: 20_000 },
            { now: NOW },
          )
          expect(after).toMatchObject({
            allocatedCents: 50_000,
            freeCents: 450_000,
          })
          expect((await envelopes.detail(japan.id)).totalCents).toBe(50_000)
          expect(await flows()).toEqual(beforeFlows)
          expect(await balances()).toEqual(beforeBalances)
          expect(await netWorth(accounts)).toBe(beforeWorth)

          // Never more than « libre », never into an archived envelope.
          await expect(
            envelopes.topUp(japan.id, {
              accountId: checking,
              amountCents: 200_001,
            }),
          ).rejects.toThrow('libre')
          await envelopes.update(japan.id, { archived: true })
          await expect(
            envelopes.topUp(japan.id, { accountId: livret, amountCents: 100 }),
          ).rejects.toThrow('archived')
          await expect(
            envelopes.topUp('7f0c5a7e-2d1b-4c3a-9e8f-123456789abc', {
              accountId: livret,
              amountCents: 100,
            }),
          ).rejects.toThrow('not found')
        },
      )
    })

    it('reports the gap when the balance falls under its envelopes, reducing nothing', async () => {
      await inRollback(async ({ tx, envelopes, checking }) => {
        const e = await envelopes.create({
          name: 'Voiture',
          start: [{ accountId: checking, amountCents: 150_000 }],
        })
        await insert(tx, row(checking, '2026-11-02', -65_000, 'expense'))
        const split = await envelopes.forAccount(checking)
        expect(split).toMatchObject({
          balanceCents: 135_000,
          allocatedCents: 150_000,
          freeCents: -15_000,
          shortfallCents: 15_000,
        })
        expect((await envelopes.detail(e.id)).totalCents).toBe(150_000)
      })
    })

    it('offers each new saving by the split key and applies it once confirmed', async () => {
      await inRollback(async ({ tx, envelopes, livret, saving }) => {
        const a = await envelopes.create({ name: 'Lisbonne' })
        const b = await envelopes.create({ name: 'Imprévus' })
        await expect(
          envelopes.setSplitKey(livret, {
            shares: [
              { envelopeId: a.id, basisPoints: 6_000 },
              { envelopeId: b.id, basisPoints: 5_000 },
            ],
          }),
        ).rejects.toThrow('100 %')
        const keyed = await envelopes.setSplitKey(livret, {
          shares: [
            { envelopeId: a.id, basisPoints: 2_500 },
            { envelopeId: b.id, basisPoints: 1_000 },
          ],
        })
        expect(keyed.freeBasisPoints).toBe(6_500)

        const [deposit] = await insert(
          tx,
          row(livret, '2026-11-03', 30_001, 'transfer', { categoryId: saving }),
        )
        const offers = await envelopes.offers()
        const offer = offers.savings.find(
          (o) => o.transaction.transactionId === deposit.id,
        )
        expect(offer?.envelopes.map((x) => [x.name, x.amountCents])).toEqual([
          ['Lisbonne', 7_500],
          ['Imprévus', 3_000],
        ])
        // The opening deposit came before the key: not offered.
        expect(offers.savings).toHaveLength(1)

        const applied = await envelopes.applySplit(deposit.id, {})
        expect(applied.allocatedCents).toBe(10_500)
        await expect(envelopes.applySplit(deposit.id, {})).rejects.toThrow(
          'already split',
        )
        expect((await envelopes.offers()).savings).toHaveLength(0)

        // « Non » answers an offer.
        const [other] = await insert(
          tx,
          row(livret, '2026-11-04', 10_000, 'transfer', { categoryId: saving }),
        )
        await envelopes.dismissOffer(other.id)
        expect((await envelopes.offers()).savings).toHaveLength(0)
      })
    })

    it('an attached expense keeps its category, counts once and adds to the budget', async () => {
      await inRollback(
        async ({ tx, envelopes, budgets, accounts, checking, trip }) => {
          const lisbon = await envelopes.create(
            {
              name: 'Lisbonne',
              categoryIds: [trip],
              start: [{ accountId: checking, amountCents: 80_000 }],
            },
            { now: EARLY },
          )
          await tx
            .update(envelopesTable)
            .set({ createdAt: EARLY })
            .where(eq(envelopesTable.id, lisbon.id))
          await tx.insert(budgetsTable).values({
            categoryId: trip,
            effectiveFrom: '2026-11-01',
            monthlyTargetCents: 10_000,
          })
          const [hotel] = await insert(
            tx,
            row(checking, '2026-11-05', -71_500, 'expense', {
              categoryId: trip,
            }),
          )
          const offers = await envelopes.offers()
          expect(
            offers.expenses.find(
              (o) => o.transaction.transactionId === hotel.id,
            )?.envelopes[0],
          ).toMatchObject({ envelopeId: lisbon.id, amountCents: 80_000 })

          const before = await netWorth(accounts)
          const after = await envelopes.attach(lisbon.id, {
            transactionId: hotel.id,
          })
          expect(after).toMatchObject({
            totalCents: 8_500,
            paidCents: 71_500,
            putAsideCents: 80_000,
          })
          expect(await netWorth(accounts)).toBe(before)
          await expect(
            envelopes.attach(lisbon.id, { transactionId: hotel.id }),
          ).rejects.toThrow('already attached')

          const [category] = await tx
            .select({ categoryId: transactionsTable.categoryId })
            .from(transactionsTable)
            .where(eq(transactionsTable.id, hotel.id))
          expect(category.categoryId).toBe(trip)

          const month = await budgets.month('2026-11', tx, NOW)
          const line = month.items.find((item) => item.categoryId === trip)!
          expect(line).toMatchObject({
            spentCents: 71_500,
            envelopePaidCents: 71_500,
            remainingCents: 10_000,
            status: 'ok',
          })
          expect(line.envelopes).toEqual([
            expect.objectContaining({ name: 'Lisbonne', paidCents: 71_500 }),
          ])
          expect(month.totals).toMatchObject({
            spentCents: 71_500,
            envelopePaidCents: 71_500,
          })

          const paid = await envelopes.month('2026-11', { now: NOW })
          expect(paid.envelopes[0]).toMatchObject({
            paidCents: 71_500,
            putAsideCents: 80_000,
            leftCents: 8_500,
            categories: [{ categoryId: trip, paidCents: 71_500 }],
          })

          // Filed as a move between own accounts: the envelope pays nothing.
          const [moved] = await tx
            .insert(categoriesTable)
            .values({
              slug: 'env-test-internal',
              name: 'Virement',
              kind: 'transfer',
            })
            .returning({ id: categoriesTable.id })
          await tx
            .update(transactionsTable)
            .set({ categoryId: moved.id })
            .where(eq(transactionsTable.id, hotel.id))
          expect((await envelopes.detail(lisbon.id)).totalCents).toBe(80_000)
        },
      )
    })

    it('pays at most what it holds on the expense’s account, and part of it on demand', async () => {
      await inRollback(async ({ tx, envelopes, checking, livret, trip }) => {
        const laptop = await envelopes.create({
          name: 'Ordinateur',
          start: [
            { accountId: checking, amountCents: 100_000 },
            { accountId: livret, amountCents: 50_000 },
          ],
        })
        const [buy] = await insert(
          tx,
          row(checking, '2026-11-05', -120_000, 'expense', {
            categoryId: trip,
          }),
        )
        await expect(
          envelopes.attach(laptop.id, {
            transactionId: buy.id,
            amountCents: 110_000,
          }),
        ).rejects.toThrow('More than the envelope holds')
        const after = await envelopes.attach(laptop.id, {
          transactionId: buy.id,
        })
        expect(after.accounts.map((a) => a.amountCents)).toEqual([50_000])
        expect(after.paidCents).toBe(100_000)
      })
    })

    it('a transfer out to a checking account carries the envelope to it', async () => {
      await inRollback(
        async ({ tx, envelopes, accounts, checking, livret, move }) => {
          const lisbon = await envelopes.create(
            {
              name: 'Lisbonne',
              start: [{ accountId: livret, amountCents: 30_000 }],
            },
            { now: EARLY },
          )
          await tx
            .update(envelopesTable)
            .set({ createdAt: EARLY })
            .where(eq(envelopesTable.id, lisbon.id))
          // Booked before the envelope existed: never offered.
          const [older] = await insert(
            tx,
            row(livret, '2026-10-20', -5_000, 'transfer', {
              categoryId: move,
              counterpartAccountId: checking,
            }),
          )
          const [out] = await insert(
            tx,
            row(livret, '2026-11-04', -100_000, 'transfer', {
              categoryId: move,
              counterpartAccountId: checking,
            }),
          )
          await insert(
            tx,
            row(checking, '2026-11-04', 100_000, 'transfer', {
              categoryId: move,
              counterpartAccountId: livret,
            }),
          )
          // Towards savings or an investment: not offered (#430).
          const [pea] = await tx
            .insert(accountsTable)
            .values({ name: 'PEA test', type: 'brokerage' })
            .returning({ id: accountsTable.id })
          const [invested] = await insert(
            tx,
            row(livret, '2026-11-05', -2_000, 'transfer', {
              categoryId: move,
              counterpartAccountId: pea.id,
            }),
          )
          const offers = await envelopes.offers()
          expect(
            offers.transfers.some(
              (o) => o.transaction.transactionId === invested.id,
            ),
          ).toBe(false)
          expect(
            offers.transfers.find((o) => o.transaction.transactionId === out.id)
              ?.envelopes,
          ).toEqual([
            { envelopeId: lisbon.id, name: 'Lisbonne', amountCents: 30_000 },
          ])
          expect(
            offers.transfers.some(
              (o) => o.transaction.transactionId === older.id,
            ),
          ).toBe(false)

          const before = await netWorth(accounts)
          const after = await envelopes.attach(lisbon.id, {
            transactionId: out.id,
          })
          expect(after.totalCents).toBe(30_000)
          expect(after.accounts).toEqual([
            expect.objectContaining({
              accountId: checking,
              amountCents: 30_000,
            }),
          ])
          expect(await netWorth(accounts)).toBe(before)

          // Detaching puts it back, unless the money was spent since.
          const [dinner] = await insert(
            tx,
            row(checking, '2026-11-06', -25_000, 'expense'),
          )
          await envelopes.attach(lisbon.id, { transactionId: dinner.id })
          await expect(envelopes.detach(lisbon.id, out.id)).rejects.toThrow(
            'below zero',
          )
          await envelopes.detach(lisbon.id, dinner.id)
          const back = await envelopes.detach(lisbon.id, out.id)
          expect(back.accounts).toEqual([
            expect.objectContaining({ accountId: livret, amountCents: 30_000 }),
          ])
        },
      )
    })

    it('undoing an import moves what an envelope paid back to the manual expense', async () => {
      await inRollback(async ({ tx, envelopes, checking, trip }) => {
        const lisbon = await envelopes.create({
          name: 'Lisbonne',
          start: [{ accountId: checking, amountCents: 50_000 }],
        })
        const [bank] = await insert(
          tx,
          row(checking, '2026-11-05', -20_000, 'expense', {
            categoryId: trip,
            absorbedManual: {
              bookingDate: '2026-11-04',
              rawLabel: 'Dîner',
              note: null,
            },
          }),
        )
        await envelopes.attach(lisbon.id, { transactionId: bank.id })
        const [{ importId }] = await tx
          .select({ importId: transactionsTable.importId })
          .from(transactionsTable)
          .where(eq(transactionsTable.id, bank.id))
        expect(await restoreAbsorbedManual(tx, importId!)).toBe(1)
        const [movement] = await tx
          .select({
            transactionId: envelopeMovementsTable.transactionId,
            manual: transactionsTable.manual,
          })
          .from(envelopeMovementsTable)
          .innerJoin(
            transactionsTable,
            eq(transactionsTable.id, envelopeMovementsTable.transactionId),
          )
          .where(eq(envelopeMovementsTable.envelopeId, lisbon.id))
        expect(movement).toMatchObject({ manual: true })
        expect(movement.transactionId).not.toBe(bank.id)
      })
    })

    describe('database rules', () => {
      /** `write` fails on `constraint`, inside a savepoint so `tx` goes on. */
      async function refused(
        tx: Tx,
        constraint: string,
        write: (nested: Tx) => Promise<unknown>,
      ) {
        await expect(
          tx.transaction(async (nested) => {
            await write(nested)
          }),
        ).rejects.toMatchObject({ cause: { constraint_name: constraint } })
      }

      it('refuses envelopes, keys and movements that break the rules', async () => {
        await inRollback(async ({ tx, checking, livret, trip, saving }) => {
          const [env, other] = await tx
            .insert(envelopesTable)
            .values([{ name: 'Un' }, { name: 'Deux' }])
            .returning({ id: envelopesTable.id })
          await refused(tx, 'envelopes_name_not_blank', (n) =>
            n.insert(envelopesTable).values({ name: '  ' }),
          )
          await refused(tx, 'envelopes_target_positive', (n) =>
            n.insert(envelopesTable).values({ name: 'X', targetCents: 0 }),
          )
          await refused(tx, 'envelope_categories_expense_only', (n) =>
            n
              .insert(envelopeCategoriesTable)
              .values({ envelopeId: env.id, categoryId: saving }),
          )
          await tx
            .insert(envelopeCategoriesTable)
            .values({ envelopeId: env.id, categoryId: trip })
          await refused(tx, 'envelope_categories_expense_only', (n) =>
            n
              .update(categoriesTable)
              .set({ kind: 'income' })
              .where(eq(categoriesTable.id, trip)),
          )
          await refused(tx, 'envelope_split_keys_basis_points_range', (n) =>
            n.insert(envelopeSplitKeysTable).values({
              accountId: livret,
              envelopeId: env.id,
              basisPoints: 10_001,
            }),
          )
          await refused(tx, 'envelope_split_keys_within_account', (n) =>
            n.insert(envelopeSplitKeysTable).values([
              { accountId: livret, envelopeId: env.id, basisPoints: 6_000 },
              { accountId: livret, envelopeId: other.id, basisPoints: 4_001 },
            ]),
          )

          const base = {
            envelopeId: env.id,
            accountId: checking,
            onDate: '2026-11-01',
          }
          await refused(tx, 'envelope_movements_amount_not_zero', (n) =>
            n
              .insert(envelopeMovementsTable)
              .values({ ...base, amountCents: 0, reason: 'move' }),
          )
          await refused(tx, 'envelope_movements_start_split_positive', (n) =>
            n
              .insert(envelopeMovementsTable)
              .values({ ...base, amountCents: -1, reason: 'start' }),
          )
          await refused(
            tx,
            'envelope_movements_transaction_iff_linked_reason',
            (n) =>
              n
                .insert(envelopeMovementsTable)
                .values({ ...base, amountCents: -1, reason: 'spend' }),
          )
          await refused(tx, 'envelope_movements_counter_only_on_moves', (n) =>
            n.insert(envelopeMovementsTable).values({
              ...base,
              amountCents: 1,
              reason: 'start',
              counterEnvelopeId: other.id,
            }),
          )
          await refused(tx, 'envelope_movements_counter_only_on_moves', (n) =>
            n.insert(envelopeMovementsTable).values({
              ...base,
              amountCents: 1,
              reason: 'move',
              counterEnvelopeId: env.id,
            }),
          )

          const [expense] = await insert(
            tx,
            row(checking, '2026-11-02', -5_000, 'expense', {
              categoryId: trip,
            }),
          )
          const [income] = await insert(
            tx,
            row(livret, '2026-11-02', 5_000, 'income'),
          )
          // Entered by hand: only those change amount (#367).
          const [out] = await insert(
            tx,
            row(livret, '2026-11-02', -5_000, 'transfer', {
              counterpartAccountId: checking,
              manual: true,
            }),
          )
          // A spend on an expense of its account, at most its amount.
          await refused(tx, 'envelope_movements_match_transaction', (n) =>
            n.insert(envelopeMovementsTable).values({
              ...base,
              amountCents: -5_001,
              reason: 'spend',
              transactionId: expense.id,
            }),
          )
          await refused(tx, 'envelope_movements_match_transaction', (n) =>
            n.insert(envelopeMovementsTable).values({
              ...base,
              accountId: livret,
              amountCents: -100,
              reason: 'spend',
              transactionId: expense.id,
            }),
          )
          // A split of an incoming saving, at most the saving in all.
          await refused(tx, 'envelope_movements_match_transaction', (n) =>
            n.insert(envelopeMovementsTable).values([
              {
                ...base,
                accountId: livret,
                amountCents: 3_000,
                reason: 'split',
                transactionId: income.id,
              },
              {
                ...base,
                envelopeId: other.id,
                accountId: livret,
                amountCents: 2_001,
                reason: 'split',
                transactionId: income.id,
              },
            ]),
          )
          await refused(tx, 'envelope_movements_match_transaction', (n) =>
            n.insert(envelopeMovementsTable).values({
              ...base,
              amountCents: 100,
              reason: 'split',
              transactionId: expense.id,
            }),
          )
          // Transfer legs: on its two accounts, balanced.
          await refused(tx, 'envelope_movements_transfer_legs', (n) =>
            n.insert(envelopeMovementsTable).values({
              ...base,
              accountId: livret,
              amountCents: -1_000,
              reason: 'transfer',
              transactionId: out.id,
            }),
          )
          await refused(tx, 'envelope_movements_match_transaction', (n) =>
            n.insert(envelopeMovementsTable).values([
              {
                ...base,
                accountId: livret,
                amountCents: -6_000,
                reason: 'transfer',
                transactionId: out.id,
              },
              {
                ...base,
                accountId: checking,
                amountCents: 6_000,
                reason: 'transfer',
                transactionId: out.id,
              },
            ]),
          )
          await tx.insert(envelopeMovementsTable).values([
            {
              ...base,
              accountId: livret,
              amountCents: -1_000,
              reason: 'transfer',
              transactionId: out.id,
            },
            {
              ...base,
              accountId: checking,
              amountCents: 1_000,
              reason: 'transfer',
              transactionId: out.id,
            },
          ])
          await refused(
            tx,
            'envelope_movements_one_envelope_per_attachment',
            (n) =>
              n.insert(envelopeMovementsTable).values([
                {
                  ...base,
                  envelopeId: other.id,
                  accountId: livret,
                  amountCents: -1_000,
                  reason: 'transfer',
                  transactionId: out.id,
                },
                {
                  ...base,
                  envelopeId: other.id,
                  accountId: checking,
                  amountCents: 1_000,
                  reason: 'transfer',
                  transactionId: out.id,
                },
              ]),
          )
          // A leg alone can't be deleted.
          await refused(tx, 'envelope_movements_transfer_legs', (n) =>
            n
              .delete(envelopeMovementsTable)
              .where(eq(envelopeMovementsTable.accountId, checking)),
          )
          // The transaction's new values clear what they forbid.
          await tx
            .update(transactionsTable)
            .set({ amountCents: -500 })
            .where(eq(transactionsTable.id, out.id))
          const left = await tx
            .select()
            .from(envelopeMovementsTable)
            .where(eq(envelopeMovementsTable.transactionId, out.id))
          expect(left).toEqual([])
        })
      })

      it('deleting an account takes both legs of its envelope transfers', async () => {
        await inRollback(async ({ tx, accounts, checking, livret }) => {
          const [env] = await tx
            .insert(envelopesTable)
            .values({ name: 'Un' })
            .returning({ id: envelopesTable.id })
          const [out] = await insert(
            tx,
            row(livret, '2026-11-02', -5_000, 'transfer', {
              counterpartAccountId: checking,
            }),
          )
          await tx.insert(envelopeMovementsTable).values([
            {
              envelopeId: env.id,
              accountId: livret,
              onDate: '2026-11-02',
              amountCents: -1_000,
              reason: 'transfer',
              transactionId: out.id,
            },
            {
              envelopeId: env.id,
              accountId: checking,
              onDate: '2026-11-02',
              amountCents: 1_000,
              reason: 'transfer',
              transactionId: out.id,
            },
          ])
          expect(
            (await accounts.deletionPreview(checking)).envelopeMovements,
          ).toBe(1)
          await accounts.remove(checking)
          expect(
            await tx
              .select()
              .from(envelopeMovementsTable)
              .where(eq(envelopeMovementsTable.envelopeId, env.id)),
          ).toEqual([])
        })
      })
    })
  },
)
