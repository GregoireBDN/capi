import { IMPORT_SOURCES } from '#/database/schema/domain-enums'
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { createSelectSchema } from 'drizzle-zod'
import { accountsTable } from '#/accounts/accounts.schema'
import { coreColumns } from '#/database/schema/core.schema'

export const importSourceEnum = pgEnum('import_source', IMPORT_SOURCES)

/**
 * One uploaded file. Created when the file is previewed; `committedAt` is set
 * once the user confirms and its transactions are written. Deleting an import
 * deletes its transactions (undo).
 */
export const importsTable = pgTable(
  'imports',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'restrict' }),
    source: importSourceEnum('source').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    /** SHA-256 of the raw file, to spot a file that was already imported. */
    fileHash: varchar('file_hash', { length: 64 }).notNull(),
    periodStart: date('period_start', { mode: 'string' }),
    periodEnd: date('period_end', { mode: 'string' }),
    rowCount: integer('row_count').notNull().default(0),
    insertedCount: integer('inserted_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    committedAt: timestamp('committed_at'),
  },
  (t) => [index().on(t.accountId), index().on(t.fileHash)],
)

export const selectImportSchema = createSelectSchema(importsTable)

export type InsertImport = typeof importsTable.$inferInsert
export type SelectImport = typeof importsTable.$inferSelect
