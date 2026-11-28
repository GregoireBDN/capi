import { ownerColumn } from '#/database/schema/owner'
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { accountsTable } from '#/accounts/accounts.schema'
import { categoriesTable } from '#/categories/categories.schema'
import { coreColumns } from '#/database/schema/core.schema'
import { ENVELOPE_MOVEMENT_REASONS } from '#/database/schema/domain-enums'
import { transactionsTable } from '#/transactions/transactions.schema'

export const envelopeMovementReasonEnum = pgEnum(
  'envelope_movement_reason',
  ENVELOPE_MOVEMENT_REASONS,
)

/**
 * Money set aside for a goal (#429, ADR 0008): a trip, an item to buy, a
 * deposit. A label on money, never a transaction: its amount on each account
 * is the sum of its `envelope_movements` there, and nothing else reads them.
 */
export const envelopesTable = pgTable(
  'envelopes',
  {
    ...coreColumns,
    userId: ownerColumn(),
    name: varchar('name', { length: 100 }).notNull(),
    /** An icon name of the web app (`plane`, `gift`…), optional. */
    icon: varchar('icon', { length: 40 }),
    /** Hex colour (`#0284c7`), optional. */
    color: varchar('color', { length: 16 }),
    /** The amount aimed at; null = no target (« Pas de montant »). */
    targetCents: bigint('target_cents', { mode: 'number' }),
    /** Calendar day it is for; null = no due date. */
    dueDate: date('due_date', { mode: 'string' }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    check('envelopes_name_not_blank', sql`btrim(${t.name}) <> ''`),
    check('envelopes_target_positive', sql`${t.targetCents} > 0`),
  ],
)

/** The expense categories an envelope pays for (offers only). */
export const envelopeCategoriesTable = pgTable(
  'envelope_categories',
  {
    ...coreColumns,
    userId: ownerColumn(),
    envelopeId: uuid('envelope_id')
      .notNull()
      .references(() => envelopesTable.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categoriesTable.id, { onDelete: 'cascade' }),
  },
  (t) => [
    unique('envelope_categories_unique').on(t.envelopeId, t.categoryId),
    index().on(t.categoryId),
  ],
)

/**
 * The ledger of an envelope on an account: its amount there is the sum of
 * its rows. See `ENVELOPE_MOVEMENT_REASONS` and ADR 0008 for each reason's
 * links; the triggers of migration 0053 check a row against its transaction.
 */
export const envelopeMovementsTable = pgTable(
  'envelope_movements',
  {
    ...coreColumns,
    userId: ownerColumn(),
    envelopeId: uuid('envelope_id')
      .notNull()
      .references(() => envelopesTable.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    /** Signed cents: positive = more set aside on this account. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    /** Calendar day: the transaction's booking day, else the day of the move. */
    onDate: date('on_date', { mode: 'string' }).notNull(),
    reason: envelopeMovementReasonEnum('reason').notNull(),
    /** A hand move between two envelopes: the other one (null = « libre »). */
    counterEnvelopeId: uuid('counter_envelope_id').references(
      () => envelopesTable.id,
      { onDelete: 'set null' },
    ),
    /** The saving, transfer or expense of a `split`, `transfer` or `spend`. */
    transactionId: uuid('transaction_id').references(
      () => transactionsTable.id,
      { onDelete: 'cascade' },
    ),
    note: text('note'),
  },
  (t) => [
    index().on(t.envelopeId, t.accountId),
    index().on(t.accountId),
    index().on(t.transactionId),
    check('envelope_movements_amount_not_zero', sql`${t.amountCents} <> 0`),
    check(
      'envelope_movements_transaction_iff_linked_reason',
      sql`(${t.transactionId} is not null) = (${t.reason} in ('split', 'transfer', 'spend'))`,
    ),
    check(
      'envelope_movements_counter_only_on_moves',
      sql`${t.counterEnvelopeId} is null or (${t.reason} = 'move' and ${t.counterEnvelopeId} <> ${t.envelopeId})`,
    ),
    check(
      'envelope_movements_start_split_positive',
      sql`${t.reason} not in ('start', 'split') or ${t.amountCents} > 0`,
    ),
    // One envelope per attached expense or transfer (a leg per account).
    uniqueIndex('envelope_movements_one_envelope_per_attachment')
      .on(t.transactionId, t.accountId)
      .where(sql`${t.reason} in ('transfer', 'spend')`),
    uniqueIndex('envelope_movements_one_split_per_envelope')
      .on(t.transactionId, t.envelopeId)
      .where(sql`${t.reason} = 'split'`),
  ],
)

/**
 * An account's split key: each envelope's share of a new saving, in basis
 * points (10 000 = 100 %); what is left to 10 000 stays « libre » (at most
 * 10 000 per account, a trigger).
 */
export const envelopeSplitKeysTable = pgTable(
  'envelope_split_keys',
  {
    ...coreColumns,
    userId: ownerColumn(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    envelopeId: uuid('envelope_id')
      .notNull()
      .references(() => envelopesTable.id, { onDelete: 'cascade' }),
    basisPoints: integer('basis_points').notNull(),
  },
  (t) => [
    unique('envelope_split_keys_unique').on(t.accountId, t.envelopeId),
    index().on(t.envelopeId),
    check(
      'envelope_split_keys_basis_points_range',
      sql`${t.basisPoints} between 1 and 10000`,
    ),
  ],
)

/** « Non » to every envelope offer on a transaction. */
export const envelopeOfferDismissalsTable = pgTable(
  'envelope_offer_dismissals',
  {
    ...coreColumns,
    userId: ownerColumn(),
    transactionId: uuid('transaction_id')
      .notNull()
      .unique('envelope_offer_dismissals_transaction_unique')
      .references(() => transactionsTable.id, { onDelete: 'cascade' }),
  },
)

export type SelectEnvelope = typeof envelopesTable.$inferSelect
export type SelectEnvelopeMovement = typeof envelopeMovementsTable.$inferSelect
