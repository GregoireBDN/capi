import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  budgetsControllerHistory,
  budgetsControllerIncomeSuggestions,
  budgetsControllerMonth,
  budgetsControllerRemove,
  budgetsControllerSuggest,
  budgetsControllerUpsert,
} from '#/api'
import { envelopeKeys } from '#/components/expenses/queries'
import { unwrap } from '#/lib/queries'

/** Months of the "Réel vs cible" table. */
export const HISTORY_MONTHS = 6
/** Full months averaged by "Proposer des budgets". */
export const SUGGEST_MONTHS = 3

export const budgetKeys = {
  all: ['budgets'] as const,
  month: (month: string | undefined) =>
    ['budgets', 'month', month ?? 'default'] as const,
  history: (month: string, months: number) =>
    ['budgets', 'history', month, months] as const,
}

/** Targets vs spending of `month`; without it, the month the API picks. */
export function budgetMonthQuery(month?: string) {
  return queryOptions({
    queryKey: budgetKeys.month(month),
    queryFn: () =>
      unwrap(
        budgetsControllerMonth({
          ...(month ? { query: { month } } : {}),
          throwOnError: false,
        }),
      ),
    // Transactions change elsewhere (imports, review): always refetch on mount.
    staleTime: 0,
  })
}

export function budgetHistoryQuery(month: string, months = HISTORY_MONTHS) {
  return queryOptions({
    queryKey: budgetKeys.history(month, months),
    queryFn: () =>
      unwrap(
        budgetsControllerHistory({
          query: { month, months },
          throwOnError: false,
        }),
      ),
    staleTime: 0,
  })
}

/** Suggested targets for `month` (nothing is saved). */
export function fetchSuggestions(month: string, months = SUGGEST_MONTHS) {
  return unwrap(
    budgetsControllerSuggest({ query: { month, months }, throwOnError: false }),
  )
}

/**
 * The income side of `month`'s plan: the plan carried over from the month
 * before, else the confirmed recurring credits (nothing is saved).
 */
export function fetchIncomeSuggestions(month: string) {
  return unwrap(
    budgetsControllerIncomeSuggestions({
      query: { month },
      throwOnError: false,
    }),
  )
}

/** Sets the target (or the planned income) of a category from `month` on. */
export function saveBudget(
  categoryId: string,
  month: string,
  monthlyTargetCents: number,
  note?: string | null,
  tracked?: boolean,
) {
  return unwrap(
    budgetsControllerUpsert({
      path: { categoryId },
      body: { monthlyTargetCents, effectiveFrom: month, note, tracked },
      throwOnError: false,
    }),
  )
}

/** Stops budgeting a category from `month` on. */
export function removeBudget(categoryId: string, month: string) {
  return unwrap(
    budgetsControllerRemove({
      path: { categoryId },
      query: { from: month },
      throwOnError: false,
    }),
  )
}

/** Every budget view depends on the targets: refetch them all. */
export function afterBudgetsChanged(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: budgetKeys.all }),
    // The dashboard's « Budget » card follows the tracked lines.
    queryClient.invalidateQueries({ queryKey: envelopeKeys.all }),
  ])
}
