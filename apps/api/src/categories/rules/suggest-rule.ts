import type { TransactionKind } from '#/database/schema/domain-enums'
import type { CategorizableTransaction } from './categorize'
import { foldForMatch } from './normalize-text'

/** A rule proposal, shaped like the create-rule payload. Not saved. */
export interface SuggestedRule {
  enabled: true
  matchType: 'contains'
  labelPattern: string
  accountId: null
  minAmountCents: null
  maxAmountCents: null
  categoryId: string
  kind: TransactionKind | null
  merchant: null
}

/**
 * Bank operation words that open a label (`PAIEMENT CB`, `PRLV SEPA`,
 * `VIR INST RECU /DE`, ...). Skipped before the stable part starts.
 */
const OPERATION_WORDS = new Set([
  'achat',
  'carte',
  'cb',
  'cheque',
  'dab',
  'chq',
  'de',
  'des',
  'du',
  'emis',
  'en',
  'faveur',
  'inst',
  'instantane',
  'paiement',
  'par',
  'pour',
  'prelevement',
  'prlv',
  'psc',
  'recu',
  'remise',
  'retrait',
  'sepa',
  'vir',
  'virement',
])

/**
 * Words after which the label usually turns variable (references, mandate
 * ids, card numbers, due dates): they end the stable part.
 */
const TAIL_MARKERS = new Set([
  'carte',
  'date',
  'ech',
  'echeance',
  'fact',
  'facture',
  'id',
  'mdt',
  'motif',
  'no',
  'num',
  'ref',
  'reference',
])

/** Longest suggested pattern, in words: specific enough, still stable. */
const MAX_WORDS = 4

const hasDigit = (word: string) => /\p{N}/u.test(word)

/**
 * Extracts the stable part of a bank label: after the leading operation words,
 * the first run of consecutive words without digits (dates, amounts,
 * references, card numbers), stopping at a reference marker. Words are folded
 * like `contains` matching folds them, so the result is always a substring of
 * the folded label and matches the transaction it came from.
 */
export function stableLabelPart(rawLabel: string): string {
  const words = foldForMatch(rawLabel).split(' ').filter(Boolean)

  let start = 0
  while (
    start < words.length &&
    (OPERATION_WORDS.has(words[start]) ||
      hasDigit(words[start]) ||
      words[start].length < 2)
  ) {
    start++
  }

  const run: string[] = []
  for (let i = start; i < words.length && run.length < MAX_WORDS; i++) {
    const word = words[i]
    if (hasDigit(word) || TAIL_MARKERS.has(word)) break
    run.push(word)
  }
  if (run.length > 0) return run.join(' ')

  // Only operation words and numbers (e.g. `RETRAIT DAB 1234`): keep the
  // first consecutive words without digits, operation words included.
  const fallback: string[] = []
  for (const word of words) {
    if (hasDigit(word)) {
      if (fallback.length > 0) break
      continue
    }
    fallback.push(word)
    if (fallback.length === MAX_WORDS) break
  }
  return fallback.join(' ')
}

/**
 * Proposes a `contains` rule that would file transactions like `tx` under
 * `categoryId` (offered when the user corrects a category). Prefers the
 * normalized merchant key when the import found one, else the stable part of
 * the raw label (upper-cased to read like bank labels; matching ignores case).
 *
 * The amount and account are left open: the same merchant is usually filed
 * the same way whatever the amount or account, and the user can narrow the
 * rule before saving it.
 */
export function suggestRuleFromTransaction(
  tx: CategorizableTransaction,
  categoryId: string,
): SuggestedRule {
  const merchant = tx.merchant?.trim() ?? ''
  const labelPattern =
    foldForMatch(merchant) !== ''
      ? merchant
      : stableLabelPart(tx.rawLabel).toUpperCase() || tx.rawLabel.trim()

  return {
    enabled: true,
    matchType: 'contains',
    labelPattern: labelPattern.slice(0, 255),
    accountId: null,
    minAmountCents: null,
    maxAmountCents: null,
    categoryId,
    kind: null,
    merchant: null,
  }
}
