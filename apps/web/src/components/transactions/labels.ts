import type { TransactionKind } from '#/api/types.gen'

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
