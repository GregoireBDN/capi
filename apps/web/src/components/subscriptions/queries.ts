import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import {
  recurringControllerConfirm,
  recurringControllerDetect,
  recurringControllerList,
  recurringControllerSummary,
  recurringControllerUpdate,
} from '#/api'
import type { UpdateRecurringItemDto } from '#/api/types.gen'
import { ApiRequestError, unwrap } from '#/lib/queries'

export const recurringKeys = {
  all: ['recurring'] as const,
  list: ['recurring', 'list'] as const,
  summary: ['recurring', 'summary'] as const,
}

/** Every item (suggested, confirmed, dismissed) with its stats. */
export const recurringListQuery = queryOptions({
  queryKey: recurringKeys.list,
  queryFn: () => unwrap(recurringControllerList({ throwOnError: false })),
  // Transactions change elsewhere (imports, review): refetch on mount.
  staleTime: 0,
})

export const recurringSummaryQuery = queryOptions({
  queryKey: recurringKeys.summary,
  queryFn: () => unwrap(recurringControllerSummary({ throwOnError: false })),
  staleTime: 0,
})

/** Runs the detection over every transaction. */
export function detectRecurring() {
  return unwrap(recurringControllerDetect({ throwOnError: false }))
}

export function updateRecurringItem(id: string, body: UpdateRecurringItemDto) {
  return unwrap(
    recurringControllerUpdate({ path: { id }, body, throwOnError: false }),
  )
}

export function confirmRecurringItems(ids: string[]) {
  return unwrap(
    recurringControllerConfirm({ body: { ids }, throwOnError: false }),
  )
}

/** The list and the totals depend on every change: refetch both. */
export function afterRecurringChanged(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: recurringKeys.all })
}

/** French message for a failed request (API messages stay in logs). */
export function recurringErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Cet élément n’existe plus.'
  if (error.status === 400) return 'Modification refusée : vérifiez les champs.'
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
