import type { QueryClient } from '@tanstack/react-query'
import { queryOptions } from '@tanstack/react-query'
import {
  categorizationRulesControllerApply,
  categorizationRulesControllerCreate,
  categorizationRulesControllerList,
  categorizationRulesControllerPreview,
  categorizationRulesControllerRemove,
  categorizationRulesControllerReorder,
  categorizationRulesControllerUpdate,
} from '#/api'
import type {
  CreateCategorizationRuleDto,
  PreviewCategorizationRuleDto,
  UpdateCategorizationRuleDto,
} from '#/api/types.gen'
import { unwrap } from '#/lib/queries'
import { refreshReviewCount } from '#/lib/review-count'

export const rulesKey = ['categorization-rules'] as const

/** Rules in evaluation order (first match wins). */
export const rulesQuery = queryOptions({
  queryKey: rulesKey,
  queryFn: () =>
    unwrap(categorizationRulesControllerList({ throwOnError: false })),
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

export const reorderRules = (ids: string[]) =>
  unwrap(
    categorizationRulesControllerReorder({
      body: { ids },
      throwOnError: false,
    }),
  )

export const previewRule = (body: PreviewCategorizationRuleDto) =>
  unwrap(categorizationRulesControllerPreview({ body, throwOnError: false }))

export const applyRules = () =>
  unwrap(categorizationRulesControllerApply({ throwOnError: false }))

/**
 * Applying or deleting rules re-categorizes transactions: every page (totals,
 * review queue and its badge, budget) may change, so refetch everything.
 */
export async function afterTransactionsChanged(queryClient: QueryClient) {
  await Promise.all([queryClient.invalidateQueries(), refreshReviewCount()])
}
