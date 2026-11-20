import type { TransactionKind } from '#/database/schema/domain-enums'

/**
 * Kind a split part counts with (#357), as `transactionLinesView` computes
 * it: the kind of its category, so an incoming part in an expense category is
 * a refund of that category (it nets its spending, budget and envelope) and
 * an outgoing part in an income category lowers that income. A transfer's
 * parts stay transfers, and a part in a transfer category keeps the
 * transaction's kind, so a split never turns a move between the owner's
 * accounts into income or expense, nor the reverse.
 */
export function splitPartKind(
  transactionKind: TransactionKind,
  categoryKind: TransactionKind,
): TransactionKind {
  if (transactionKind === 'transfer' || categoryKind === 'transfer') {
    return transactionKind
  }
  return categoryKind
}
