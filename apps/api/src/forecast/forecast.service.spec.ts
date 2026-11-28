import { asSpecOwner } from '#/database/testing/spec-owner'
import '#/load-env'
import { eq } from 'drizzle-orm'
import { BadRequestException } from '@nestjs/common'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  importsTable,
  type InsertRecurringItem,
  type InsertTransaction,
  recurringItemsTable,
  transactionsTable,
} from '#/database/schema'
import { normalizeLabel } from '#/imports/normalize/label'
import { addMonths } from '#/recurring/dates'
import { RecurringService } from '#/recurring/recurring.service'
import { ForecastService } from './forecast.service'
import { bankRows } from '#/transactions/testing/bank-rows'

/**
 * Integration checks against the migrated test database. Each test runs in a
 * transaction that is rolled back, starting without accounts, transactions or
 * recurring items. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
/** 12:00 in Paris on October 15, 2026. */
const OCTOBER_15 = new Date('2026-10-15T10:00:00Z')
/** 12:00 in Paris on November 16, 2026. */
const NOVEMBER_16 = new Date('2026-11-16T11:00:00Z')

const RENT = 'PRLV SEPA SOCIETE IMMO EXEMPLE'
const STREAMING = 'PRLV SEPA STREAMFLIX EXEMPLE'
const SALARY = 'VIR SEPA EMPLOYEUR EXEMPLE SALAIRE'

describe.skipIf(!process.env.DATABASE_URL)('ForecastService (database)', () => {
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
    service: ForecastService
    checking: string
    savings: string
    insert: (rows: Partial<InsertTransaction>[]) => Promise<void>
    confirm: (
      rawLabel: string,
      amountCents: number,
      item: Partial<InsertRecurringItem>,
    ) => Promise<void>
  }

  let sequence = 0

  async function withFixture(fn: (f: Fixture) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await asSpecOwner(tx)
        await tx.delete(recurringItemsTable)
        await tx.delete(transactionsTable)
        await tx.delete(importsTable)
        await tx.delete(accountsTable)
        const [checking, savings] = await tx
          .insert(accountsTable)
          .values([
            { name: 'Test courant', type: 'checking' },
            { name: 'Test livret', type: 'savings' },
          ])
          .returning()
        const insert = async (rows: Partial<InsertTransaction>[]) => {
          await tx.insert(transactionsTable).values(
            await bankRows(
              tx,
              rows.map((row) => ({
                accountId: checking.id,
                bookingDate: '2026-01-01',
                amountCents: -100,
                rawLabel: 'CB DIVERS',
                kind: 'expense' as const,
                dedupeHash: `forecast-spec-${++sequence}`,
                ...row,
              })),
            ),
          )
        }
        const confirm: Fixture['confirm'] = async (
          rawLabel,
          amountCents,
          item,
        ) => {
          const { merchantKey } = normalizeLabel(rawLabel, amountCents)
          await tx.insert(recurringItemsTable).values({
            accountId: checking.id,
            merchantKey: merchantKey!,
            direction: amountCents < 0 ? 'debit' : 'credit',
            name: rawLabel,
            status: 'confirmed',
            isFixedCost: amountCents < 0,
            cadence: 'monthly',
            amountType: 'fixed',
            typicalAmountCents: Math.abs(amountCents),
            confidence: 0.9,
            lastSeenDate: '2026-01-01',
            ...item,
          })
        }
        const database = { db: tx } as never
        const recurring = new RecurringService(database)
        await fn({
          tx,
          service: new ForecastService(
            database,
            new AccountsService(database),
            recurring,
          ),
          checking: checking.id,
          savings: savings.id,
          insert,
          confirm,
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
    day?: number,
  ): Partial<InsertTransaction>[] {
    return Array.from({ length: count }, (_, i) => ({
      ...row,
      bookingDate: addMonths(last, i - count + 1, day),
    }))
  }

  /**
   * Six months of a synthetic household up to October 12, 2026: rent on the
   * 2nd, streaming on the 20th, salary on the last day, groceries four times
   * a month, a monthly transfer to savings and a one-off purchase.
   */
  async function seedHousehold(f: Fixture) {
    const groceries: Partial<InsertTransaction>[] = []
    for (const month of ['07', '08', '09']) {
      for (const day of ['05', '12', '19', '26']) {
        groceries.push({
          bookingDate: `2026-${month}-${day}`,
          rawLabel: `CB MARCHE ${month}${day}`,
          amountCents: -6_900,
        })
      }
    }
    await f.insert([
      {
        bookingDate: '2026-04-01',
        rawLabel: 'VIR SOLDE INITIAL',
        amountCents: 300_000,
        kind: 'income',
        isOneOff: true,
      },
      ...monthly('2026-10-02', 7, { rawLabel: RENT, amountCents: -80_000 }),
      ...monthly('2026-09-20', 6, { rawLabel: STREAMING, amountCents: -1_399 }),
      // On the last day of each month.
      ...monthly(
        '2026-09-30',
        6,
        { rawLabel: SALARY, amountCents: 250_000, kind: 'income' },
        31,
      ),
      ...groceries,
      // A refund nets out of the spending.
      {
        bookingDate: '2026-08-14',
        rawLabel: 'CB MARCHE REMBOURSEMENT',
        amountCents: 1_000,
      },
      // Transfers and one-offs never count in the estimate.
      ...monthly('2026-09-03', 3, {
        rawLabel: 'VIR LIVRET A',
        amountCents: -20_000,
        kind: 'transfer',
      }),
      {
        bookingDate: '2026-08-21',
        rawLabel: 'CB MEUBLES EXEMPLE',
        amountCents: -90_000,
        isOneOff: true,
      },
      {
        bookingDate: '2026-10-05',
        rawLabel: 'CB MARCHE 1005',
        amountCents: -6_900,
      },
      {
        bookingDate: '2026-10-12',
        rawLabel: 'CB MARCHE 1012',
        amountCents: -6_900,
      },
    ])
    await f.confirm(RENT, -80_000, {})
    await f.confirm(STREAMING, -1_399, { isFixedCost: false })
    await f.confirm(SALARY, 250_000, {})
  }

  /** The household only has checking rows without running balances. */
  async function sumOfAmounts(tx: Tx): Promise<number> {
    const rows = await tx
      .select({ amountCents: transactionsTable.amountCents })
      .from(transactionsTable)
    return rows.reduce((sum, row) => sum + row.amountCents, 0)
  }

  it('projects the household until month end', () =>
    withFixture(async (f) => {
      await seedHousehold(f)
      const start = await sumOfAmounts(f.tx)
      const forecast = await f.service.forecast({}, OCTOBER_15)

      expect(forecast.today).toBe('2026-10-15')
      expect(forecast.monthEnd).toBe('2026-10-31')
      expect(forecast.accounts.map((a) => a.id)).toEqual([f.checking])
      expect(forecast.startingBalanceCents).toBe(start)
      expect(forecast.startingBalanceDate).toBe('2026-10-12')
      // Three days of lag: projected from the day after the data, not stale.
      expect(forecast.knownUntil).toBe('2026-10-12')
      expect(forecast.projectedFrom).toBe('2026-10-13')
      expect(forecast.stale).toBe(false)
      expect(forecast.staleAfterDays).toBe(7)
      expect(forecast.recurringItemCount).toBe(3)
      // Rent is booked for October; streaming and salary are still due.
      expect(
        forecast.items.map((i) => [i.name, i.date, i.amountCents]),
      ).toEqual([
        [STREAMING, '2026-10-20', -1_399],
        [SALARY, '2026-10-31', 250_000],
      ])
      expect(forecast.expectedDebitsCents).toBe(-1_399)
      expect(forecast.expectedCreditsCents).toBe(250_000)

      // July–September: 12 × 69 € of groceries − a 10 € refund over 92 days.
      expect(forecast.estimate).toEqual({
        dailyCents: Math.round((12 * 6_900 - 1_000) / 92),
        basedOnFrom: '2026-07-01',
        basedOnTo: '2026-09-30',
        // October 13 to 31, each on its own day.
        days: 19,
        coveredCents: 0,
        totalCents: -889 * 19,
      })

      expect(forecast.points).toHaveLength(19)
      expect(forecast.points[0]).toMatchObject({
        date: '2026-10-13',
        balanceCents: start - 889,
        estimateCents: -889,
      })
      expect(forecast.endBalanceCents).toBe(start - 1_399 + 250_000 - 889 * 19)
      expect(forecast.lowest).toEqual({
        date: '2026-10-30',
        balanceCents: start - 1_399 - 889 * 18,
      })
      expect(forecast.belowThreshold).toBeNull()
    }))

  it('stops a cancelled subscription at its end date', () =>
    withFixture(async (f) => {
      await seedHousehold(f)
      const names = async () =>
        (await f.service.forecast({}, OCTOBER_15)).items.map((i) => i.name)
      const cancel = (endedOn: string | null) =>
        f.tx
          .update(recurringItemsTable)
          .set({ endedOn })
          .where(eq(recurringItemsTable.name, STREAMING))

      // Ends after its October 20 charge: still projected.
      await cancel('2026-10-21')
      expect(await names()).toEqual([STREAMING, SALARY])
      // Ends on the 20th itself (future): no charge expected from then.
      await cancel('2026-10-20')
      expect(await names()).toEqual([SALARY])
      const future = await f.service.forecast({}, OCTOBER_15)
      expect(future.recurringItemCount).toBe(3)
      expect(future.expectedDebitsCents).toBe(0)
      // Already ended: out of the forecast and of the count.
      await cancel('2026-10-01')
      const past = await f.service.forecast({}, OCTOBER_15)
      expect(past.items.map((i) => i.name)).toEqual([SALARY])
      expect(past.recurringItemCount).toBe(2)
    }))

  it('reports the first day under the threshold', () =>
    withFixture(async (f) => {
      await seedHousehold(f)
      const start = await sumOfAmounts(f.tx)
      const forecast = await f.service.forecast(
        { thresholdCents: start - 1_399 + 1, includeVariable: false },
        OCTOBER_15,
      )
      expect(forecast.estimate).toBeNull()
      expect(forecast.points[0].estimateCents).toBe(0)
      expect(forecast.endBalanceCents).toBe(start - 1_399 + 250_000)
      expect(forecast.belowThreshold).toEqual({
        date: '2026-10-20',
        balanceCents: start - 1_399,
      })
    }))

  it('reads today in Europe/Paris around midnight on the last day', () =>
    withFixture(async (f) => {
      await seedHousehold(f)
      // Data up to the last day: a single point.
      await f.insert([
        { bookingDate: '2026-10-31', rawLabel: 'CB MARCHE 1031' },
      ])
      // 23:30 in Paris (UTC+1): still October 31.
      const lastDay = await f.service.forecast(
        {},
        new Date('2026-10-31T22:30:00Z'),
      )
      expect(lastDay.today).toBe('2026-10-31')
      expect(lastDay.points.map((p) => p.date)).toEqual(['2026-10-31'])
      // 23:30 UTC is already November 1 in Paris: the November forecast.
      const next = await f.service.forecast(
        {},
        new Date('2026-10-31T23:30:00Z'),
      )
      expect(next.today).toBe('2026-11-01')
      expect(next.monthEnd).toBe('2026-11-30')
      expect(next.projectedFrom).toBe('2026-11-01')
      expect(next.points).toHaveLength(30)
      expect(next.estimate?.basedOnFrom).toBe('2026-08-01')
      expect(next.estimate?.basedOnTo).toBe('2026-10-31')
    }))

  it('forecasts the balance alone without confirmed recurring items', () =>
    withFixture(async (f) => {
      await f.insert([
        { bookingDate: '2026-09-10', amountCents: 100_000, kind: 'income' },
        { bookingDate: '2026-09-15', amountCents: -3_000 },
        // A suggested item is not projected.
        { bookingDate: '2026-10-02', rawLabel: RENT, amountCents: -80_000 },
      ])
      await f.confirm(RENT, -80_000, { status: 'suggested' })
      const forecast = await f.service.forecast({}, OCTOBER_15)
      expect(forecast.recurringItemCount).toBe(0)
      expect(forecast.items).toEqual([])
      expect(forecast.startingBalanceCents).toBe(17_000)
      // History starts on September 10: 30 € over 21 days.
      expect(forecast.estimate).toMatchObject({
        dailyCents: Math.round(3_000 / 21),
        basedOnFrom: '2026-09-10',
      })
    }))

  it('handles an empty database', () =>
    withFixture(async (f) => {
      await f.tx.delete(accountsTable)
      const forecast = await f.service.forecast({}, OCTOBER_15)
      expect(forecast).toMatchObject({
        accounts: [],
        startingBalanceCents: 0,
        startingBalanceDate: null,
        recurringItemCount: 0,
        items: [],
        estimate: null,
        endBalanceCents: 0,
        belowThreshold: null,
      })
      expect(forecast.points).toHaveLength(17)
    }))

  it('accepts savings accounts and rejects unknown, investment or meal-voucher ones', () =>
    withFixture(async (f) => {
      await f.insert([
        {
          accountId: f.savings,
          bookingDate: '2026-10-01',
          amountCents: 5_000,
          kind: 'transfer',
        },
      ])
      const savings = await f.service.forecast(
        { accountIds: [f.savings] },
        OCTOBER_15,
      )
      expect(savings.startingBalanceCents).toBe(5_000)
      expect(savings.estimate).toBeNull()

      const [brokerage, card] = await f.tx
        .insert(accountsTable)
        .values([
          { name: 'Test PEA', type: 'brokerage' },
          { name: 'Test titres-restaurant', type: 'meal_voucher' },
        ])
        .returning()
      // The meal-voucher card is never part of the bank forecast (#298).
      await f.insert([
        {
          accountId: card.id,
          bookingDate: '2026-10-02',
          amountCents: 18_000,
          kind: 'income',
          manual: true,
        },
      ])
      const byDefault = await f.service.forecast({}, OCTOBER_15)
      expect(byDefault.accounts.map((a) => a.id)).not.toContain(card.id)
      for (const accountIds of [
        [brokerage.id],
        [card.id],
        ['00000000-0000-4000-8000-000000000000'],
      ]) {
        await expect(
          f.service.forecast({ accountIds }, OCTOBER_15),
        ).rejects.toBeInstanceOf(BadRequestException)
      }
    }))

  it('projects from the end of the imported data, without a false alarm, when it lags (#215)', () =>
    withFixture(async (f) => {
      // Data up to October 12, today November 16: 35 days behind.
      await seedHousehold(f)
      const start = await sumOfAmounts(f.tx)
      const forecast = await f.service.forecast(
        { thresholdCents: start },
        NOVEMBER_16,
      )
      expect(forecast).toMatchObject({
        today: '2026-11-16',
        monthEnd: '2026-11-30',
        knownUntil: '2026-10-12',
        projectedFrom: '2026-10-13',
        stale: true,
        startingBalanceCents: start,
      })
      // Every item not imported yet stays on its own date.
      expect(forecast.items.map((i) => [i.name, i.date])).toEqual([
        [STREAMING, '2026-10-20'],
        [SALARY, '2026-10-31'],
        [RENT, '2026-11-02'],
        [STREAMING, '2026-11-20'],
        [SALARY, '2026-11-30'],
      ])
      // August–October: 10 × 69 € of groceries − a 10 € refund over 92 days.
      const daily = Math.round((10 * 6_900 - 1_000) / 92)
      expect(forecast.estimate).toMatchObject({
        dailyCents: daily,
        // October 13 to November 30, one day at a time.
        days: 49,
        coveredCents: 0,
        totalCents: -daily * 49,
      })
      expect(forecast.points).toHaveLength(49)
      expect(forecast.points[0]).toMatchObject({
        date: '2026-10-13',
        estimateCents: -daily,
      })
      expect(forecast.endBalanceCents).toBe(
        start - 80_000 + 2 * (250_000 - 1_399) - daily * 49,
      )
      // The projection goes under the threshold, but the data is too old
      // to raise the alert.
      expect(forecast.lowest.balanceCents).toBeLessThan(start)
      expect(forecast.belowThreshold).toBeNull()

      // The same lag on fresh data does raise it.
      const fresh = await f.service.forecast(
        { thresholdCents: start },
        OCTOBER_15,
      )
      expect(fresh.stale).toBe(false)
      expect(fresh.belowThreshold).not.toBeNull()
    }))

  it('knows the data up to the end of the latest committed statement', () =>
    withFixture(async (f) => {
      await seedHousehold(f)
      // The statement ends on October 14, after its last row (October 12).
      await f.tx.insert(importsTable).values({
        accountId: f.checking,
        source: 'cic_csv',
        fileName: 'releve-exemple.csv',
        fileHash: 'f'.repeat(64),
        periodStart: '2026-10-01',
        periodEnd: '2026-10-14',
        committedAt: new Date('2026-10-14T18:00:00Z'),
      })
      const forecast = await f.service.forecast({}, OCTOBER_15)
      expect(forecast.knownUntil).toBe('2026-10-14')
      expect(forecast.projectedFrom).toBe('2026-10-15')
      expect(forecast.estimate).toMatchObject({ days: 17 })
      expect(forecast.points[0].date).toBe('2026-10-15')
    }))

  it('counts expenses entered by hand since the data instead of the estimate', () =>
    withFixture(async (f) => {
      await seedHousehold(f)
      await f.insert([
        // Day-to-day spending noted on October 13 and 14.
        {
          bookingDate: '2026-10-13',
          rawLabel: 'Boulangerie',
          amountCents: -1_500,
          manual: true,
          dedupeHash: 'manual:forecast-spec-1',
        },
        {
          bookingDate: '2026-10-14',
          rawLabel: 'Marché',
          amountCents: -500,
          manual: true,
          dedupeHash: 'manual:forecast-spec-2',
        },
        // A one-off is in the balance but never replaces the estimate.
        {
          bookingDate: '2026-10-14',
          rawLabel: 'Vélo',
          amountCents: -10_000,
          isOneOff: true,
          manual: true,
          dedupeHash: 'manual:forecast-spec-3',
        },
      ])
      const start = await sumOfAmounts(f.tx)
      const forecast = await f.service.forecast({}, OCTOBER_15)

      // Manual rows are in the balance but never move the known date.
      expect(forecast.startingBalanceCents).toBe(start)
      expect(forecast.knownUntil).toBe('2026-10-12')
      expect(forecast.projectedFrom).toBe('2026-10-13')
      // 20 € noted: the estimate of October 13 and 14 (2 × 8.89 €) and
      // 2.22 € of October 15 are already spent.
      expect(forecast.estimate).toMatchObject({
        dailyCents: 889,
        days: 19,
        coveredCents: 2_000,
        totalCents: -(889 * 19 - 2_000),
      })
      expect(forecast.points.slice(0, 4).map((p) => p.estimateCents)).toEqual([
        0,
        0,
        -(889 * 3 - 2_000),
        -889,
      ])
      expect(forecast.endBalanceCents).toBe(
        start - 1_399 + 250_000 - (889 * 19 - 2_000),
      )
    }))
})
