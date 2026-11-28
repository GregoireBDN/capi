import { ownerColumn } from '#/database/schema/owner'
import { sql } from 'drizzle-orm'
import {
  check,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/pg-core'
import { coreColumns } from '#/database/schema/core.schema'
import type { MonthReportDto } from './dto/month-close.dto'

/**
 * The guided month-end review of one calendar month (#75): the steps the
 * owner ticked by hand, the notes, and, once the month is closed, the report
 * as it stood then (`report`), so later edits show as differences. A row is
 * created by the first tick, note or close; reopening clears `closedAt`,
 * `report` and `reportVersion`.
 */
export const monthClosesTable = pgTable(
  'month_closes',
  {
    ...coreColumns,
    userId: ownerColumn(),
    /** `YYYY-MM`. */
    month: varchar('month', { length: 7 }).notNull(),
    notes: text('notes'),
    /** Steps marked as seen by hand (`recurring`, `budget`, `savings`). */
    acknowledged: text('acknowledged')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** Report frozen at the close; null while the month is open. */
    report: jsonb('report').$type<MonthReportDto>(),
    /**
     * Shape of `report` (#369): `upgradeReport` turns any stored version into
     * the current DTO; set with the report, cleared with it.
     */
    reportVersion: smallint('report_version'),
  },
  (t) => [
    unique('month_closes_month_unique').on(t.userId, t.month),
    check(
      'month_closes_month_format',
      sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      'month_closes_acknowledged_steps',
      sql`${t.acknowledged} <@ array['recurring', 'budget', 'savings']::text[]`,
    ),
    check(
      'month_closes_closed_has_report',
      sql`(${t.closedAt} is null) = (${t.report} is null)`,
    ),
    check(
      'month_closes_report_has_version',
      sql`(${t.report} is null) = (${t.reportVersion} is null)`,
    ),
  ],
)

export type SelectMonthClose = typeof monthClosesTable.$inferSelect
