import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { asc, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  dashboardWidgetAccountsTable,
  dashboardWidgetEnvelopesTable,
  dashboardWidgetsTable,
  envelopesTable,
} from '#/database/schema'
import {
  DASHBOARD_ACCOUNT_WIDGET_TYPES,
  type DashboardWidgetType,
} from '#/database/schema/domain-enums'
import type {
  DashboardLayoutDto,
  DashboardWidgetDto,
  DashboardWidgetSettingsDto,
} from './dashboard-layout.dto'

type Db = PostgresJsDatabase<typeof schema>

/**
 * Today's dashboard (#405), the layout while the owner has saved none: « À
 * faire », « Reste à dépenser » with « Fin de mois » and « Patrimoine » in
 * its card, then « Budgets suivis ».
 */
export const DEFAULT_DASHBOARD_LAYOUT: DashboardWidgetDto[] = [
  widget('todo'),
  widget('left_to_spend'),
  widget('forecast'),
  widget('net_worth'),
  widget('tracked_budgets'),
]

function widget(type: DashboardWidgetType): DashboardWidgetDto {
  return {
    type,
    hidden: false,
    accountIds: null,
    envelopeIds: null,
    settings: {},
  }
}

const ACCOUNT_TYPES = new Set<DashboardWidgetType>(
  DASHBOARD_ACCOUNT_WIDGET_TYPES,
)

/** The settings each type takes; every other key is refused. */
const SETTINGS: Partial<
  Record<DashboardWidgetType, (keyof DashboardWidgetSettingsDto)[]>
> = {
  upcoming_debits: ['upcomingDays'],
  owed: ['owedSide'],
  balances: ['balancesSort'],
}

/**
 * The dashboard's layout (#495): read with its default applied, replaced as
 * a whole, reset. The elements' figures come from their own endpoints.
 */
@Injectable()
export class DashboardLayoutService {
  private readonly logger = new Logger(DashboardLayoutService.name)

  constructor(private readonly database: DatabaseService) {}

  private get db(): Db {
    return this.database.db
  }

  async get(): Promise<DashboardLayoutDto> {
    const rows = await this.db
      .select()
      .from(dashboardWidgetsTable)
      .orderBy(asc(dashboardWidgetsTable.position))
    if (rows.length === 0) {
      return { custom: false, widgets: DEFAULT_DASHBOARD_LAYOUT }
    }
    const ids = rows.map((row) => row.id)
    const [accounts, envelopes] = await Promise.all([
      this.db
        .select()
        .from(dashboardWidgetAccountsTable)
        .where(inArray(dashboardWidgetAccountsTable.widgetId, ids))
        .orderBy(asc(dashboardWidgetAccountsTable.position)),
      this.db
        .select()
        .from(dashboardWidgetEnvelopesTable)
        .where(inArray(dashboardWidgetEnvelopesTable.widgetId, ids)),
    ])
    return {
      custom: true,
      widgets: rows.map((row) => ({
        type: row.type,
        hidden: row.hidden,
        accountIds: row.accountsChosen
          ? accounts
              .filter((link) => link.widgetId === row.id)
              .map((link) => link.accountId)
          : null,
        envelopeIds: row.envelopesChosen
          ? envelopes
              .filter((link) => link.widgetId === row.id)
              .map((link) => link.envelopeId)
          : null,
        settings: row.settings as DashboardWidgetSettingsDto,
      })),
    }
  }

  /** Replaces the whole layout in one transaction. */
  async replace(widgets: DashboardWidgetDto[]): Promise<DashboardLayoutDto> {
    validate(widgets)
    await this.db.transaction(async (tx) => {
      await checkExists(
        tx,
        widgets.flatMap((item) => item.accountIds ?? []),
        widgets.flatMap((item) => item.envelopeIds ?? []),
      )
      await tx.delete(dashboardWidgetsTable)
      for (const [position, item] of widgets.entries()) {
        const [row] = await tx
          .insert(dashboardWidgetsTable)
          .values({
            type: item.type,
            position,
            hidden: item.hidden,
            accountsChosen: item.accountIds !== null,
            envelopesChosen: item.envelopeIds !== null,
            settings: settingsOf(item),
          })
          .returning({ id: dashboardWidgetsTable.id })
        if (item.accountIds?.length) {
          await tx.insert(dashboardWidgetAccountsTable).values(
            item.accountIds.map((accountId, position) => ({
              widgetId: row.id,
              accountId,
              position,
            })),
          )
        }
        if (item.envelopeIds?.length) {
          await tx.insert(dashboardWidgetEnvelopesTable).values(
            item.envelopeIds.map((envelopeId) => ({
              widgetId: row.id,
              envelopeId,
            })),
          )
        }
      }
    })
    // The element types only, never what they show.
    this.logger.log(
      `Dashboard layout saved: ${widgets.map((item) => item.type).join(', ')}`,
    )
    return this.get()
  }

  /** Back to the default layout. */
  async reset(): Promise<DashboardLayoutDto> {
    await this.db.delete(dashboardWidgetsTable)
    return this.get()
  }
}

function validate(widgets: DashboardWidgetDto[]) {
  const seen = new Set<DashboardWidgetType>()
  for (const item of widgets) {
    if (seen.has(item.type)) {
      throw new BadRequestException(`Element ${item.type} is there twice.`)
    }
    seen.add(item.type)
    item.accountIds ??= null
    item.envelopeIds ??= null
    if (item.accountIds !== null && !ACCOUNT_TYPES.has(item.type)) {
      throw new BadRequestException(
        `Element ${item.type} does not show accounts.`,
      )
    }
    if (item.envelopeIds !== null && item.type !== 'envelopes') {
      throw new BadRequestException(
        `Element ${item.type} does not show envelopes.`,
      )
    }
    const allowed = SETTINGS[item.type] ?? []
    for (const [key, value] of Object.entries(item.settings ?? {})) {
      if (value === undefined) continue
      if (!allowed.includes(key as keyof DashboardWidgetSettingsDto)) {
        throw new BadRequestException(
          `Element ${item.type} has no setting ${key}.`,
        )
      }
    }
  }
}

function settingsOf(item: DashboardWidgetDto) {
  return Object.fromEntries(
    Object.entries(item.settings ?? {}).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Record<string, string | number>
}

async function checkExists(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  accountIds: string[],
  envelopeIds: string[],
) {
  const unique = (ids: string[]) => [...new Set(ids)]
  if (accountIds.length > 0) {
    const ids = unique(accountIds)
    const found = await tx
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(inArray(accountsTable.id, ids))
    if (found.length !== ids.length) {
      throw new BadRequestException('Unknown account.')
    }
  }
  if (envelopeIds.length > 0) {
    const ids = unique(envelopeIds)
    const found = await tx
      .select({ id: envelopesTable.id })
      .from(envelopesTable)
      .where(inArray(envelopesTable.id, ids))
    if (found.length !== ids.length) {
      throw new BadRequestException('Unknown envelope.')
    }
  }
}
