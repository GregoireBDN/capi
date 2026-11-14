import {
  transactionsControllerCorrect,
  transactionsControllerRestoreBankValues,
  transactionsControllerSplit,
  transactionsControllerUnsplit,
} from '#/api'
import type {
  CorrectTransactionDto,
  SplitPartDto,
  TransactionDto,
} from '#/api/types.gen'
import { unwrap } from '#/lib/queries'

/** Splits a transaction between categories (parts summing to its amount). */
export function splitTransaction(
  id: string,
  parts: readonly Pick<SplitPartDto, 'categoryId' | 'amountCents'>[],
): Promise<TransactionDto> {
  return unwrap(
    transactionsControllerSplit({
      path: { id },
      body: {
        parts: parts.map(({ categoryId, amountCents }) => ({
          categoryId,
          amountCents,
        })),
      },
      throwOnError: false,
    }),
  )
}

/** Puts a split transaction back in one category. */
export function unsplitTransaction(id: string): Promise<TransactionDto> {
  return unwrap(
    transactionsControllerUnsplit({ path: { id }, throwOnError: false }),
  )
}

/** Corrects the amount or date of an imported transaction. */
export function correctTransaction(
  id: string,
  body: CorrectTransactionDto,
): Promise<TransactionDto> {
  return unwrap(
    transactionsControllerCorrect({ path: { id }, body, throwOnError: false }),
  )
}

/** Puts back the bank amount and date of a corrected transaction. */
export function restoreBankValues(id: string): Promise<TransactionDto> {
  return unwrap(
    transactionsControllerRestoreBankValues({
      path: { id },
      throwOnError: false,
    }),
  )
}

/** Parts of a split as cents per category, empty when not split. */
export function splitParts(item: TransactionDto) {
  return item.splits.map(({ categoryId, amountCents }) => ({
    categoryId,
    amountCents,
  }))
}

/**
 * Error of a split being edited, or null when it can be saved: at least two
 * parts, each with a category and an amount of the transaction's sign, summing
 * exactly to its amount (`remainingCents` = 0).
 */
export function splitError(
  totalCents: number,
  parts: readonly { categoryId: string; amountCents: number | null }[],
): string | null {
  if (parts.length < 2) return 'Répartissez sur au moins deux catégories'
  if (parts.some((part) => !part.categoryId)) {
    return 'Choisissez une catégorie pour chaque part'
  }
  if (
    parts.some(
      (part) =>
        part.amountCents === null ||
        part.amountCents === 0 ||
        Math.sign(part.amountCents) !== Math.sign(totalCents),
    )
  ) {
    return 'Chaque part doit avoir un montant'
  }
  if (remainingCents(totalCents, parts) !== 0) {
    return 'Les parts doivent faire exactement le montant de l’opération'
  }
  return null
}

/** What is left to allocate: the amount minus the parts typed so far. */
export function remainingCents(
  totalCents: number,
  parts: readonly { amountCents: number | null }[],
): number {
  return parts.reduce(
    (left, part) => left - (part.amountCents ?? 0),
    totalCents,
  )
}
