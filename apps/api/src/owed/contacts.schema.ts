import { ownerColumn } from '#/database/schema/owner'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { coreColumns } from '#/database/schema/core.schema'

/** Longest contact name. */
export const CONTACT_NAME_MAX = 60

/**
 * People the owner advances money to, or who pay for him (#359): no user
 * account, no sign-in, no email. Created on the fly where a share is
 * entered, managed in Réglages › Contacts. Names are private data: never
 * logged.
 */
export const contactsTable = pgTable(
  'contacts',
  {
    ...coreColumns,
    userId: ownerColumn(),
    name: varchar('name', { length: CONTACT_NAME_MAX }).notNull(),
    /**
     * Words of the bank labels of this person's transfers (« VIR CAMILLE
     * MARTIN »), matched case- and accent-insensitively to suggest that an
     * incoming transfer repays them, or that an outgoing one repays them.
     */
    matchLabels: text('match_labels')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Usual day of the month their repayments arrive (forecast). */
    repaymentDay: smallint('repayment_day'),
    /**
     * « Toujours compenser » (#484): when they owe the owner and he owes
     * them, the two are offset as soon as a new item makes it so, without
     * asking.
     */
    alwaysOffset: boolean('always_offset').notNull().default(false),
    /** Left out of the pickers; history kept. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('contacts_name_unique').on(t.userId, sql`lower(${t.name})`),
    check(
      'contacts_repayment_day_range',
      sql`${t.repaymentDay} is null or (${t.repaymentDay} >= 1 and ${t.repaymentDay} <= 31)`,
    ),
  ],
)

export type SelectContact = typeof contactsTable.$inferSelect
