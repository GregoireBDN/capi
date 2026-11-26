import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { accountsTable } from '#/accounts/accounts.schema'
import { coreColumns } from '#/database/schema/core.schema'
import {
  DASHBOARD_ACCOUNT_WIDGET_TYPES,
  DASHBOARD_WIDGET_SIZES,
  DASHBOARD_WIDGET_TYPES,
} from '#/database/schema/domain-enums'
import { envelopesTable } from '#/envelopes/envelopes.schema'

export const dashboardWidgetTypeEnum = pgEnum(
  'dashboard_widget_type',
  DASHBOARD_WIDGET_TYPES,
)
export const dashboardWidgetSizeEnum = pgEnum(
  'dashboard_widget_size',
  DASHBOARD_WIDGET_SIZES,
)

const accountTypes = sql.raw(
  DASHBOARD_ACCOUNT_WIDGET_TYPES.map((type) => `'${type}'`).join(', '),
)

/**
 * The owner's dashboard (#495): one row per element, in `position` order.
 * No rows = the default layout, computed (`dashboard/layout`), so an element
 * added to the app later never appears by surprise. Each element at most
 * once. `settings` holds the element's scalars only (validated per type by
 * the service); what names rows (accounts, envelopes) is in the join tables
 * below, whose foreign keys drop a deleted row from the element by itself.
 */
export const dashboardWidgetsTable = pgTable(
  'dashboard_widgets',
  {
    ...coreColumns,
    type: dashboardWidgetTypeEnum('type').notNull(),
    position: integer('position').notNull(),
    size: dashboardWidgetSizeEnum('size').notNull(),
    hidden: boolean('hidden').notNull().default(false),
    /** The chosen accounts only (`dashboard_widget_accounts`), else all. */
    accountsChosen: boolean('accounts_chosen').notNull().default(false),
    /** The chosen envelopes only (`dashboard_widget_envelopes`), else all. */
    envelopesChosen: boolean('envelopes_chosen').notNull().default(false),
    settings: jsonb('settings')
      .$type<Record<string, string | number | boolean>>()
      .notNull()
      .default({}),
  },
  (t) => [
    unique('dashboard_widgets_type_unique').on(t.type),
    unique('dashboard_widgets_position_unique').on(t.position),
    check('dashboard_widgets_position_positive', sql`${t.position} >= 0`),
    check(
      'dashboard_widgets_settings_object',
      sql`jsonb_typeof(${t.settings}) = 'object'`,
    ),
    check(
      'dashboard_widgets_accounts_chosen_type',
      sql`not ${t.accountsChosen} or ${t.type} in (${accountTypes})`,
    ),
    check(
      'dashboard_widgets_envelopes_chosen_type',
      sql`not ${t.envelopesChosen} or ${t.type} = 'envelopes'`,
    ),
  ],
)

/** The accounts an element shows when it shows chosen ones, in their order. */
export const dashboardWidgetAccountsTable = pgTable(
  'dashboard_widget_accounts',
  {
    ...coreColumns,
    widgetId: uuid('widget_id')
      .notNull()
      .references(() => dashboardWidgetsTable.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    /** The account's place in the element (« Mon ordre »), from 0. */
    position: integer('position').notNull(),
  },
  (t) => [
    unique('dashboard_widget_accounts_unique').on(t.widgetId, t.accountId),
    unique('dashboard_widget_accounts_position_unique').on(
      t.widgetId,
      t.position,
    ),
    check('dashboard_widget_accounts_position', sql`${t.position} >= 0`),
    index().on(t.accountId),
  ],
)

/** The envelopes the « Enveloppes » element shows when it shows chosen ones. */
export const dashboardWidgetEnvelopesTable = pgTable(
  'dashboard_widget_envelopes',
  {
    ...coreColumns,
    widgetId: uuid('widget_id')
      .notNull()
      .references(() => dashboardWidgetsTable.id, { onDelete: 'cascade' }),
    envelopeId: uuid('envelope_id')
      .notNull()
      .references(() => envelopesTable.id, { onDelete: 'cascade' }),
  },
  (t) => [
    unique('dashboard_widget_envelopes_unique').on(t.widgetId, t.envelopeId),
    index().on(t.envelopeId),
  ],
)

export type DashboardWidget = typeof dashboardWidgetsTable.$inferSelect
