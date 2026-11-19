import '#/load-env'
import {
  BadRequestException,
  ConflictException,
  ValidationPipe,
} from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import { BudgetsService } from '#/budgets/budgets.service'
import { DashboardService } from '#/dashboard/dashboard.service'
import * as schema from '#/database/schema'
import {
  balanceSnapshotsTable,
  categoriesTable,
  type InsertTransaction,
  recurringItemsTable,
  transactionsTable,
} from '#/database/schema'
import { normalizeLabel } from '#/imports/normalize/label'
import { InvestmentsService } from '#/investments/investments.service'
import { RecurringService } from '#/recurring/recurring.service'
import { SavingsService } from '#/savings/savings.service'
import { TransactionsService } from '#/transactions/transactions.service'
import {
  MonthParamDto,
  type MonthReportDto,
  UpdateMonthCloseDto,
} from './dto/month-close.dto'
import { monthClosesTable } from './month-close.schema'
import { MonthCloseService, withIcons } from './month-close.service'

/**
 * Integration checks against the dedicated test database (see
 * `vitest.config.ts`). Every test runs in a transaction that is rolled back.
 * Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

/** 5 November 2026 in Paris: October is over, November is not. */
const NOW = new Date('2026-11-05T10:00:00Z')

describe.skipIf(!process.env.DATABASE_URL)(
  'MonthCloseService (database)',
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
        accounts: AccountsService
        budgets: BudgetsService
        savings: SavingsService
        service: MonthCloseService
      }) => Promise<void>,
    ) {
      await db
        .transaction(async (tx) => {
          const database = { db: tx } as never
          const accounts = new AccountsService(database)
          const budgets = new BudgetsService(database)
          const savings = new SavingsService(
            database,
            accounts,
            new InvestmentsService(database, accounts),
          )
          const service = new MonthCloseService(
            database,
            accounts,
            new DashboardService(
              database,
              accounts,
              new TransactionsService(database),
              budgets,
            ),
            budgets,
            new RecurringService(database),
            savings,
          )
          await fn({ tx, accounts, budgets, savings, service })
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
        bookingDate: '2026-10-01',
        amountCents: -1_000,
        rawLabel: 'PAIEMENT CB 0110 VILLE-TEST FAUX MAGASIN',
        kind: 'expense',
        dedupeHash: `month-close-test-${hash}`,
        ...overrides,
      } satisfies InsertTransaction
    }

    /**
     * A checking account fully imported for October (running balances that
     * follow), a PEA valued at the end of October, one budgeted category.
     */
    async function completeOctober(
      tx: Tx,
      accounts: AccountsService,
      budgets: BudgetsService,
    ) {
      const [groceries] = await tx
        .insert(categoriesTable)
        .values({
          slug: 'test_groceries',
          name: 'Test courses',
          kind: 'expense',
          icon: 'shopping-cart',
        })
        .returning()
      const checking = await accounts.create({
        name: 'Test checking',
        type: 'checking',
      })
      const pea = await accounts.create({ name: 'Test PEA', type: 'brokerage' })
      await tx.insert(transactionsTable).values([
        transaction(checking.id, {
          bookingDate: '2026-09-30',
          amountCents: -1_000,
          balanceAfterCents: 100_000,
          categoryId: groceries.id,
        }),
        transaction(checking.id, {
          bookingDate: '2026-10-01',
          amountCents: 250_000,
          balanceAfterCents: 350_000,
          kind: 'income',
        }),
        transaction(checking.id, {
          bookingDate: '2026-10-05',
          amountCents: -30_000,
          balanceAfterCents: 320_000,
          categoryId: groceries.id,
        }),
        transaction(checking.id, {
          bookingDate: '2026-10-31',
          amountCents: -50_000,
          balanceAfterCents: 270_000,
          kind: 'transfer',
        }),
      ])
      await tx
        .insert(balanceSnapshotsTable)
        .values([
          { accountId: pea.id, date: '2026-10-31', valueCents: 104_000 },
        ])
      await budgets.upsert(groceries.id, '2026-10', {
        monthlyTargetCents: 20_000,
      })
      return { checking, pea, groceries: groceries.id }
    }

    const doneSteps = (dto: { steps: { key: string; done: boolean }[] }) =>
      dto.steps.filter((step) => step.done).map((step) => step.key)

    it('marks the steps done from the data and the ticks', async () => {
      await inRollback(async ({ tx, accounts, budgets, service }) => {
        const { checking, groceries } = await completeOctober(
          tx,
          accounts,
          budgets,
        )

        const review = await service.get('2026-10', { now: NOW })
        expect(review.status).toBe('open')
        expect(review.closable).toBe(true)
        expect(review.steps.map((step) => step.key)).toEqual([
          'imports',
          'review_queue',
          'recurring',
          'budget',
          'savings',
          'investments',
          'close',
        ])
        expect(doneSteps(review)).toEqual([
          'imports',
          'review_queue',
          'recurring',
          'investments',
        ])
        expect(review.imports.accounts).toEqual([
          expect.objectContaining({
            name: 'Test checking',
            lastDate: '2026-10-31',
            upToDate: true,
            missingDays: 0,
          }),
        ])
        expect(review.imports.gaps).toEqual([])
        expect(review.report).toMatchObject({
          month: '2026-10',
          flow: {
            incomeCents: 250_000,
            expenseCents: -30_000,
            netCents: 220_000,
          },
          netWorthCents: 270_000 + 104_000,
        })
        // Transfers are never a category total.
        expect(review.report.categories).toEqual([
          {
            categoryId: groceries,
            name: 'Test courses',
            color: null,
            icon: 'shopping-cart',
            kind: 'expense',
            amountCents: 30_000,
            previousAmountCents: 1_000,
            targetCents: 20_000,
          },
          expect.objectContaining({
            categoryId: null,
            kind: 'income',
            amountCents: 250_000,
          }),
        ])

        // A transaction waiting for review and a suggested recurring item
        // reopen their steps; the ticks close the judgement ones.
        await tx
          .update(transactionsTable)
          .set({ needsReview: true })
          .where(eq(transactionsTable.bookingDate, '2026-10-05'))
        await tx.insert(recurringItemsTable).values({
          accountId: checking.id,
          merchantKey: 'TEST STREAMING',
          direction: 'debit',
          name: 'Test streaming',
          isFixedCost: true,
          cadence: 'monthly',
          amountType: 'fixed',
          typicalAmountCents: 999,
          confidence: 0.9,
          lastSeenDate: '2026-10-15',
        })
        const ticked = await service.update(
          '2026-10',
          { acknowledged: ['budget', 'savings'], notes: '  Mois calme.  ' },
          { now: NOW },
        )
        expect(ticked.notes).toBe('Mois calme.')
        expect(ticked.acknowledged).toEqual(['budget', 'savings'])
        expect(ticked.reviewQueue.count).toBe(1)
        expect(ticked.recurring.suggestedCount).toBe(1)
        expect(doneSteps(ticked)).toEqual([
          'imports',
          'budget',
          'savings',
          'investments',
        ])
      })
    })

    it('lists a cancelled subscription charged after its end date', async () => {
      await inRollback(async ({ tx, accounts, service }) => {
        const checking = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        const label = 'PRLV SEPA STREAMFLIX EXEMPLE'
        // Monthly on the 15th, May to October.
        await tx.insert(transactionsTable).values(
          ['05', '06', '07', '08', '09', '10'].map((month) =>
            transaction(checking.id, {
              bookingDate: `2026-${month}-15`,
              amountCents: -1_299,
              rawLabel: label,
            }),
          ),
        )
        const { merchantKey } = normalizeLabel(label, -1_299)
        const [item] = await tx
          .insert(recurringItemsTable)
          .values({
            accountId: checking.id,
            merchantKey: merchantKey!,
            direction: 'debit',
            name: 'Test streaming',
            status: 'confirmed',
            isFixedCost: true,
            cadence: 'monthly',
            amountType: 'fixed',
            typicalAmountCents: 1_299,
            confidence: 0.9,
            lastSeenDate: '2026-10-15',
            // Cancelled from October 1: the October 15 charge went through.
            endedOn: '2026-10-01',
          })
          .returning()

        const october = await service.get('2026-10', { now: NOW })
        expect(october.recurring.chargedAfterEnd).toEqual([
          {
            id: item.id,
            name: 'Test streaming',
            endedOn: '2026-10-01',
            chargedOn: '2026-10-15',
            amountCents: 1_299,
          },
        ])
        expect(doneSteps(october)).not.toContain('recurring')
        // September's charge came before the end: nothing to flag.
        const september = await service.get('2026-09', { now: NOW })
        expect(september.recurring.chargedAfterEnd).toEqual([])

        // Seen: the tick closes the step.
        const ticked = await service.update(
          '2026-10',
          { acknowledged: ['recurring'] },
          { now: NOW },
        )
        expect(doneSteps(ticked)).toContain('recurring')

        // Cancelled from November: October is a normal month again.
        await tx
          .update(recurringItemsTable)
          .set({ endedOn: '2026-11-01' })
          .where(eq(recurringItemsTable.id, item.id))
        const after = await service.get('2026-10', { now: NOW })
        expect(after.recurring.chargedAfterEnd).toEqual([])
      })
    })

    it('reports missing days, balance gaps and stale investment values', async () => {
      await inRollback(async ({ tx, accounts, service }) => {
        const checking = await accounts.create({
          name: 'Test checking',
          type: 'checking',
        })
        const pea = await accounts.create({
          name: 'Test PEA',
          type: 'brokerage',
        })
        // Entered by hand: no import step for the meal-voucher card (#298).
        const card = await accounts.create({
          name: 'Test titres-restaurant',
          type: 'meal_voucher',
        })
        await tx.insert(transactionsTable).values([
          transaction(card.id, {
            bookingDate: '2026-10-05',
            amountCents: -1_500,
            manual: true,
          }),
          transaction(checking.id, {
            bookingDate: '2026-10-02',
            amountCents: -1_000,
            balanceAfterCents: 99_000,
          }),
          // 5 000 booked between the 2nd and the 9th are missing.
          transaction(checking.id, {
            bookingDate: '2026-10-09',
            amountCents: -2_000,
            balanceAfterCents: 92_000,
          }),
          // Manual expenses are never imported data.
          transaction(checking.id, {
            bookingDate: '2026-10-28',
            amountCents: -3_000,
            manual: true,
          }),
        ])
        await tx
          .insert(balanceSnapshotsTable)
          .values([
            { accountId: pea.id, date: '2026-09-30', valueCents: 100_000 },
          ])

        const review = await service.get('2026-10', { now: NOW })
        expect(review.imports.accounts).toEqual([
          expect.objectContaining({
            lastDate: '2026-10-09',
            upToDate: false,
            missingDays: 22,
          }),
        ])
        expect(review.imports.gaps).toEqual([
          {
            accountId: checking.id,
            accountName: 'Test checking',
            fromDate: '2026-10-02',
            toDate: '2026-10-09',
            differenceCents: -5_000,
          },
        ])
        expect(review.investments.accounts).toEqual([
          expect.objectContaining({ id: pea.id, lastDate: '2026-09-30' }),
        ])
        expect(doneSteps(review)).not.toContain('imports')
        expect(doneSteps(review)).not.toContain('investments')
      })
    })

    it('closes a month with a frozen report and flags later edits', async () => {
      await inRollback(async ({ tx, accounts, budgets, service }) => {
        const { checking, groceries } = await completeOctober(
          tx,
          accounts,
          budgets,
        )
        await service.update('2026-10', { notes: 'Brouillon' }, { now: NOW })

        const closed = await service.close(
          '2026-10',
          { notes: 'Bon mois' },
          { now: NOW },
        )
        expect(closed.status).toBe('closed')
        expect(closed.closedAt).toBe(NOW.toISOString())
        expect(closed.notes).toBe('Bon mois')
        expect(doneSteps(closed)).toContain('close')
        expect(closed.closedReport).toEqual(closed.report)
        expect(closed.closedReport?.notes).toBe('Bon mois')
        expect(closed.changes).toEqual([])

        // An expense filed afterwards changes the live figures, not the
        // frozen report (the net worth still ends on the bank balance).
        await tx.insert(transactionsTable).values(
          transaction(checking.id, {
            bookingDate: '2026-10-20',
            amountCents: -4_000,
            categoryId: groceries,
          }),
        )
        const later = await service.get('2026-10', { now: NOW })
        expect(later.closedReport?.flow.expenseCents).toBe(-30_000)
        expect(later.report.flow.expenseCents).toBe(-34_000)
        expect(later.changes).toEqual([
          expect.objectContaining({
            field: 'expense',
            closedCents: -30_000,
            currentCents: -34_000,
          }),
          expect.objectContaining({
            field: 'net',
            closedCents: 220_000,
            currentCents: 216_000,
          }),
          {
            field: 'category',
            kind: 'expense',
            categoryId: groceries,
            name: 'Test courses',
            closedCents: 30_000,
            currentCents: 34_000,
          },
        ])

        // A closed month refuses edits and a second close.
        await expect(
          service.update('2026-10', { acknowledged: ['budget'] }, { now: NOW }),
        ).rejects.toBeInstanceOf(ConflictException)
        await expect(
          service.close('2026-10', {}, { now: NOW }),
        ).rejects.toBeInstanceOf(ConflictException)
      })
    })

    it('reopens a closed month and keeps its notes', async () => {
      await inRollback(async ({ tx, accounts, budgets, service }) => {
        await completeOctober(tx, accounts, budgets)
        await service.close('2026-10', { notes: 'À revoir' }, { now: NOW })

        const reopened = await service.reopen('2026-10', { now: NOW })
        expect(reopened.status).toBe('open')
        expect(reopened.closedAt).toBeNull()
        expect(reopened.closedReport).toBeNull()
        expect(reopened.changes).toEqual([])
        expect(reopened.notes).toBe('À revoir')
        expect(doneSteps(reopened)).not.toContain('close')

        const [row] = await tx
          .select()
          .from(monthClosesTable)
          .where(eq(monthClosesTable.month, '2026-10'))
        expect(row).toMatchObject({ closedAt: null, report: null })

        await expect(
          service.reopen('2026-10', { now: NOW }),
        ).rejects.toBeInstanceOf(ConflictException)
        // Editable again.
        await service.update(
          '2026-10',
          { acknowledged: ['budget'] },
          { now: NOW },
        )
      })
    })

    it('lists the closed months, oldest first (#342)', async () => {
      await inRollback(async ({ service }) => {
        expect(await service.listClosed()).toEqual({ closed: [] })
        await service.close('2026-10', {}, { now: NOW })
        await service.close('2026-08', {}, { now: NOW })
        // Notes only: not closed.
        await service.update('2026-09', { notes: 'En cours' }, { now: NOW })

        const { closed } = await service.listClosed()
        expect(closed.map((row) => row.month)).toEqual(['2026-08', '2026-10'])
        expect(closed[0].closedAt).toBe(NOW.toISOString())

        await service.reopen('2026-08', { now: NOW })
        expect(
          (await service.listClosed()).closed.map((row) => row.month),
        ).toEqual(['2026-10'])
      })
    })

    it('refuses to close a month that is not over', async () => {
      await inRollback(async ({ service }) => {
        const current = await service.get('2026-11', { now: NOW })
        expect(current.closable).toBe(false)
        await expect(
          service.close('2026-11', {}, { now: NOW }),
        ).rejects.toBeInstanceOf(BadRequestException)
      })
    })
  },
)

describe('month close validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true })

  it('accepts a YYYY-MM month only', async () => {
    await expect(
      pipe.transform(
        { month: '2026-10' },
        { type: 'param', metatype: MonthParamDto },
      ),
    ).resolves.toEqual({ month: '2026-10' })
    await expect(
      pipe.transform(
        { month: '2026-13' },
        { type: 'param', metatype: MonthParamDto },
      ),
    ).rejects.toThrow()
  })

  it('accepts only the steps ticked by hand', async () => {
    const body = (value: unknown) =>
      pipe.transform(value, { type: 'body', metatype: UpdateMonthCloseDto })
    await expect(body({ acknowledged: ['budget'] })).resolves.toEqual({
      acknowledged: ['budget'],
    })
    await expect(body({ acknowledged: ['imports'] })).rejects.toThrow()
    await expect(body({ notes: null })).resolves.toEqual({ notes: null })
  })
})

describe('withIcons', () => {
  const category = {
    categoryId: 'c1',
    name: 'Test courses',
    color: '#16a34a',
    kind: 'expense' as const,
    amountCents: 1_000,
    previousAmountCents: 0,
    targetCents: null,
  }
  const report = (categories: MonthReportDto['categories']) =>
    ({
      month: '2026-10',
      flow: { incomeCents: 0, expenseCents: 0, netCents: 0 },
      netWorthCents: null,
      savingsTargetCents: null,
      categories,
      oneOffs: [],
      notes: null,
    }) as unknown as MonthReportDto

  it('gives a report frozen before icons the current ones', () => {
    const frozen = report([
      category as MonthReportDto['categories'][number],
      {
        ...category,
        categoryId: 'gone',
      } as MonthReportDto['categories'][number],
    ])
    const live = report([{ ...category, icon: 'shopping-cart' }])
    expect(withIcons(frozen, live).categories.map((c) => c.icon)).toEqual([
      'shopping-cart',
      null,
    ])
  })

  it('keeps the icons a report was frozen with', () => {
    const frozen = report([{ ...category, icon: 'utensils' }])
    const live = report([{ ...category, icon: 'shopping-cart' }])
    expect(withIcons(frozen, live)).toBe(frozen)
  })
})
