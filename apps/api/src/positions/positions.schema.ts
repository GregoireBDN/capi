import { sql } from 'drizzle-orm'
import {
  bigint,
  char,
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { accountsTable } from '#/accounts/accounts.schema'
import { coreColumns } from '#/database/schema/core.schema'
import {
  POSITION_STATEMENT_SOURCES,
  SECURITY_PRICE_SOURCES,
} from '#/database/schema/domain-enums'

export const securityPriceSourceEnum = pgEnum(
  'security_price_source',
  SECURITY_PRICE_SOURCES,
)
export const positionStatementSourceEnum = pgEnum(
  'position_statement_source',
  POSITION_STATEMENT_SOURCES,
)

/**
 * A security known by its ISIN (ADR 0006): public reference data shared by
 * every account, no amount of the owner's in it. The ISIN's format and check
 * digit are checked by `isin_is_valid` (migration 0046).
 */
export const securitiesTable = pgTable(
  'securities',
  {
    ...coreColumns,
    isin: char('isin', { length: 12 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    /** Display only: the ticker and the market (MIC) it is quoted on. */
    ticker: varchar('ticker', { length: 20 }),
    exchange: varchar('exchange', { length: 10 }),
  },
  (t) => [
    unique('securities_isin_unique').on(t.isin),
    check('securities_isin_valid', sql`isin_is_valid(${t.isin})`),
    check('securities_name_not_blank', sql`btrim(${t.name}) <> ''`),
  ],
)

/**
 * One EUR price per security and day, exact (`numeric(38, 12)`). The latest
 * day is the current price; the earlier ones value the account's past days.
 * A write never replaces a stronger source of the same day (manual >
 * statement > provider).
 */
export const securityPricesTable = pgTable(
  'security_prices',
  {
    ...coreColumns,
    securityId: uuid('security_id')
      .notNull()
      .references(() => securitiesTable.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    priceEur: numeric('price_eur', { precision: 38, scale: 12 }).notNull(),
    source: securityPriceSourceEnum('source').notNull(),
  },
  (t) => [
    unique('security_prices_security_day_unique').on(t.securityId, t.day),
    check('security_prices_positive', sql`${t.priceEur} > 0`),
  ],
)

/**
 * What an account held on a day, as a whole (ADR 0006): its lines and its
 * cash. The account holds, on a day, the lines of its latest statement on or
 * before it; a line missing from a statement was sold.
 */
export const positionStatementsTable = pgTable(
  'position_statements',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    asOf: date('as_of', { mode: 'string' }).notNull(),
    /** « Liquidités »: money on the account not invested in a security. */
    cashCents: bigint('cash_cents', { mode: 'number' }).notNull().default(0),
    source: positionStatementSourceEnum('source').notNull(),
  },
  (t) => [
    unique('position_statements_account_day_unique').on(t.accountId, t.asOf),
    check('position_statements_cash_non_negative', sql`${t.cashCents} >= 0`),
  ],
)

/** One security of a statement: its quantity and its PRU, exact. */
export const positionLinesTable = pgTable(
  'position_lines',
  {
    ...coreColumns,
    statementId: uuid('statement_id')
      .notNull()
      .references(() => positionStatementsTable.id, { onDelete: 'cascade' }),
    securityId: uuid('security_id')
      .notNull()
      .references(() => securitiesTable.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 38, scale: 18 }).notNull(),
    /** The PRU (average cost per unit) as the statement prints it. */
    unitCostEur: numeric('unit_cost_eur', { precision: 38, scale: 12 }),
  },
  (t) => [
    unique('position_lines_statement_security_unique').on(
      t.statementId,
      t.securityId,
    ),
    index().on(t.securityId),
    check('position_lines_quantity_positive', sql`${t.quantity} > 0`),
    check(
      'position_lines_unit_cost_non_negative',
      sql`${t.unitCostEur} IS NULL OR ${t.unitCostEur} >= 0`,
    ),
  ],
)

export type SelectSecurity = typeof securitiesTable.$inferSelect
export type SelectPositionStatement =
  typeof positionStatementsTable.$inferSelect
export type SelectPositionLine = typeof positionLinesTable.$inferSelect

/**
 * A dividend a compte-titres received (#414), typed by the owner from the
 * broker's notice: information only, shown on the account's page. It changes
 * neither the account's value (the cash it brought is in the statements) nor
 * what was invested. Only on a compte-titres (`dividends_account_type`
 * trigger, migration 0048).
 */
export const dividendsTable = pgTable(
  'dividends',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    /** Net amount received, in cents. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    /** The security that paid it, when the owner says which. */
    securityId: uuid('security_id').references(() => securitiesTable.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index().on(t.accountId, t.paidOn),
    index().on(t.securityId),
    check('dividends_amount_positive', sql`${t.amountCents} > 0`),
  ],
)

export type SelectDividend = typeof dividendsTable.$inferSelect
