import { IMPORT_SOURCES } from '#/database/schema/domain-enums'
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import { accountsTable } from '#/accounts/accounts.schema'
import { coreColumns } from '#/database/schema/core.schema'
import type { ImportPreviewData } from '#/imports/preview/preview.types'
import { importProfilesTable } from '#/imports/profiles/import-profiles.schema'

export const importSourceEnum = pgEnum('import_source', IMPORT_SOURCES)

/**
 * One uploaded file. Created when the file is previewed; `committedAt` is set
 * once the user confirms and its transactions are written. Deleting an import
 * deletes its transactions (undo).
 *
 * Counters: `rowCount` parsed rows, of which `newCount` / `duplicateCount` /
 * `conflictCount` as classified by the preview, and `issueCount` lines that
 * could not be parsed. On commit `insertedCount` and `skippedCount` (conflicts
 * left out) are set, and `duplicateCount` also counts rows that turned out to
 * be stored meanwhile, so `inserted + duplicate + skipped = rowCount`.
 */
export const importsTable = pgTable(
  'imports',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'restrict' }),
    source: importSourceEnum('source').notNull(),
    /**
     * The saved profile a `csv_profile` import was read with (#431); null
     * for the other sources, and once the profile is deleted.
     */
    profileId: uuid('profile_id').references(() => importProfilesTable.id, {
      onDelete: 'set null',
    }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    /** SHA-256 of the raw file, to spot a file that was already imported. */
    fileHash: varchar('file_hash', { length: 64 }).notNull(),
    periodStart: date('period_start', { mode: 'string' }),
    periodEnd: date('period_end', { mode: 'string' }),
    rowCount: integer('row_count').notNull().default(0),
    insertedCount: integer('inserted_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    newCount: integer('new_count').notNull().default(0),
    conflictCount: integer('conflict_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    issueCount: integer('issue_count').notNull().default(0),
    /**
     * Classified rows of a pending import, so committing does not need the
     * file again. Null once committed (the transactions are the record then).
     */
    preview: jsonb('preview').$type<ImportPreviewData>(),
    committedAt: timestamp('committed_at', { withTimezone: true }),
  },
  (t) => [
    index().on(t.accountId),
    index().on(t.fileHash),
    index().on(t.profileId),
    check(
      'imports_profile_source',
      sql`${t.profileId} IS NULL OR ${t.source}::text = 'csv_profile'`,
    ),
  ],
)

export const selectImportSchema = createSelectSchema(importsTable)

export type InsertImport = typeof importsTable.$inferInsert
export type SelectImport = typeof importsTable.$inferSelect
