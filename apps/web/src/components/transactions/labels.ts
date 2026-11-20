import type { TransactionDto, TransactionKind } from '#/api/types.gen'

/** Kinds in display order. */
export const TRANSACTION_KINDS: readonly TransactionKind[] = [
  'expense',
  'income',
  'transfer',
]

/** Label of a transaction's kind. */
export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: 'Dépense',
  income: 'Revenu',
  transfer: 'Virement interne',
}

/** Heading of a group of categories. */
export const KIND_GROUP_LABELS: Record<TransactionKind, string> = {
  expense: 'Dépenses',
  income: 'Revenus',
  transfer: 'Mouvements internes',
}

/** Merchant when the import found one, else the raw bank label. */
export function displayLabel(transaction: {
  rawLabel: string
  merchant: string | null
}): string {
  return transaction.merchant?.trim() || transaction.rawLabel
}

/**
 * The account a transaction was paid from or into, or « Payé par Sam » for
 * an expense someone paid for the owner (#359), which has none.
 */
export function accountLabel(transaction: {
  accountName: string | null
  paidByContactName?: string | null
}): string {
  return (
    transaction.accountName ??
    `Payé par ${transaction.paidByContactName ?? 'un proche'}`
  )
}

/** Lowercase, without accents, words separated by single spaces. */
function normalizeWords(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * The raw bank label under the display label, only when it says more (#266):
 * none when the row shows the raw label already, or when the raw label only
 * wraps the display label in bank words (`VIR SEPA VERS PEA` under
 * « Vers Pea », `PAIEMENT CB 2810 PARIS BIOCOOP` under « Biocoop »).
 */
export function secondaryLabel(transaction: {
  rawLabel: string
  merchant: string | null
}): string | null {
  const shown = displayLabel(transaction)
  if (shown === transaction.rawLabel) return null
  const label = normalizeWords(shown)
  const raw = ` ${normalizeWords(transaction.rawLabel)} `
  return label !== '' && raw.includes(` ${label} `)
    ? null
    : transaction.rawLabel
}

/** « Vers » for money out, « Depuis » for money in (a transfer's link, #296). */
export function counterpartLabel(
  item: Pick<TransactionDto, 'amountCents'>,
): 'Vers' | 'Depuis' {
  return item.amountCents < 0 ? 'Vers' : 'Depuis'
}
