import { createHash } from 'node:crypto'
import { daysBetween, toEpochDay } from './calendar-date'

/**
 * Deduplication of imported rows against the transactions already stored for
 * the same account. Pure functions only: no I/O, no Nest, no logging (labels
 * and amounts are private data).
 *
 * ## Exact duplicates: the dedupe hash
 *
 * `transactions.dedupe_hash` is `UNIQUE (account_id, dedupe_hash)`, so the
 * hash is the identity of a row *within one account* (the account is not part
 * of the hash: the constraint scopes it). It is
 *
 *     sha256("dedupe:v1" | bookingDate | amountCents | hashLabel | occurrence)
 *
 * - `hashLabel` is the raw label uppercased, accents and ligatures folded,
 *   whitespace collapsed and trimmed. Nothing else is dropped: CIC card
 *   references are stable from one export to the next and help tell rows
 *   apart.
 * - `occurrence` is the 0-based index of the row among the rows of the same
 *   input that share its (bookingDate, amountCents, hashLabel), in input
 *   order. Two genuinely identical card payments on the same day therefore get
 *   distinct hashes (occurrences 0 and 1) and are both kept, and re-importing
 *   the same file, or any file covering that whole day, yields the same two
 *   hashes again, so both are recognized as duplicates. Since identical rows
 *   are interchangeable, the hashes do not depend on the file order (ascending
 *   or descending) nor on the rows of other days.
 * - The running balance is deliberately **not** hashed: sources without a
 *   running balance (the spreadsheet history import, #13) must be able to use
 *   the same function. The balance still serves the continuity check
 *   (`continuity.ts`) and ranks probable duplicates below.
 * - Changing anything in this recipe changes every hash and breaks
 *   idempotency with already imported rows: bump the `v1` prefix and plan a
 *   migration instead of editing it in place.
 *
 * Limit: a file whose first or last day is cut in the middle of the day can
 * contain fewer occurrences of an identical group than the full day has.
 * Bank exports cover whole days, so this is accepted.
 *
 * ## Probable duplicates: cross-source overlap
 *
 * Rows of different sources for the same days (history import vs CSV) have
 * differently formatted labels, so their hashes never match. Rows that are not
 * exact duplicates are compared with the existing transactions that no row
 * matched by hash: same amount, booking dates at most `dateToleranceDays`
 * apart (0 by default, i.e. the same day) and similar labels (same
 * `merchantKey`, or enough shared significant label tokens, see
 * `significantTokens`). A match is reported as a `conflict` with the existing
 * transaction id, for the preview (#10) to let the user decide: conflicts are
 * never dropped automatically.
 *
 * Matching is one-to-one: an existing transaction is the duplicate or the
 * conflict of at most one incoming row. Candidate pairs are assigned greedily,
 * best first (closest dates, then equal running balances, then label
 * similarity, then file order), so two identical incoming rows pair with two
 * distinct existing transactions, and an extra identical row stays `new`.
 */

// --- Hashes -----------------------------------------------------------------

export interface DedupeInput {
  /** `YYYY-MM-DD` booking date. */
  bookingDate: string
  /** Signed integer cents. */
  amountCents: number
  rawLabel: string
}

/** Version prefix of the hash recipe. See the header comment before changing it. */
const HASH_VERSION = 'dedupe:v1'

/**
 * Label as hashed: uppercase, accents and ligatures folded, whitespace
 * collapsed, trimmed. Never contains a newline, the hash field separator.
 */
export function normalizeLabelForHash(rawLabel: string): string {
  return foldAccents(rawLabel).toUpperCase().replace(/\s+/g, ' ').trim()
}

/**
 * One SHA-256 hex digest per row, in input order. Identical rows (same date,
 * amount and normalized label) are told apart by their occurrence index.
 *
 * @throws {RangeError} on an invalid date or a non-integer amount.
 */
export function computeDedupeHashes(rows: DedupeInput[]): string[] {
  const occurrences = new Map<string, number>()
  return rows.map((row) => {
    toEpochDay(row.bookingDate) // validates the date
    if (!Number.isSafeInteger(row.amountCents)) {
      throw new RangeError('Expected an integer amount in cents')
    }
    const key = [
      row.bookingDate,
      String(row.amountCents),
      normalizeLabelForHash(row.rawLabel),
    ].join('\n')
    const occurrence = occurrences.get(key) ?? 0
    occurrences.set(key, occurrence + 1)
    return createHash('sha256')
      .update(`${HASH_VERSION}\n${key}\n${occurrence}`, 'utf8')
      .digest('hex')
  })
}

// --- Classification ---------------------------------------------------------

export interface ExistingTransaction {
  id: string
  bookingDate: string
  amountCents: number
  rawLabel: string
  /** `normalizeLabel(rawLabel, amountCents).merchantKey`. */
  merchantKey: string | null
  balanceAfterCents: number | null
  dedupeHash: string
}

export type RowStatus =
  | { status: 'new' }
  | { status: 'duplicate'; existingId: string }
  | { status: 'conflict'; existingId: string; reason: string }

export interface ClassifyOptions {
  /** Max booking-date distance of a probable duplicate. Defaults to 0. */
  dateToleranceDays?: number
}

export type ClassifyRow = DedupeInput & {
  merchantKey: string | null
  /** Optional: equal balances rank a probable duplicate first. */
  balanceAfterCents?: number | null
}

export const DEFAULT_DATE_TOLERANCE_DAYS = 0

/** Minimum `significantTokens` of a probable duplicate. */
export const LABEL_SIMILARITY_THRESHOLD = 0.6

/**
 * Status of every incoming row, in input order: `duplicate` when its hash is
 * already stored, `conflict` when it probably is the same transaction as an
 * existing one from another source, `new` otherwise.
 *
 * `existing` must hold the transactions of the same account around the rows'
 * dates (see `loadExistingForRange`).
 */
export function classifyRows(
  rows: ClassifyRow[],
  hashes: string[],
  existing: ExistingTransaction[],
  options: ClassifyOptions = {},
): RowStatus[] {
  if (hashes.length !== rows.length) {
    throw new RangeError('Expected one hash per row')
  }
  const tolerance = options.dateToleranceDays ?? DEFAULT_DATE_TOLERANCE_DAYS
  if (!Number.isInteger(tolerance) || tolerance < 0) {
    throw new RangeError('dateToleranceDays must be a non-negative integer')
  }

  const statuses: (RowStatus | null)[] = rows.map(() => null)
  const used = new Set<number>()

  // 1. Exact duplicates.
  const byHash = new Map<string, number>()
  existing.forEach((tx, j) => {
    if (!byHash.has(tx.dedupeHash)) byHash.set(tx.dedupeHash, j)
  })
  hashes.forEach((hash, i) => {
    const j = byHash.get(hash)
    if (j === undefined || used.has(j)) return
    used.add(j)
    statuses[i] = { status: 'duplicate', existingId: existing[j].id }
  })

  // 2. Probable duplicates among the rest, best pairs first.
  const existingTokens = existing.map((tx) => significantTokens(tx.rawLabel))
  const candidates: Candidate[] = []
  rows.forEach((row, i) => {
    if (statuses[i]) return
    const rowTokens = significantTokens(row.rawLabel)
    existing.forEach((tx, j) => {
      if (used.has(j) || tx.amountCents !== row.amountCents) return
      const dayDiff = daysBetween(row.bookingDate, tx.bookingDate)
      if (dayDiff > tolerance) return
      const sameMerchant =
        row.merchantKey !== null && row.merchantKey === tx.merchantKey
      const similarity = sameMerchant
        ? 1
        : tokenOverlap(rowTokens, existingTokens[j])
      if (similarity < LABEL_SIMILARITY_THRESHOLD) return
      const sameBalance =
        row.balanceAfterCents != null &&
        row.balanceAfterCents === tx.balanceAfterCents
      candidates.push({ i, j, dayDiff, sameMerchant, similarity, sameBalance })
    })
  })

  candidates.sort(
    (a, b) =>
      a.dayDiff - b.dayDiff ||
      Number(b.sameBalance) - Number(a.sameBalance) ||
      b.similarity - a.similarity ||
      a.i - b.i ||
      compareExisting(existing[a.j], existing[b.j]),
  )
  for (const c of candidates) {
    if (statuses[c.i] || used.has(c.j)) continue
    used.add(c.j)
    statuses[c.i] = {
      status: 'conflict',
      existingId: existing[c.j].id,
      reason: conflictReason(c),
    }
  }

  return statuses.map((s) => s ?? { status: 'new' })
}

interface Candidate {
  i: number
  j: number
  dayDiff: number
  sameMerchant: boolean
  similarity: number
  sameBalance: boolean
}

/** Deterministic tie-break, independent of the order `existing` came in. */
function compareExisting(a: ExistingTransaction, b: ExistingTransaction) {
  if (a.bookingDate !== b.bookingDate) {
    return a.bookingDate < b.bookingDate ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Shown in the preview. Must never contain labels, amounts or balances. */
function conflictReason(c: Candidate): string {
  const when =
    c.dayDiff === 0
      ? 'same day'
      : `${c.dayDiff} day${c.dayDiff > 1 ? 's' : ''} apart`
  const label = c.sameMerchant ? 'same merchant' : 'similar label'
  const balance = c.sameBalance ? ', same balance' : ''
  return `Same amount, ${when}, ${label}${balance}`
}

// --- Label similarity -------------------------------------------------------

/**
 * Words that say how the money moved, not with whom; they appear in most
 * labels of a kind and would make every card payment look alike.
 */
const LABEL_STOPWORDS = new Set([
  'PAIEMENT',
  'PSC',
  'CARTE',
  'ACHAT',
  'PRLV',
  'PRELEVEMENT',
  'SEPA',
  'VIR',
  'VIREMENT',
  'INST',
  'INSTANTANE',
  'PERMANENT',
  'RETRAIT',
  'DAB',
  'CHQ',
  'CHEQUE',
  'REMISE',
  'REF',
  'REFERENCE',
  'MOTIF',
  'ECH',
  'ECHEANCE',
  'FACTURE',
  'EUR',
  'EUROS',
  'DES',
  'LES',
  'AUX',
  'POUR',
  'SAS',
  'SARL',
  'EURL',
  'WWW',
  'COM',
  'MME',
  'MLLE',
  'MONSIEUR',
  'MADAME',
])

/**
 * Tokens of a label that identify a counterparty: words of 3+ letters that
 * are not stopwords, and long numbers (cheque numbers, mandate references).
 * Short numbers and mixed tokens (dates, card digits, formatting-specific
 * refs) differ between sources and are ignored.
 */
export function significantTokens(rawLabel: string): Set<string> {
  const tokens = foldAccents(rawLabel)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(
      (t) =>
        (/^[A-Z]{3,}$/.test(t) && !LABEL_STOPWORDS.has(t)) ||
        /^\d{5,}$/.test(t),
    )
  return new Set(tokens)
}

/**
 * Overlap coefficient |A ∩ B| / min(|A|, |B|), in [0, 1]; 0 when either side
 * has no significant token. Using the smaller side lets a short history label
 * (`CAFE DE LA GARE`) match a longer CSV one that also names the city.
 */
export function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const t of a) if (b.has(t)) shared++
  return shared / Math.min(a.size, b.size)
}

function foldAccents(text: string): string {
  return text
    .replace(/Œ/g, 'OE')
    .replace(/œ/g, 'oe')
    .replace(/Æ/g, 'AE')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}
