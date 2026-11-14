import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { accountsTable } from '#/accounts/accounts.schema'
import { coreColumns } from '#/database/schema/core.schema'
import {
  CRYPTO_IMPORT_FORMATS,
  CRYPTO_MOVEMENT_KINDS,
} from '#/database/schema/domain-enums'
import type { CryptoImportPreviewData } from './crypto-import.types'

export const cryptoImportFormatEnum = pgEnum(
  'crypto_import_format',
  CRYPTO_IMPORT_FORMATS,
)
export const cryptoMovementKindEnum = pgEnum(
  'crypto_movement_kind',
  CRYPTO_MOVEMENT_KINDS,
)

/**
 * One exchange export uploaded to a crypto account (#128). Created when the
 * file is previewed; `committedAt` is set once the owner confirms and its
 * movements are written. Deleting a committed import deletes its movements.
 */
export const cryptoImportsTable = pgTable(
  'crypto_imports',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    format: cryptoImportFormatEnum('format').notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    /** SHA-256 of the raw file. */
    fileHash: varchar('file_hash', { length: 64 }).notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    rowCount: integer('row_count').notNull().default(0),
    newCount: integer('new_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    issueCount: integer('issue_count').notNull().default(0),
    insertedCount: integer('inserted_count').notNull().default(0),
    preview: jsonb('preview').$type<CryptoImportPreviewData>().notNull(),
    committedAt: timestamp('committed_at', { withTimezone: true }),
  },
  (t) => [index().on(t.accountId)],
)

/**
 * One line of an exchange ledger: a signed quantity of an asset at an instant.
 * The holdings of an exchange account (origin `import`) are the sum of its
 * movements per price id. Quantities are exact decimals, handled as strings.
 */
export const cryptoMovementsTable = pgTable(
  'crypto_movements',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    importId: uuid('import_id')
      .notNull()
      .references(() => cryptoImportsTable.id, { onDelete: 'cascade' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /** Sub-wallet of the exchange (`Spot`, `Funding`), when exported. */
    wallet: varchar('wallet', { length: 50 }),
    /** Operation type as exported. */
    operation: varchar('operation', { length: 100 }).notNull(),
    kind: cryptoMovementKindEnum('kind').notNull(),
    /** Ticker as exported (`RNDR`). */
    asset: varchar('asset', { length: 20 }).notNull(),
    quantity: numeric('quantity', { precision: 38, scale: 18 }).notNull(),
    /** EUR amount the export gives for the line (fees included). */
    eurCents: bigint('eur_cents', { mode: 'number' }),
    /** Exchange id of the line, when exported. */
    sourceRef: varchar('source_ref', { length: 100 }),
    dedupeHash: varchar('dedupe_hash', { length: 64 }).notNull(),
  },
  (t) => [
    unique('crypto_movements_account_hash_unique').on(
      t.accountId,
      t.dedupeHash,
    ),
    index().on(t.accountId, t.occurredAt),
    index().on(t.importId),
  ],
)

/**
 * Price id of an exchange ticker that the built-in table (`assets.ts`) does
 * not know: found by the asset search when previewing, or picked by the
 * owner. Shared by every exchange account.
 */
export const cryptoAssetAliasesTable = pgTable('crypto_asset_aliases', {
  ...coreColumns,
  ticker: varchar('ticker', { length: 20 }).notNull().unique(),
  assetId: varchar('asset_id', { length: 100 }).notNull(),
  symbol: varchar('symbol', { length: 20 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
})

export type SelectCryptoImport = typeof cryptoImportsTable.$inferSelect
export type SelectCryptoMovement = typeof cryptoMovementsTable.$inferSelect
export type InsertCryptoMovement = typeof cryptoMovementsTable.$inferInsert
