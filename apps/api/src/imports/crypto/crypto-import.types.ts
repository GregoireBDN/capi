import type {
  CryptoImportFormat,
  CryptoMovementKind,
} from '#/database/schema/domain-enums'
import type { ParseIssue } from '#/imports/parsers/parsed-row'

/**
 * One line of an exchange export (or a Ledger Live history), as the parsers
 * return it. Holds quantities:
 * never log it. Nothing else from the file is kept: account holder names and
 * user ids, notes, remarks and addresses are dropped by the parsers.
 */
export interface ParsedMovement {
  /** 1-based physical line in the file. */
  lineNumber: number
  /** UTC instant, `YYYY-MM-DDTHH:mm:ssZ`. */
  occurredAt: string
  /** Sub-wallet of the exchange (`Spot`, `Funding`), when the export has one. */
  wallet: string | null
  /** Operation type as exported (`Transaction Buy`, `Convert`…). */
  operation: string
  kind: CryptoMovementKind
  /** False when the operation type is unknown (`kind` is then `other`). */
  known: boolean
  /** Ticker as exported, upper case (`BTC`, `EUR`). */
  asset: string
  /** Signed exact decimal (`-0.0012`), at most 18 decimals. */
  quantity: string
  /** EUR amount the export gives for the line (fees included), positive. */
  eurCents: number | null
  /** Exchange id of the line, when the export has one. */
  sourceRef: string | null
  /**
   * SHA-256 of the on-chain transaction hash (`txHashDigest`), when the
   * export gives one (Ledger Live, #426). The hash itself is never kept.
   */
  txHashDigest?: string | null
}

export interface CryptoParseResult {
  format: CryptoImportFormat
  movements: ParsedMovement[]
  issues: ParseIssue[]
}

export type CryptoPreviewRowStatus = 'new' | 'duplicate'

export interface CryptoPreviewRow extends ParsedMovement {
  /** 0-based position among the parsed rows, in file order. */
  index: number
  dedupeHash: string
  status: CryptoPreviewRowStatus
}

/** Price id chosen for a ticker of the export. */
export interface AssetMapping {
  ticker: string
  assetId: string
  symbol: string
  name: string
}

export type ProjectedHoldingStatus = 'ok' | 'negative' | 'unmapped'

/** Holding of one asset once the import is committed. */
export interface ProjectedHolding {
  /** Tickers of the export counted in this holding (`RNDR`, `RENDER`). */
  tickers: string[]
  assetId: string | null
  symbol: string
  name: string | null
  /** Signed: negative when the imported history misses earlier movements. */
  quantity: string
  investedCents: number | null
  status: ProjectedHoldingStatus
}

export interface UnknownOperation {
  operation: string
  count: number
}

/**
 * Shape of `crypto_imports.preview` (jsonb). Holds quantities: never log it.
 * `rows` is emptied once the import is committed (the movements are the
 * record then); the summary stays.
 */
export interface CryptoImportPreviewData {
  version: 1
  issues: ParseIssue[]
  rows: CryptoPreviewRow[]
  /** Tickers with a price id, found when previewing. */
  mappings: AssetMapping[]
  unmappedTickers: string[]
  unknownOperations: UnknownOperation[]
  holdings: ProjectedHolding[]
}

export const CRYPTO_PREVIEW_VERSION = 1
