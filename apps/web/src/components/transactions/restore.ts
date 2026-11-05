import {
  transactionsControllerBulkUpdate,
  transactionsControllerUpdate,
} from '#/api'
import type { TransactionDto, UpdateTransactionDto } from '#/api/types.gen'

/**
 * Body that puts a transaction back as it was before a correction (undo):
 * category, kind, one-off and review flags. A rule categorization is restored
 * with its rule, so rules keep managing it; a manual one stays manual. The
 * note is left out: bulk updates cannot carry it.
 */
export function restoreBody(item: TransactionDto): UpdateTransactionDto {
  return {
    categoryId: item.categoryId,
    ...(item.categoryId && item.ruleId ? { ruleId: item.ruleId } : {}),
    kind: item.kind,
    isOneOff: item.isOneOff,
    needsReview: item.needsReview,
  }
}

/**
 * Puts transactions back as they were (see `restoreBody`), grouping identical
 * restores into one bulk update. Resolves to false if any request failed.
 */
export async function restoreTransactions(
  previous: readonly TransactionDto[],
): Promise<boolean> {
  const groups = new Map<
    string,
    { body: UpdateTransactionDto; ids: string[] }
  >()
  for (const item of previous) {
    const body = restoreBody(item)
    const key = JSON.stringify(body)
    const group = groups.get(key) ?? { body, ids: [] }
    group.ids.push(item.id)
    groups.set(key, group)
  }
  const results = await Promise.all(
    [...groups.values()].map(({ body, ids }) =>
      ids.length === 1
        ? transactionsControllerUpdate({
            path: { id: ids[0] },
            body,
            throwOnError: false,
          })
        : transactionsControllerBulkUpdate({
            body: { ...body, ids },
            throwOnError: false,
          }),
    ),
  )
  return results.every((result) => result.data !== undefined)
}
