import '#/load-env'
import { BadRequestException } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AccountsService } from '#/accounts/accounts.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  balanceSnapshotsTable,
  positionLinesTable,
  positionStatementsTable,
  securitiesTable,
} from '#/database/schema'
import type { AccountType } from '#/database/schema/domain-enums'
import { InvestmentsService } from '#/investments/investments.service'
import type { PutStatementDto } from './dto/positions.dto'
import { PositionsService } from './positions.service'

/**
 * A PEA's lines against the test database (ADR 0006, #413): the database
 * rules, the statements, the computed values and the invested fallback.
 * Synthetic securities (`ZZ…` ISINs) and amounts only; every test runs in a
 * transaction that is rolled back.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')
/** 5 November 2026, mid-morning in Paris. */
const NOW = new Date('2026-11-05T10:00:00Z')

const WORLD = 'ZZ00MSCIWD03'
const EMERGING = 'ZZ00EMMKT008'

const october: PutStatementDto = {
  cashCents: 10_000,
  lines: [
    {
      isin: WORLD,
      name: 'ETF Monde fictif',
      quantity: '10',
      unitCostEur: '100',
      priceEur: '110.5',
    },
    {
      isin: EMERGING,
      name: 'ETF Émergents fictif',
      quantity: '3.5',
      unitCostEur: '20',
      priceEur: '21.005',
    },
  ],
}

describe.skipIf(!process.env.DATABASE_URL)('positions (database)', () => {
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
    positions: PositionsService
    investments: InvestmentsService
    account: (type?: AccountType) => Promise<string>
    values: (
      accountId: string,
    ) => Promise<{ date: string; valueCents: number; source: string }[]>
  }

  async function inRollback(fn: (f: Fixture) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        const database = { db: tx } as never
        const accounts = new AccountsService(database)
        await fn({
          tx,
          positions: new PositionsService(database, accounts),
          investments: new InvestmentsService(database, accounts),
          account: async (type = 'brokerage') => {
            const [created] = await tx
              .insert(accountsTable)
              .values({ name: 'PEA fictif', type })
              .returning({ id: accountsTable.id })
            return created.id
          },
          values: (accountId) =>
            tx
              .select({
                date: balanceSnapshotsTable.date,
                valueCents: balanceSnapshotsTable.valueCents,
                source: balanceSnapshotsTable.source,
              })
              .from(balanceSnapshotsTable)
              .where(eq(balanceSnapshotsTable.accountId, accountId))
              .orderBy(asc(balanceSnapshotsTable.date)),
        })
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

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

  describe('database rules', () => {
    it('refuses an ISIN with a wrong check digit or format', async () => {
      await inRollback(async ({ tx }) => {
        await refused(tx, 'securities_isin_valid', (nested) =>
          nested
            .insert(securitiesTable)
            .values({ isin: 'ZZ00MSCIWD04', name: 'Faux' }),
        )
        await refused(tx, 'securities_isin_valid', (nested) =>
          nested
            .insert(securitiesTable)
            .values({ isin: 'zz00msciwd03', name: 'Faux' }),
        )
        await tx.insert(securitiesTable).values({ isin: WORLD, name: 'Vrai' })
      })
    })

    it('keeps positions on a PEA, quantities positive, cash not negative', async () => {
      await inRollback(async ({ tx, account }) => {
        const checking = await account('checking')
        await refused(tx, 'position_statements_account_type', (nested) =>
          nested.insert(positionStatementsTable).values({
            accountId: checking,
            asOf: '2026-10-31',
            source: 'typed',
          }),
        )
        const pea = await account()
        await refused(tx, 'position_statements_cash_non_negative', (nested) =>
          nested.insert(positionStatementsTable).values({
            accountId: pea,
            asOf: '2026-10-31',
            source: 'typed',
            cashCents: -1,
          }),
        )
        const [statement] = await tx
          .insert(positionStatementsTable)
          .values({ accountId: pea, asOf: '2026-10-31', source: 'typed' })
          .returning()
        const [security] = await tx
          .insert(securitiesTable)
          .values({ isin: WORLD, name: 'ETF fictif' })
          .returning()
        await refused(tx, 'position_lines_quantity_positive', (nested) =>
          nested.insert(positionLinesTable).values({
            statementId: statement.id,
            securityId: security.id,
            quantity: '0',
          }),
        )
      })
    })

    it('allows a computed value on a PEA only from its first statement', async () => {
      await inRollback(async ({ tx, account }) => {
        const pea = await account()
        await refused(tx, 'balance_snapshots_source_by_type', (nested) =>
          nested.insert(balanceSnapshotsTable).values({
            accountId: pea,
            date: '2026-10-31',
            valueCents: 1,
            source: 'computed',
          }),
        )
        await tx
          .insert(positionStatementsTable)
          .values({ accountId: pea, asOf: '2026-10-31', source: 'typed' })
        await refused(tx, 'balance_snapshots_source_by_type', (nested) =>
          nested.insert(balanceSnapshotsTable).values({
            accountId: pea,
            date: '2026-10-30',
            valueCents: 1,
            source: 'computed',
          }),
        )
        await tx.insert(balanceSnapshotsTable).values({
          accountId: pea,
          date: '2026-10-31',
          valueCents: 1,
          source: 'computed',
        })
      })
    })

    it('keeps an opening date on investment accounts that take a base', async () => {
      await inRollback(async ({ tx }) => {
        await refused(tx, 'accounts_opened_on_type', (nested) =>
          nested
            .insert(accountsTable)
            .values({
              name: 'Livret fictif',
              type: 'savings',
              openedOn: '2022-03-12',
            }),
        )
      })
    })
  })

  describe('statements and values', () => {
    it('values a statement exactly and writes one computed value for its day', async () => {
      await inRollback(async ({ positions, account, values }) => {
        const pea = await account()
        const dto = await positions.putStatement(
          pea,
          '2026-10-31',
          october,
          'mcp',
          NOW,
        )
        // 10 × 110.5 = 1105 € ; 3.5 × 21.005 = 73.5175 € → 7352 cents.
        expect(dto.totals.valueCents).toBe(10_000 + 110_500 + 7_352)
        expect(dto.lines.map((line) => line.isin)).toEqual([WORLD, EMERGING])
        expect(dto.lines[0]).toMatchObject({
          quantity: '10',
          unitCostEur: '100',
          costCents: 100_000,
          priceEur: '110.5',
          priceDay: '2026-10-31',
          priceSource: 'statement',
          gainCents: 10_500,
        })
        expect(await values(pea)).toEqual([
          { date: '2026-10-31', valueCents: 127_852, source: 'computed' },
        ])
        // The same statement again changes nothing.
        const preview = await positions.preview(pea, '2026-10-31', october, NOW)
        expect(preview.unchanged).toBe(true)
        expect(preview.lines.every((line) => line.status === 'unchanged')).toBe(
          true,
        )
      })
    })

    it('lets a typed value win its day, and gives the day back when it goes', async () => {
      await inRollback(async ({ positions, investments, account, values }) => {
        const pea = await account()
        await investments.upsert(
          pea,
          '2026-10-31',
          { valueCents: 128_000 },
          NOW,
        )
        await positions.putStatement(pea, '2026-10-31', october, 'mcp', NOW)
        expect(await values(pea)).toEqual([
          { date: '2026-10-31', valueCents: 128_000, source: 'typed' },
        ])
        const preview = await positions.preview(pea, '2026-10-31', october, NOW)
        expect(preview.typedValueCents).toBe(128_000)

        await investments.remove(pea, '2026-10-31', NOW)
        expect(await values(pea)).toEqual([
          { date: '2026-10-31', valueCents: 127_852, source: 'computed' },
        ])
        // A computed value is replaced by a typed one, never deleted.
        await expect(
          investments.remove(pea, '2026-10-31', NOW),
        ).rejects.toThrow(BadRequestException)
        await investments.upsert(
          pea,
          '2026-10-31',
          { valueCents: 127_900 },
          NOW,
        )
        expect((await values(pea))[0]).toMatchObject({ source: 'typed' })
      })
    })

    it('edits as of today, never rewriting the past', async () => {
      await inRollback(async ({ tx, positions, account, values }) => {
        const pea = await account()
        await positions.putStatement(pea, '2026-10-31', october, 'mcp', NOW)
        const after = await positions.upsertLine(
          pea,
          WORLD,
          { quantity: '12' },
          NOW,
        )
        expect(after.asOf).toBe('2026-11-05')
        // The PRU omitted is kept.
        expect(after.lines.find((line) => line.isin === WORLD)).toMatchObject({
          quantity: '12',
          unitCostEur: '100',
        })
        const statements = await tx
          .select({ asOf: positionStatementsTable.asOf })
          .from(positionStatementsTable)
          .where(eq(positionStatementsTable.accountId, pea))
          .orderBy(asc(positionStatementsTable.asOf))
        expect(statements.map((row) => row.asOf)).toEqual([
          '2026-10-31',
          '2026-11-05',
        ])
        // Today's value from the October prices: 12 × 110.5 + the rest.
        expect((await values(pea)).at(-1)).toEqual({
          date: '2026-11-05',
          valueCents: 10_000 + 132_600 + 7_352,
          source: 'computed',
        })

        const sold = await positions.removeLine(pea, EMERGING, NOW)
        expect(sold.lines.map((line) => line.isin)).toEqual([WORLD])
        const october31 = await positions.preview(
          pea,
          '2026-10-31',
          october,
          NOW,
        )
        expect(october31.unchanged).toBe(true)
      })
    })

    it('values a line without a price nowhere, then from its manual price', async () => {
      await inRollback(async ({ positions, account, values }) => {
        const pea = await account()
        await positions.putStatement(
          pea,
          '2026-10-31',
          {
            cashCents: 0,
            lines: [
              {
                isin: WORLD,
                name: 'ETF Monde fictif',
                quantity: '2',
                unitCostEur: null,
              },
            ],
          },
          'mcp',
          NOW,
        )
        expect(await values(pea)).toEqual([])
        await positions.setPrice(WORLD, '2026-11-03', '50.25', NOW)
        expect(await values(pea)).toEqual([
          { date: '2026-11-03', valueCents: 10_050, source: 'computed' },
        ])
        // A statement price never replaces a manual one of the same day.
        const preview = await positions.preview(
          pea,
          '2026-11-03',
          {
            cashCents: 0,
            lines: [{ isin: WORLD, quantity: '2', priceEur: '60' }],
          },
          NOW,
        )
        expect(preview.lines[0]).toMatchObject({
          priceEur: '50.25',
          priceKept: true,
        })
      })
    })

    it('refuses an unknown security without a name, a duplicate and a future day', async () => {
      await inRollback(async ({ positions, account }) => {
        const pea = await account()
        await expect(
          positions.putStatement(
            pea,
            '2026-10-31',
            { cashCents: 0, lines: [{ isin: WORLD, quantity: '1' }] },
            'mcp',
            NOW,
          ),
        ).rejects.toThrow(/name is required/)
        await expect(
          positions.putStatement(
            pea,
            '2026-10-31',
            { cashCents: 0, lines: [october.lines[0], october.lines[0]] },
            'mcp',
            NOW,
          ),
        ).rejects.toThrow(/Duplicate/)
        await expect(
          positions.putStatement(pea, '2026-11-06', october, 'mcp', NOW),
        ).rejects.toThrow(/future/)
        const checking = await account('checking')
        await expect(
          positions.putStatement(checking, '2026-10-31', october, 'mcp', NOW),
        ).rejects.toThrow(/Only a PEA/)
      })
    })

    it('deletes a statement and its values', async () => {
      await inRollback(async ({ positions, account, values }) => {
        const pea = await account()
        await positions.putStatement(pea, '2026-10-31', october, 'mcp', NOW)
        await positions.removeStatement(pea, '2026-10-31', NOW)
        expect(await values(pea)).toEqual([])
      })
    })
  })

  describe('invested amount', () => {
    it('takes the lines’ cost plus cash only when nothing else is known', async () => {
      await inRollback(async ({ tx, positions, investments, account }) => {
        const pea = await account()
        await positions.putStatement(pea, '2026-10-31', october, 'mcp', NOW)
        const fallback = await investments.performance(pea, NOW)
        // 10 × 100 + 3.5 × 20 = 1070 € + 100 € of cash.
        expect(fallback).toMatchObject({
          valueCents: 127_852,
          contributionsCents: 117_000,
          contributionsSource: 'lines',
          gainCents: 10_852,
        })

        await tx
          .update(accountsTable)
          .set({ investedBaseCents: 120_000, investedBaseOn: '2026-10-01' })
          .where(and(eq(accountsTable.id, pea)))
        const base = await investments.performance(pea, NOW)
        expect(base).toMatchObject({
          contributionsCents: 120_000,
          contributionsSource: 'base',
        })
      })
    })
  })
})
