import type {
  BulkUpdateTransactionsDto,
  CategoryDto,
  TransactionDto,
  UpdateTransactionDto,
} from '#/api/types.gen'

/** Changes the page can apply, to one transaction or (without note) many. */
export type TransactionChanges = Omit<UpdateTransactionDto, 'ruleId'>
export type BulkChanges = Omit<BulkUpdateTransactionsDto, 'ids' | 'ruleId'>

/**
 * The transaction as the API will return it after `changes`, for optimistic
 * updates. Mirrors `TransactionsService.resolveChanges`: a category files it
 * by hand (rule cleared), gives it the category's kind unless `kind` is sent
 * and takes it out of review unless `needsReview` is sent; a kind change
 * alone clears the rule when the kind actually changes.
 */
export function applyChanges(
  item: TransactionDto,
  changes: TransactionChanges,
  categoriesById: ReadonlyMap<string, CategoryDto>,
  /** Account names, to show a new transfer link at once (#296). */
  accountNames: ReadonlyMap<string, string> = new Map(),
): TransactionDto {
  const next: TransactionDto = { ...item }
  if (changes.categoryId !== undefined) {
    next.ruleId = null
    if (changes.categoryId === null) {
      next.categoryId = null
      next.category = null
      if (changes.kind !== undefined) next.kind = changes.kind
      if (changes.needsReview !== undefined) {
        next.needsReview = changes.needsReview
      }
    } else {
      const category = categoriesById.get(changes.categoryId)
      next.categoryId = changes.categoryId
      next.category = category
        ? {
            id: category.id,
            slug: category.slug,
            name: category.name,
            color: category.color,
            icon: category.icon,
            kind: category.kind,
          }
        : null
      next.kind = changes.kind ?? category?.kind ?? item.kind
      next.needsReview = changes.needsReview ?? false
    }
  } else {
    if (changes.kind !== undefined) {
      if (changes.kind !== item.kind) next.ruleId = null
      next.kind = changes.kind
    }
    if (changes.needsReview !== undefined) {
      next.needsReview = changes.needsReview
    }
  }
  if (changes.isOneOff !== undefined) next.isOneOff = changes.isOneOff
  if (changes.note !== undefined) next.note = changes.note?.trim() || null
  // Only transfers are linked to another account.
  if (next.kind !== 'transfer') {
    next.counterpartAccountId = null
    next.counterpartAccountName = null
  } else if (changes.counterpartAccountId !== undefined) {
    next.counterpartAccountId = changes.counterpartAccountId
    next.counterpartAccountName =
      changes.counterpartAccountId === null
        ? null
        : (accountNames.get(changes.counterpartAccountId) ?? null)
  }
  return next
}

export interface DayGroup {
  date: string
  items: TransactionDto[]
  /** Net of the day's loaded transactions, transfers excluded. */
  totalCents: number
  /** False when the day only holds transfers (no total to show). */
  hasTotal: boolean
}

/**
 * Consecutive transactions of the same booking date, in list order (the list
 * is sorted by date when grouped). Totals only cover what is loaded.
 */
export function groupByDay(items: readonly TransactionDto[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const item of items) {
    let group = groups.at(-1)
    if (!group || group.date !== item.bookingDate) {
      group = {
        date: item.bookingDate,
        items: [],
        totalCents: 0,
        hasTotal: false,
      }
      groups.push(group)
    }
    group.items.push(item)
    if (item.kind !== 'transfer') {
      group.totalCents += item.amountCents
      group.hasTotal = true
    }
  }
  return groups
}
