import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { accountsTable } from '#/accounts/accounts.schema'
import { categoriesTable } from '#/categories/categories.schema'
import { coreColumns } from '#/database/schema/core.schema'
import { contactsTable } from '#/owed/contacts.schema'
import {
  RECURRING_AMOUNT_TYPES,
  RECURRING_CADENCES,
  RECURRING_DIRECTIONS,
  RECURRING_STATUSES,
} from '#/database/schema/domain-enums'

export const recurringCadenceEnum = pgEnum(
  'recurring_cadence',
  RECURRING_CADENCES,
)
export const recurringDirectionEnum = pgEnum(
  'recurring_direction',
  RECURRING_DIRECTIONS,
)
export const recurringAmountTypeEnum = pgEnum(
  'recurring_amount_type',
  RECURRING_AMOUNT_TYPES,
)
export const recurringStatusEnum = pgEnum(
  'recurring_status',
  RECURRING_STATUSES,
)

/**
 * Recurring series (subscriptions, rent, salary, ...) found by the detector
 * (`recurring/detect.ts`), one per account + merchant key + direction.
 *
 * The detection columns (`cadence`, amounts, dates, `confidence`) are a
 * snapshot refreshed by every detection run; the list endpoint recomputes
 * them from the transactions. The user's columns (`name`, `categoryId`,
 * `isFixedCost`, `cadenceOverride`, `notes`, `status`, `endedOn`, `termMonths`,
 * `renewalKeptOn`) are never overwritten by a detection run. `dismissed`
 * items are never suggested again.
 *
 * A **prepaid** item (#314, `termMonths` set) is a subscription paid upfront
 * for a term: its payments are the transactions linked to it
 * (`transactions.prepaid_item_id`), its renewal is the latest payment + the
 * term, and its monthly cost the payment ÷ the term.
 */
export const recurringItemsTable = pgTable(
  'recurring_items',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    /** Grouping key from the label normalizer (e.g. `STREAMFLIX`). */
    merchantKey: varchar('merchant_key', { length: 255 }).notNull(),
    direction: recurringDirectionEnum('direction').notNull(),
    /** Display name; detected from the merchant, then the user's. */
    name: varchar('name', { length: 255 }).notNull(),
    categoryId: uuid('category_id').references(() => categoriesTable.id, {
      onDelete: 'set null',
    }),
    status: recurringStatusEnum('status').notNull().default('suggested'),
    /** Counted as a fixed cost (rent, insurance, telecom, energy, subscriptions by default). */
    isFixedCost: boolean('is_fixed_cost').notNull(),
    /** Detected cadence. */
    cadence: recurringCadenceEnum('cadence').notNull(),
    /** The user's cadence, used instead of the detected one when set. */
    cadenceOverride: recurringCadenceEnum('cadence_override'),
    amountType: recurringAmountTypeEnum('amount_type').notNull(),
    /** Positive integer cents: current price (fixed) or median (variable). */
    typicalAmountCents: bigint('typical_amount_cents', {
      mode: 'number',
    }).notNull(),
    /** Detection confidence in [0, 1]. */
    confidence: real('confidence').notNull(),
    lastSeenDate: date('last_seen_date', { mode: 'string' }).notNull(),
    nextExpectedDate: date('next_expected_date', { mode: 'string' }),
    notes: text('notes'),
    /**
     * The user's cancellation (« Résilier »): the first day no charge is
     * expected any more (past, today or future). Never touched by detection.
     */
    endedOn: date('ended_on', { mode: 'string' }),
    /**
     * Prepaid term in months (#314): the subscription is paid once for the
     * whole term (12, 24, 36 months...). Null for an item charged every
     * period. The owner's, never touched by detection.
     */
    termMonths: smallint('term_months'),
    /**
     * Renewal date the owner chose to keep (« Garder », #314): no reminder
     * for it any more. Stale once the renewal date moves on.
     */
    renewalKeptOn: date('renewal_kept_on', { mode: 'string' }),
    /**
     * Shared with a contact (#359, the partner case): each charge booked
     * from `shareFrom` on gets their receivable (`origin = recurring`),
     * either `shareBps` of it (5000 = half) or `shareAmountCents`, unless it
     * has a share of its own. The owner's, never touched by detection.
     */
    shareContactId: uuid('share_contact_id').references(
      () => contactsTable.id,
      { onDelete: 'restrict' },
    ),
    shareBps: smallint('share_bps'),
    shareAmountCents: bigint('share_amount_cents', { mode: 'number' }),
    shareFrom: date('share_from', { mode: 'string' }),
    /**
     * Charges created up to this instant were already given their share
     * (`applyRecurringShares`), so a share removed from one by hand is not
     * made again. Reset when the item is shared with someone new.
     */
    shareAppliedAt: timestamp('share_applied_at', { withTimezone: true }),
  },
  (t) => [
    unique('recurring_items_account_merchant_direction_unique').on(
      t.accountId,
      t.merchantKey,
      t.direction,
    ),
    index().on(t.status),
    check(
      'recurring_items_typical_amount_positive',
      sql`${t.typicalAmountCents} >= 0`,
    ),
    // A cancellation (#270) is only for a confirmed item (#367).
    check(
      'recurring_items_ended_only_confirmed',
      sql`${t.endedOn} is null or ${t.status} = 'confirmed'`,
    ),
    // Only a debit is prepaid (#314).
    check(
      'recurring_items_term_only_debit',
      sql`${t.termMonths} is null or ${t.direction} = 'debit'`,
    ),
    // A prepaid term is a confirmed item's (#439): leaving `confirmed` clears it.
    check(
      'recurring_items_term_only_confirmed',
      sql`${t.termMonths} is null or ${t.status} = 'confirmed'`,
    ),
    check(
      'recurring_items_term_months_range',
      sql`${t.termMonths} is null or (${t.termMonths} >= 2 and ${t.termMonths} <= 60)`,
    ),
    check(
      'recurring_items_share_complete',
      sql`(${t.shareContactId} is null and ${t.shareBps} is null and ${t.shareAmountCents} is null and ${t.shareFrom} is null) or (${t.shareContactId} is not null and ${t.shareFrom} is not null and ((${t.shareBps} is null) <> (${t.shareAmountCents} is null)))`,
    ),
    check(
      'recurring_items_share_range',
      sql`(${t.shareBps} is null or (${t.shareBps} >= 1 and ${t.shareBps} <= 10000)) and (${t.shareAmountCents} is null or ${t.shareAmountCents} > 0)`,
    ),
    check(
      'recurring_items_confidence_range',
      sql`${t.confidence} >= 0 and ${t.confidence} <= 1`,
    ),
  ],
)

export type InsertRecurringItem = typeof recurringItemsTable.$inferInsert
export type SelectRecurringItem = typeof recurringItemsTable.$inferSelect
