import '#/load-env'
import { ValidationPipe } from '@nestjs/common'
import { inArray } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import { DashboardService } from '#/dashboard/dashboard.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  balanceSnapshotsTable,
  categoriesTable,
  type InsertTransaction,
  transactionsTable,
} from '#/database/schema'
import { InvestmentsService } from '#/investments/investments.service'
import { BudgetsService } from '#/budgets/budgets.service'
import { TransactionsService } from '#/transactions/transactions.service'
import {
  CreateGoalDto,
  SavingsOverviewQueryDto,
  SavingsTargetDto,
  UpdateGoalDto,
} from './dto/savings.dto'
import { SavingsService } from './savings.service'

/**
 * Integration checks against the dedicated test database (see
 * `vitest.config.ts`). Every test runs in a transaction that is rolled back.
 * Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

/** 6 November 2026, mid-morning in Paris. */
const NOW = new Date('2026-11-06T10:00:00Z')

describe.skipIf(!process.env.DATABASE_URL)('SavingsService (database)', () => {
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
    savings: SavingsService
    dashboard: DashboardService
  }

  async function inRollback(fn: (f: Fixture) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        const database = { db: tx } as never
        const accounts = new AccountsService(database)
        const savings = new SavingsService(
          database,
          accounts,
          new InvestmentsService(database, accounts),
        )
        const dashboard = new DashboardService(
          database,
          accounts,
          new TransactionsService(database),
          new BudgetsService(database),
        )
        await fn({ tx, savings, dashboard })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
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
      dedupeHash: `savings-test-${hash}`,
      ...overrides,
    }
  }

  /** The transfer categories, seeded or not in the test database. */
  async function transferCategories(tx: Tx) {
    const slugs = [
      'savings_transfer',
      'investment_transfer',
      'internal_transfer',
    ]
    await tx
      .insert(categoriesTable)
      .values(
        slugs.map((slug) => ({ slug, name: slug, kind: 'transfer' as const })),
      )
      .onConflictDoNothing()
    const rows = await tx
      .select({ id: categoriesTable.id, slug: categoriesTable.slug })
      .from(categoriesTable)
      .where(inArray(categoriesTable.slug, slugs))
    return new Map(rows.map((r) => [r.slug, r.id]))
  }

  /**
   * Checking + Livret + PEA, August to November 2026, filed as the
   * spreadsheet history import does: moves to the Livret are
   * `internal_transfer` on both sides, PEA contributions `investment_transfer`
   * on checking only (the PEA has snapshots, no rows).
   * - Aug: +3 000 salary, −1 000 rent, 500 to the Livret, 200 to the PEA.
   * - Sep: negative month (−1 500 one-off), 300 withdrawn from the Livret,
   *   100 to another checking account (not counted).
   * - Oct: +1 000 one-off bonus, 600 to the Livret.
   * - Nov (current): +3 000, −500.
   */
  async function seed(tx: Tx) {
    const [checking, livret, pea] = await tx
      .insert(accountsTable)
      .values([
        { name: 'Compte test', type: 'checking', position: 0 },
        { name: 'Livret test', type: 'savings', position: 1 },
        { name: 'PEA test', type: 'brokerage', position: 2 },
      ])
      .returning()
    const cat = await transferCategories(tx)
    const internal = { categoryId: cat.get('internal_transfer')! }
    const investCat = { categoryId: cat.get('investment_transfer')! }
    await tx
      .insert(transactionsTable)
      .values([
        row(checking.id, '2026-08-01', 300_000, 'income'),
        row(checking.id, '2026-08-05', -100_000, 'expense'),
        row(checking.id, '2026-08-10', -50_000, 'transfer', internal),
        row(livret.id, '2026-08-10', 50_000, 'transfer', internal),
        row(checking.id, '2026-08-12', -20_000, 'transfer', investCat),
        row(checking.id, '2026-09-01', 300_000, 'income'),
        row(checking.id, '2026-09-03', -200_000, 'expense'),
        row(checking.id, '2026-09-20', -150_000, 'expense', { isOneOff: true }),
        row(livret.id, '2026-09-25', -30_000, 'transfer', internal),
        row(checking.id, '2026-09-25', 30_000, 'transfer', internal),
        row(checking.id, '2026-09-26', -10_000, 'transfer', internal),
        row(checking.id, '2026-10-01', 300_000, 'income'),
        row(checking.id, '2026-10-15', 100_000, 'income', { isOneOff: true }),
        row(checking.id, '2026-10-20', -120_000, 'expense'),
        row(checking.id, '2026-10-31', -60_000, 'transfer', internal),
        row(livret.id, '2026-10-31', 60_000, 'transfer', internal),
        row(checking.id, '2026-11-01', 300_000, 'income'),
        row(checking.id, '2026-11-02', -50_000, 'expense'),
      ])
    await tx.insert(balanceSnapshotsTable).values([
      {
        accountId: pea.id,
        date: '2026-06-30',
        valueCents: 100_000,
        contributionsCents: 90_000,
      },
      {
        accountId: pea.id,
        date: '2026-10-31',
        valueCents: 130_000,
        contributionsCents: 110_000,
      },
    ])
    return { checking, livret, pea }
  }

  it('computes monthly savings with transfers excluded, as the dashboard', async () => {
    await inRollback(async ({ tx, savings, dashboard }) => {
      await seed(tx)
      const overview = await savings.overview(4, { now: NOW })
      expect(overview.currentMonth).toBe('2026-11')
      expect(overview.months).toEqual([
        {
          month: '2026-08',
          complete: true,
          incomeCents: 300_000,
          expenseCents: -100_000,
          netCents: 200_000,
          savingsRate: 200_000 / 300_000,
          oneOffIncomeCents: 0,
          oneOffExpenseCents: 0,
          oneOffNetCents: 0,
          netExcludingOneOffsCents: 200_000,
          movedToSavingsCents: 50_000,
          movedToInvestmentsCents: 20_000,
          movedCents: 70_000,
          targetGapCents: null,
        },
        expect.objectContaining({
          month: '2026-09',
          netCents: -50_000,
          oneOffNetCents: -150_000,
          netExcludingOneOffsCents: 100_000,
          movedToSavingsCents: -30_000,
          movedToInvestmentsCents: 0,
          movedCents: -30_000,
        }),
        expect.objectContaining({
          month: '2026-10',
          incomeCents: 400_000,
          netCents: 280_000,
          oneOffNetCents: 100_000,
          netExcludingOneOffsCents: 180_000,
          movedCents: 60_000,
        }),
        expect.objectContaining({
          month: '2026-11',
          complete: false,
          netCents: 250_000,
          movedCents: 0,
        }),
      ])

      // Same figures as the dashboard history.
      const history = await dashboard.history(4, { now: NOW })
      expect(
        overview.months.map((m) => [
          m.month,
          m.incomeCents,
          m.expenseCents,
          m.netCents,
        ]),
      ).toEqual(
        history.months.map((m) => [
          m.month,
          m.incomeCents,
          m.expenseCents,
          m.netCents,
        ]),
      )
    })
  })

  it('averages the full months since the first data, one-offs apart', async () => {
    await inRollback(async ({ tx, savings }) => {
      await seed(tx)
      const { averages, projectionAverageCents } = await savings.overview(12, {
        now: NOW,
      })
      expect(averages.map((a) => a.months)).toEqual([3, 6, 12])
      for (const average of averages) {
        expect(average).toMatchObject({
          monthCount: 3,
          from: '2026-08',
          to: '2026-10',
          incomeCents: 333_333,
          netCents: 143_333,
          netExcludingOneOffsCents: 160_000,
          movedCents: 33_333,
          savingsRate: 430_000 / 1_000_000,
        })
      }
      expect(projectionAverageCents).toBe(160_000)
    })
  })

  it('reports the savings stock from savings accounts and investments', async () => {
    await inRollback(async ({ tx, savings }) => {
      const { livret, pea } = await seed(tx)
      const { stock } = await savings.overview(12, { now: NOW })
      expect(stock.cash).toEqual({
        totalCents: 80_000,
        accounts: [
          expect.objectContaining({ id: livret.id, balanceCents: 80_000 }),
        ],
      })
      expect(stock.investments.totals).toMatchObject({
        valueCents: 130_000,
        contributionsCents: 110_000,
        gainCents: 20_000,
      })
      expect(stock.investments.accounts.map((a) => a.id)).toEqual([pea.id])
      expect(stock.totalCents).toBe(210_000)
      expect(stock.gainCents).toBe(20_000)
    })
  })

  it('compares the headline month like for like while it is in progress', async () => {
    await inRollback(async ({ tx, savings }) => {
      await seed(tx)
      // Data up to 2 November: compared with 1–2 October.
      const overview = await savings.overview(4, { now: NOW })
      expect(overview.period).toMatchObject({
        month: '2026-11',
        dataUntil: '2026-11-02',
        status: 'partial',
        throughDay: 2,
        previousUntil: '2026-10-02',
      })
      expect(overview.current).toMatchObject({
        month: '2026-11',
        incomeCents: 300_000,
        expenseCents: -50_000,
        netCents: 250_000,
      })
      expect(overview.previous).toMatchObject({
        month: '2026-10',
        until: '2026-10-02',
        incomeCents: 300_000,
        expenseCents: 0,
        netCents: 300_000,
        savingsRate: 1,
      })
      // Months the data does not reach the end of are not complete.
      expect(overview.months.map((m) => [m.month, m.complete])).toEqual([
        ['2026-08', true],
        ['2026-09', true],
        ['2026-10', true],
        ['2026-11', false],
      ])

      // Early December, nothing imported since: November is shown.
      const december = await savings.overview(4, {
        now: new Date('2026-12-02T08:00:00Z'),
      })
      expect(december.period).toMatchObject({
        month: '2026-11',
        status: 'partial',
        throughDay: 2,
      })
      expect(december.current.netCents).toBe(250_000)
    })
  })

  it('stores the monthly target and reports the gap', async () => {
    await inRollback(async ({ tx, savings }) => {
      await seed(tx)
      expect(await savings.readTarget(tx)).toBeNull()
      await savings.setTarget(100_000, tx)
      await savings.setTarget(86_000, tx)
      const overview = await savings.overview(4, { now: NOW })
      expect(overview.monthlyTargetCents).toBe(86_000)
      expect(overview.months.map((m) => m.targetGapCents)).toEqual([
        114_000, -136_000, 194_000, 164_000,
      ])
      await savings.setTarget(null, tx)
      expect(await savings.readTarget(tx)).toBeNull()
    })
  })

  it('counts a move recorded on both accounts once, whatever its category', async () => {
    await inRollback(async ({ tx, savings }) => {
      const [checking, livret, livretJeune] = await tx
        .insert(accountsTable)
        .values([
          { name: 'Compte test', type: 'checking' },
          { name: 'Livret test', type: 'savings' },
          { name: 'Livret jeune test', type: 'savings' },
        ])
        .returning()
      const cat = await transferCategories(tx)
      const savingsCat = { categoryId: cat.get('savings_transfer')! }
      const internal = { categoryId: cat.get('internal_transfer')! }
      await tx.insert(transactionsTable).values([
        // Filed `savings_transfer` on both sides: only the Livret side counts.
        row(checking.id, '2026-10-05', -40_000, 'transfer', savingsCat),
        row(livret.id, '2026-10-05', 40_000, 'transfer', savingsCat),
        // Livret → Livret jeune: nets to zero.
        row(livret.id, '2026-10-06', -10_000, 'transfer', internal),
        row(livretJeune.id, '2026-10-06', 10_000, 'transfer', internal),
        // Uncategorized deposit on the Livret jeune still counts.
        row(livretJeune.id, '2026-10-07', 5_000, 'transfer'),
      ])
      const { months } = await savings.overview(2, { now: NOW })
      expect(months[0]).toMatchObject({
        month: '2026-10',
        movedToSavingsCents: 45_000,
        movedToInvestmentsCents: 0,
        movedCents: 45_000,
      })
    })
  })

  it('falls back to checking-side savings transfers when no savings account has rows', async () => {
    await inRollback(async ({ tx, savings }) => {
      const [checking] = await tx
        .insert(accountsTable)
        .values([
          { name: 'Compte test', type: 'checking' },
          { name: 'Livret test', type: 'savings' },
        ])
        .returning()
      const cat = await transferCategories(tx)
      await tx.insert(transactionsTable).values([
        row(checking.id, '2026-10-05', -40_000, 'transfer', {
          categoryId: cat.get('savings_transfer')!,
        }),
        row(checking.id, '2026-10-06', -15_000, 'transfer', {
          categoryId: cat.get('investment_transfer')!,
        }),
        row(checking.id, '2026-10-07', -9_000, 'transfer', {
          categoryId: cat.get('internal_transfer')!,
        }),
      ])
      const { months } = await savings.overview(2, { now: NOW })
      expect(months[0]).toMatchObject({
        movedToSavingsCents: 40_000,
        movedToInvestmentsCents: 15_000,
        movedCents: 55_000,
      })
    })
  })

  it('measures goals on linked accounts and projects them', async () => {
    await inRollback(async ({ tx, savings }) => {
      const { livret, pea } = await seed(tx)
      const options = { now: NOW, executor: tx }
      const onAccounts = await savings.createGoal(
        {
          name: 'Fonds de secours',
          targetCents: 400_000,
          targetDate: '2027-03-31',
          accountIds: [livret.id, pea.id],
        },
        options,
      )
      expect(onAccounts).toMatchObject({
        source: 'accounts',
        accountIds: [livret.id, pea.id],
        manualAmountCents: null,
        archived: false,
        currentCents: 210_000,
        remainingCents: 190_000,
        monthsLeft: 5,
        requiredMonthlyCents: 38_000,
        targetDatePassed: false,
        projection: {
          averageMonthlyCents: 160_000,
          reachable: true,
          monthsNeeded: 2,
          projectedDate: '2026-12-31',
          onTrack: true,
        },
      })

      const late = await savings.createGoal(
        {
          name: 'Voyage',
          targetCents: 1_000_000,
          targetDate: '2026-10-31',
          source: 'manual',
          manualAmountCents: 40_000,
        },
        options,
      )
      expect(late).toMatchObject({
        currentCents: 40_000,
        accountIds: [],
        targetDatePassed: true,
        monthsLeft: 0,
        requiredMonthlyCents: null,
        projection: {
          reachable: true,
          monthsNeeded: 6,
          projectedDate: '2027-04-30',
          onTrack: false,
        },
      })

      // Archive, then list.
      await savings.updateGoal(late.id, { archived: true }, options)
      expect((await savings.listGoals({}, options)).map((g) => g.id)).toEqual([
        onAccounts.id,
      ])
      const all = await savings.listGoals({ includeArchived: true }, options)
      expect(all.map((g) => [g.id, g.archived])).toEqual([
        [onAccounts.id, false],
        [late.id, true],
      ])

      // Switch to a manual amount, then back to one account.
      const manual = await savings.updateGoal(
        onAccounts.id,
        { source: 'manual', manualAmountCents: 10_000, name: 'Renommé' },
        options,
      )
      expect(manual).toMatchObject({
        name: 'Renommé',
        source: 'manual',
        currentCents: 10_000,
        targetDate: '2027-03-31',
      })
      const back = await savings.updateGoal(
        onAccounts.id,
        { source: 'accounts', accountIds: [pea.id], targetDate: null },
        options,
      )
      expect(back).toMatchObject({
        accountIds: [pea.id],
        manualAmountCents: null,
        currentCents: 130_000,
        monthsLeft: null,
        requiredMonthlyCents: null,
      })

      await savings.removeGoal(late.id, tx)
      await expect(savings.removeGoal(late.id, tx)).rejects.toMatchObject({
        status: 404,
      })
    })
  })

  it('rejects goals without accounts or with unknown ones', async () => {
    await inRollback(async ({ tx, savings }) => {
      const options = { now: NOW, executor: tx }
      await expect(
        savings.createGoal({ name: 'X', targetCents: 100 }, options),
      ).rejects.toMatchObject({ status: 400 })
      await expect(
        savings.createGoal(
          {
            name: 'X',
            targetCents: 100,
            accountIds: ['00000000-0000-4000-8000-000000000000'],
          },
          options,
        ),
      ).rejects.toMatchObject({ status: 400 })
      await expect(
        savings.updateGoal(
          '00000000-0000-4000-8000-000000000000',
          { name: 'Y' },
          options,
        ),
      ).rejects.toMatchObject({ status: 404 })
    })
  })

  it('cannot project without positive savings', async () => {
    await inRollback(async ({ tx, savings }) => {
      const [checking] = await tx
        .insert(accountsTable)
        .values({ name: 'Compte test', type: 'checking' })
        .returning()
      const options = { now: NOW, executor: tx }
      const goal = {
        name: 'Projet',
        targetCents: 100_000,
        source: 'manual' as const,
      }

      // No history at all: no average.
      expect(
        (await savings.createGoal(goal, options)).projection,
      ).toMatchObject({
        averageMonthlyCents: null,
        reachable: false,
        projectedDate: null,
      })

      // Spending more than earning: negative average.
      await tx
        .insert(transactionsTable)
        .values([
          row(checking.id, '2026-10-01', 100_000, 'income'),
          row(checking.id, '2026-10-02', -150_000, 'expense'),
        ])
      const negative = await savings.createGoal(
        { ...goal, targetDate: '2027-01-31' },
        options,
      )
      expect(negative).toMatchObject({
        requiredMonthlyCents: 33_334,
        projection: {
          averageMonthlyCents: -50_000,
          reachable: false,
          onTrack: false,
        },
      })
    })
  })
})

describe('Savings DTO validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  })

  function validate<T>(
    metatype: new () => T,
    value: unknown,
    type: 'query' | 'body' = 'body',
  ) {
    return pipe.transform(value, { type, metatype }) as Promise<T>
  }

  it('bounds the number of months', async () => {
    await expect(
      validate(SavingsOverviewQueryDto, { months: '24' }, 'query'),
    ).resolves.toEqual({ months: 24 })
    for (const months of ['0', '61', 'x']) {
      await expect(
        validate(SavingsOverviewQueryDto, { months }, 'query'),
      ).rejects.toThrow()
    }
  })

  it('accepts a positive integer target or null', async () => {
    await expect(
      validate(SavingsTargetDto, { monthlyTargetCents: 86_000 }),
    ).resolves.toEqual({ monthlyTargetCents: 86_000 })
    await expect(
      validate(SavingsTargetDto, { monthlyTargetCents: null }),
    ).resolves.toEqual({ monthlyTargetCents: null })
    for (const monthlyTargetCents of [0, -1, 1.5, '100', undefined]) {
      await expect(
        validate(SavingsTargetDto, { monthlyTargetCents }),
      ).rejects.toThrow()
    }
  })

  it('validates goals', async () => {
    await expect(
      validate(CreateGoalDto, {
        name: '  Voyage  ',
        targetCents: 150_000,
        targetDate: '2027-06-30',
        accountIds: ['00000000-0000-4000-8000-000000000001'],
        color: '#0284c7',
      }),
    ).resolves.toMatchObject({ name: 'Voyage' })
    for (const body of [
      { name: '', targetCents: 100 },
      { name: 'X', targetCents: 0 },
      { name: 'X', targetCents: 100, targetDate: '2027-02-30' },
      { name: 'X', targetCents: 100, source: 'other' },
      { name: 'X', targetCents: 100, accountIds: ['nope'] },
      { name: 'X', targetCents: 100, color: 'red' },
      { name: 'X', targetCents: 100, manualAmountCents: -1 },
    ]) {
      await expect(validate(CreateGoalDto, body)).rejects.toThrow()
    }
    await expect(validate(UpdateGoalDto, { archived: true })).resolves.toEqual({
      archived: true,
    })
    await expect(
      validate(UpdateGoalDto, { targetDate: null }),
    ).resolves.toEqual({ targetDate: null })
  })
})
