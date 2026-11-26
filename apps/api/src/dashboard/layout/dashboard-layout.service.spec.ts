import '#/load-env'
import { BadRequestException } from '@nestjs/common'
import { eq } from 'drizzle-orm'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import { accountsTable, envelopesTable } from '#/database/schema'
import type { DashboardWidgetDto } from './dashboard-layout.dto'
import {
  DEFAULT_DASHBOARD_LAYOUT,
  DashboardLayoutService,
} from './dashboard-layout.service'

/**
 * The dashboard's layout (#495) against the test database: every test runs
 * in a transaction that is rolled back. Synthetic data only.
 */

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

const ROLLBACK = Symbol('rollback')

function item(
  type: DashboardWidgetDto['type'],
  values: Partial<DashboardWidgetDto> = {},
): DashboardWidgetDto {
  return {
    type,
    hidden: false,
    accountIds: null,
    envelopeIds: null,
    settings: {},
    ...values,
  }
}

describe.skipIf(!process.env.DATABASE_URL)('DashboardLayoutService', () => {
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
    fn: (layout: DashboardLayoutService, tx: Tx) => Promise<void>,
  ) {
    await db
      .transaction(async (tx) => {
        const service = new DashboardLayoutService({
          db: tx,
        } as unknown as DatabaseService)
        await fn(service, tx)
        throw ROLLBACK
      })
      .catch((error: unknown) => {
        if (error !== ROLLBACK) throw error
      })
  }

  async function account(tx: Tx, name = 'Compte fictif') {
    const [created] = await tx
      .insert(accountsTable)
      .values({ name, type: 'checking' })
      .returning()
    return created
  }

  it('is today’s dashboard while nothing was saved', async () => {
    await inRollback(async (layout) => {
      expect(await layout.get()).toEqual({
        custom: false,
        widgets: DEFAULT_DASHBOARD_LAYOUT,
      })
      expect(DEFAULT_DASHBOARD_LAYOUT.map((w) => w.type)).toEqual([
        'todo',
        'left_to_spend',
        'forecast',
        'net_worth',
        'tracked_budgets',
      ])
    })
  })

  it('saves the elements in order with their accounts, envelopes and settings', async () => {
    await inRollback(async (layout, tx) => {
      const checking = await account(tx)
      const savings = await account(tx, 'Livret fictif')
      const [trip] = await tx
        .insert(envelopesTable)
        .values({ name: 'Voyage fictif' })
        .returning()
      const saved = await layout.replace([
        item('balances', {
          // « Mon ordre »: kept as given.
          accountIds: [savings.id, checking.id],
          settings: { balancesSort: 'desc' },
        }),
        item('owed', { settings: { owedSide: 'i_owe' } }),
        item('upcoming_debits', { settings: { upcomingDays: 30 } }),
        item('envelopes', { envelopeIds: [trip.id] }),
        item('net_worth', { hidden: true, settings: { netWorthYears: 3 } }),
      ])
      expect(saved.custom).toBe(true)
      expect(saved.widgets.map((w) => w.type)).toEqual([
        'balances',
        'owed',
        'upcoming_debits',
        'envelopes',
        'net_worth',
      ])
      expect(saved.widgets[0].accountIds).toEqual([savings.id, checking.id])
      expect(saved.widgets[0].settings).toEqual({ balancesSort: 'desc' })
      expect(saved.widgets[1].settings).toEqual({ owedSide: 'i_owe' })
      expect(saved.widgets[2].settings).toEqual({ upcomingDays: 30 })
      expect(saved.widgets[3]).toMatchObject({
        envelopeIds: [trip.id],
        accountIds: null,
      })
      expect(saved.widgets[4]).toMatchObject({
        hidden: true,
        accountIds: null,
        settings: { netWorthYears: 3 },
      })

      // Saved again in another order: replaced as a whole.
      const again = await layout.replace([
        item('net_worth', { accountIds: [savings.id] }),
        item('balances'),
      ])
      expect(again.widgets).toEqual([
        item('net_worth', { accountIds: [savings.id] }),
        item('balances'),
      ])
    })
  })

  it('drops a deleted account from its element, which then shows none', async () => {
    await inRollback(async (layout, tx) => {
      const checking = await account(tx)
      await layout.replace([item('balances', { accountIds: [checking.id] })])
      await tx.delete(accountsTable).where(eq(accountsTable.id, checking.id))
      const [balances] = (await layout.get()).widgets
      expect(balances.accountIds).toEqual([])
    })
  })

  it('refuses an element twice, accounts, envelopes or settings it does not take, unknown rows', async () => {
    await inRollback(async (layout, tx) => {
      const checking = await account(tx)
      const refused = (widgets: DashboardWidgetDto[]) =>
        expect(layout.replace(widgets)).rejects.toThrow(BadRequestException)
      await refused([item('owed'), item('owed')])
      await refused([item('owed', { accountIds: [checking.id] })])
      await refused([item('balances', { envelopeIds: [] })])
      await refused([item('balances', { settings: { upcomingDays: 7 } })])
      await refused([item('owed', { settings: { netWorthYears: 1 } })])
      await refused([
        item('balances', {
          accountIds: ['00000000-0000-4000-8000-000000000000'],
        }),
      ])
      await refused([
        item('envelopes', {
          envelopeIds: ['00000000-0000-4000-8000-000000000000'],
        }),
      ])
      // Nothing was saved.
      expect((await layout.get()).custom).toBe(false)
    })
  })

  it('goes back to the default', async () => {
    await inRollback(async (layout) => {
      await layout.replace([item('owed')])
      expect(await layout.reset()).toEqual({
        custom: false,
        widgets: DEFAULT_DASHBOARD_LAYOUT,
      })
    })
  })
})
