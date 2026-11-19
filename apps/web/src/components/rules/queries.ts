import type { QueryClient } from '@tanstack/react-query'
import { queryOptions } from '@tanstack/react-query'
import {
  categorizationRulesControllerApply,
  categorizationRulesControllerCreate,
  categorizationRulesControllerInsights,
  categorizationRulesControllerList,
  categorizationRulesControllerMatches,
  categorizationRulesControllerPrefer,
  categorizationRulesControllerPreview,
  categorizationRulesControllerRemove,
  categorizationRulesControllerReorder,
  categorizationRulesControllerUpdate,
} from '#/api'
import type {
  CategorizationRuleMatchesQueryDto,
  CreateCategorizationRuleDto,
  PreviewCategorizationRuleDto,
  UpdateCategorizationRuleDto,
} from '#/api/types.gen'
import { unwrap } from '#/lib/queries'
import { refreshReviewCount } from '#/lib/review-count'

export const rulesKey = ['categorization-rules'] as const

/** Rules in evaluation order (first match wins), with their `rank`. */
export const rulesQuery = queryOptions({
  queryKey: rulesKey,
  queryFn: () =>
    unwrap(categorizationRulesControllerList({ throwOnError: false })),
})

/** Match counts over 12 months and conflicts between rules (#299). */
export const rulesInsightsQuery = queryOptions({
  queryKey: [...rulesKey, 'insights'] as const,
  queryFn: () =>
    unwrap(categorizationRulesControllerInsights({ throwOnError: false })),
})

/** What some conditions catch over 12 months, for the editor's first step. */
export const ruleMatchesQuery = (body: CategorizationRuleMatchesQueryDto) =>
  queryOptions({
    queryKey: [...rulesKey, 'matches', body] as const,
    queryFn: () =>
      unwrap(
        categorizationRulesControllerMatches({ body, throwOnError: false }),
      ),
  })

/** What saving a rule and applying the rules would change. */
export const rulePreviewQuery = (body: PreviewCategorizationRuleDto) =>
  queryOptions({
    queryKey: [...rulesKey, 'preview', body] as const,
    queryFn: () =>
      unwrap(
        categorizationRulesControllerPreview({ body, throwOnError: false }),
      ),
  })

export const createRule = (body: CreateCategorizationRuleDto) =>
  unwrap(categorizationRulesControllerCreate({ body, throwOnError: false }))

export const updateRule = (id: string, body: UpdateCategorizationRuleDto) =>
  unwrap(
    categorizationRulesControllerUpdate({
      path: { id },
      body,
      throwOnError: false,
    }),
  )

export const deleteRule = (id: string) =>
  unwrap(
    categorizationRulesControllerRemove({ path: { id }, throwOnError: false }),
  )

/** Sets the evaluation order by hand: every rule id, first = evaluated first. */
export const reorderRules = (ids: string[]) =>
  unwrap(
    categorizationRulesControllerReorder({
      body: { ids },
      throwOnError: false,
    }),
  )

/** Makes rule `id` win the transactions it shares with `overRuleId`. */
export const preferRule = (id: string, overRuleId: string) =>
  unwrap(
    categorizationRulesControllerPrefer({
      path: { id },
      body: { overRuleId },
      throwOnError: false,
    }),
  )

export const applyRules = () =>
  unwrap(categorizationRulesControllerApply({ throwOnError: false }))

/**
 * Applying or deleting rules re-categorizes transactions: every page (totals,
 * review queue and its badge, budget) may change, so refetch everything.
 */
export async function afterTransactionsChanged(queryClient: QueryClient) {
  await Promise.all([queryClient.invalidateQueries(), refreshReviewCount()])
}
