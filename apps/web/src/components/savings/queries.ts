import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  savingsControllerCreateGoal,
  savingsControllerListGoals,
  savingsControllerOverview,
  savingsControllerRemoveGoal,
  savingsControllerSetTarget,
  savingsControllerUpdateGoal,
} from '#/api'
import type { CreateGoalDto, UpdateGoalDto } from '#/api/types.gen'
import { unwrap } from '#/lib/queries'

/** Months in the savings chart (current one included). */
export const SAVINGS_MONTHS = 12

export const savingsKeys = {
  all: ['savings'] as const,
  overview: (months: number, month: string | null) =>
    ['savings', 'overview', months, month] as const,
  goals: (includeArchived: boolean) =>
    ['savings', 'goals', includeArchived] as const,
}

/**
 * Monthly savings, averages, target and stock; the headline figures for
 * `month` (absent: the month the API picks). Always refetched on mount.
 */
export function savingsOverviewQuery(month?: string, months = SAVINGS_MONTHS) {
  return queryOptions({
    queryKey: savingsKeys.overview(months, month ?? null),
    queryFn: () =>
      unwrap(
        savingsControllerOverview({
          query: { months, ...(month ? { month } : {}) },
          throwOnError: false,
        }),
      ),
    staleTime: 0,
  })
}

export function savingsGoalsQuery(includeArchived: boolean) {
  return queryOptions({
    queryKey: savingsKeys.goals(includeArchived),
    queryFn: () =>
      unwrap(
        savingsControllerListGoals({
          query: { includeArchived },
          throwOnError: false,
        }),
      ),
    staleTime: 0,
  })
}

/** Sets the monthly savings target (null clears it). */
export function saveTarget(monthlyTargetCents: number | null) {
  return unwrap(
    savingsControllerSetTarget({
      body: { monthlyTargetCents },
      throwOnError: false,
    }),
  )
}

export function createGoal(body: CreateGoalDto) {
  return unwrap(savingsControllerCreateGoal({ body, throwOnError: false }))
}

export function updateGoal(id: string, body: UpdateGoalDto) {
  return unwrap(
    savingsControllerUpdateGoal({ path: { id }, body, throwOnError: false }),
  )
}

export function removeGoal(id: string) {
  return unwrap(
    savingsControllerRemoveGoal({ path: { id }, throwOnError: false }),
  )
}

/** Goals and the target feed every savings view: refetch them all. */
export function afterSavingsChanged(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: savingsKeys.all })
}
