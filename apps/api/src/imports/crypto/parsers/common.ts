import type { CryptoMovementKind } from '#/database/schema/domain-enums'
import { type CsvRecord, isBlankRecord, readCsv } from '#/imports/history/csv'
import type { ParseIssue } from '#/imports/parsers/parsed-row'

/** Longest ticker kept (`crypto_movements.asset`). */
export const MAX_TICKER_LENGTH = 20
const MAX_OPERATION_LENGTH = 100
const MAX_WALLET_LENGTH = 50
const MAX_REF_LENGTH = 100
/** Lines searched for the header row (Coinbase puts a preamble first). */
const HEADER_SEARCH_LINES = 15

/** `Durée` → `duree`, `UTC_Time` → `utc time`, trims and collapses spaces. */
export function headerKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim()
}

/** Collapsed, trimmed operation type (`Transaction  Buy ` → `Transaction Buy`). */
export function cleanText(text: string, max: number): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, max)
}

export const cleanOperation = (text: string) =>
  cleanText(text, MAX_OPERATION_LENGTH)
export const cleanWallet = (text: string) => cleanText(text, MAX_WALLET_LENGTH)
export const cleanRef = (text: string) => cleanText(text, MAX_REF_LENGTH)

export interface HeaderMatch {
  /** Index of the header record. */
  index: number
  /** Column position by key. */
  columns: Map<string, number>
}

/**
 * Finds the header row among the first records: the first one holding every
 * `required` column (any of its aliases). Records before it are skipped and
 * never read further (Coinbase's preamble names the account holder).
 */
export function findHeader(
  records: CsvRecord[],
  aliases: Record<string, readonly string[]>,
  required: readonly string[],
): HeaderMatch | null {
  const limit = Math.min(records.length, HEADER_SEARCH_LINES)
  for (let index = 0; index < limit; index++) {
    const keys = records[index].fields.map(headerKey)
    const columns = new Map<string, number>()
    for (const [name, names] of Object.entries(aliases)) {
      const position = keys.findIndex((key) => names.includes(key))
      if (position >= 0) columns.set(name, position)
    }
    if (required.every((name) => columns.has(name))) {
      return { index, columns }
    }
  }
  return null
}

/** Fields a data row needs to reach every matched column. */
export function requiredWidth(header: HeaderMatch): number {
  return Math.max(...header.columns.values()) + 1
}

export function readRecords(text: string): {
  records: CsvRecord[]
  issues: ParseIssue[]
} {
  const { records, unterminatedLines } = readCsv(text)
  return {
    records: records.filter((record) => !isBlankRecord(record)),
    issues: unterminatedLines.map((lineNumber) => ({
      lineNumber,
      message: 'Guillemet non fermé',
    })),
  }
}

const TIMESTAMP =
  /^(\d{2}|\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?: ?UTC| ?Z)?$/i

/**
 * UTC timestamp of an export (`2025-03-15 10:00:00`, `2025-03-15 10:00:00 UTC`,
 * `2025-03-15T10:00:00Z`, `25-03-15 10:00:00`) to `YYYY-MM-DDTHH:mm:ssZ`.
 * The text is read as UTC: no local time zone is involved. Null if invalid.
 */
export function parseUtcTimestamp(text: string): string | null {
  const match = TIMESTAMP.exec(text.trim())
  if (!match) return null
  const year =
    match[1].length === 2 ? 2000 + Number(match[1]) : Number(match[1])
  const [month, day, hour, minute, second] = match.slice(2).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null
  }
  return date.toISOString().replace('.000Z', 'Z')
}

/** Upper-case ticker, or null when empty, too long or not a ticker. */
export function parseTicker(text: string): string | null {
  const ticker = text.trim().toUpperCase()
  if (ticker === '' || ticker.length > MAX_TICKER_LENGTH) return null
  return /^[A-Z0-9][A-Z0-9._-]*$/.test(ticker) ? ticker : null
}

/** Operation type → kind, from a table keyed by `headerKey` form. */
export function kindOf(
  table: Readonly<Record<string, CryptoMovementKind>>,
  operation: string,
): { kind: CryptoMovementKind; known: boolean } {
  const kind = table[headerKey(operation)]
  return kind ? { kind, known: true } : { kind: 'other', known: false }
}

export function cell(
  fields: string[],
  columns: Map<string, number>,
  name: string,
): string {
  const position = columns.get(name)
  return position === undefined ? '' : (fields[position] ?? '').trim()
}
