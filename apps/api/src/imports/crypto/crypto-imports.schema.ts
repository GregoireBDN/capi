import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
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
  CRYPTO_MOVEMENT_RESOLUTIONS,
  CRYPTO_TRANSFER_MATCHES,
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
export const cryptoMovementResolutionEnum = pgEnum(
  'crypto_movement_resolution',
  CRYPTO_MOVEMENT_RESOLUTIONS,
)
export const cryptoTransferMatchEnum = pgEnum(
  'crypto_transfer_match',
  CRYPTO_TRANSFER_MATCHES,
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
      // Like `imports`: the account deletion deletes them explicitly (#297).
      .references(() => accountsTable.id, { onDelete: 'restrict' }),
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
    /**
     * Classified rows of a pending import. Null once committed, like
     * `imports.preview` (the movements are the record then).
     */
    preview: jsonb('preview').$type<CryptoImportPreviewData>(),
    committedAt: timestamp('committed_at', { withTimezone: true }),
  },
  (t) => [index().on(t.accountId)],
)

/**
 * One movement of coins of a crypto account, a signed exact quantity of an
 * asset at an instant (exact decimals, handled as strings):
 * - a line of an exchange export (#128, `import_id`): the holdings of an
 *   exchange account (origin `import`) are the sum of its movements per
 *   price id;
 * - an `observed_in` / `observed_out` of a wallet or a manual account (#373,
 *   no import): what a complete read of the chain (or an edit of the lines)
 *   found risen or fallen since the previous one (`observed_since`; null on
 *   the account's first read, its opening position), with the asset's price
 *   id (`asset_id`). Never an address.
 * Their costs are not stored: one replay over every crypto account computes
 * them (`crypto/cost-basis.ts`). Only what the owner answered is stored.
 */
export const cryptoMovementsTable = pgTable(
  'crypto_movements',
  {
    ...coreColumns,
    accountId: uuid('account_id')
      .notNull()
      .references(() => accountsTable.id, { onDelete: 'cascade' }),
    /** The export it comes from; null for an observed movement. */
    importId: uuid('import_id').references(() => cryptoImportsTable.id, {
      onDelete: 'cascade',
    }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    /**
     * Observed movements: the previous read of the account (the rise or fall
     * happened in between); null on its first read (the opening position).
     */
    observedSince: timestamp('observed_since', { withTimezone: true }),
    /** Sub-wallet of the exchange (`Spot`, `Funding`), when exported. */
    wallet: varchar('wallet', { length: 50 }),
    /** Operation type as exported; `wallet_sync`, `manual_edit` when observed. */
    operation: varchar('operation', { length: 100 }).notNull(),
    kind: cryptoMovementKindEnum('kind').notNull(),
    /** Ticker as exported (`RNDR`), or the observed asset's symbol. */
    asset: varchar('asset', { length: 20 }).notNull(),
    /**
     * Price id of an observed movement's asset (an export's ticker is
     * resolved through `assets.ts` and the aliases instead).
     */
    assetId: varchar('asset_id', { length: 100 }),
    quantity: numeric('quantity', { precision: 38, scale: 18 }).notNull(),
    /** EUR amount the export gives for the line (fees included). */
    eurCents: bigint('eur_cents', { mode: 'number' }),
    /** Exchange id of the line, when exported. */
    sourceRef: varchar('source_ref', { length: 100 }),
    /**
     * The owner's other crypto account a `withdrawal` went to or a `deposit`
     * came from (#296), e.g. the Ledger: set with a transfer link (#373), when
     * one account alone holds the asset, or by hand. Without a link, it
     * carries the cost only before that account's first read.
     */
    counterpartAccountId: uuid('counterpart_account_id').references(
      () => accountsTable.id,
      { onDelete: 'set null' },
    ),
    /**
     * How the owner answered an arrival or a departure the app could not
     * explain (« À préciser », #373).
     */
    resolution: cryptoMovementResolutionEnum('resolution'),
    /**
     * The cost the owner gave coins that arrived (#373): typed when
     * `bought`, 0 for a `gift`; null otherwise.
     */
    costCents: bigint('cost_cents', { mode: 'number' }),
    /**
     * False once the owner unlinked or linked it by hand: the matching
     * leaves it alone, so a link removed by hand stays removed.
     */
    autoMatch: boolean('auto_match').notNull().default(true),
    dedupeHash: varchar('dedupe_hash', { length: 64 }).notNull(),
    /**
     * SHA-256 of the on-chain transaction hash, when the export gives one
     * (a Ledger Live line, #426): the two sides of one transfer carry the
     * same digest, so they are linked with certainty. Never the hash
     * itself, never an address. Export lines only.
     */
    txHashDigest: varchar('tx_hash_digest', { length: 64 }),
  },
  (t) => [
    unique('crypto_movements_account_hash_unique').on(
      t.accountId,
      t.dedupeHash,
    ),
    index().on(t.accountId, t.occurredAt),
    index().on(t.importId),
    index().on(t.counterpartAccountId),
    index().on(t.txHashDigest),
    check(
      'crypto_movements_tx_hash_digest',
      sql`${t.txHashDigest} IS NULL OR (${t.importId} IS NOT NULL AND ${t.txHashDigest} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      'crypto_movements_observed_shape',
      sql`(${t.kind} IN ('observed_in', 'observed_out')) = (${t.importId} IS NULL) AND (${t.kind} IN ('observed_in', 'observed_out')) = (${t.assetId} IS NOT NULL) AND (${t.observedSince} IS NULL OR ${t.kind} IN ('observed_in', 'observed_out'))`,
    ),
    check(
      'crypto_movements_observed_sign',
      sql`(${t.kind} <> 'observed_in' OR ${t.quantity} > 0) AND (${t.kind} <> 'observed_out' OR ${t.quantity} < 0)`,
    ),
    check(
      'crypto_movements_resolution_kind',
      sql`${t.resolution} IS NULL OR (${t.resolution} IN ('bought', 'gift') AND ${t.kind} IN ('deposit', 'observed_in')) OR (${t.resolution} = 'disposed' AND ${t.kind} IN ('withdrawal', 'observed_out'))`,
    ),
    check(
      'crypto_movements_given_cost',
      sql`(${t.costCents} IS NOT NULL) = COALESCE(${t.resolution} IN ('bought', 'gift'), false) AND (${t.resolution} IS DISTINCT FROM 'gift' OR ${t.costCents} = 0) AND (${t.costCents} IS NULL OR ${t.costCents} >= 0)`,
    ),
  ],
)

/**
 * The two sides of one transfer of coins between two of the owner's crypto
 * accounts (#373): what left one (`withdrawal`, `observed_out`) and what
 * arrived in the other (`deposit`, `observed_in`, never an opening). The
 * cost leaves the source at its average and arrives whole in the
 * destination; a network fee paid in coins lowers the quantity only. Each
 * movement is in one link at most. Found by the matching (`auto`) or chosen
 * by the owner (`manual`).
 */
export const cryptoTransferLinksTable = pgTable(
  'crypto_transfer_links',
  {
    ...coreColumns,
    outMovementId: uuid('out_movement_id')
      .notNull()
      .references(() => cryptoMovementsTable.id, { onDelete: 'cascade' }),
    inMovementId: uuid('in_movement_id')
      .notNull()
      .references(() => cryptoMovementsTable.id, { onDelete: 'cascade' }),
    matched: cryptoTransferMatchEnum('matched').notNull(),
  },
  (t) => [
    unique('crypto_transfer_links_out_unique').on(t.outMovementId),
    unique('crypto_transfer_links_in_unique').on(t.inMovementId),
    check(
      'crypto_transfer_links_two_sides',
      sql`${t.outMovementId} <> ${t.inMovementId}`,
    ),
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
export type SelectCryptoTransferLink =
  typeof cryptoTransferLinksTable.$inferSelect
