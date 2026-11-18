import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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

/** How long a toast offers « Annuler ». */
export const UNDO_TOAST_MS = 8_000

/**
 * Success toast of a cancellation or reactivation whose « Annuler » puts
 * back the item's previous end date and notes.
 */
export function undoableRecurringToast(
  queryClient: QueryClient,
  message: string,
  id: string,
  previous: { endedOn: string | null; notes?: string | null },
) {
  void afterRecurringChanged(queryClient)
  let undone = false
  toast.success(message, {
    duration: UNDO_TOAST_MS,
    action: {
      label: 'Annuler',
      onClick: () => {
        if (undone) return
        undone = true
        void updateRecurringItem(id, previous)
          .then(() => afterRecurringChanged(queryClient))
          .catch(() => toast.error('Impossible d’annuler la modification.'))
      },
    },
  })
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
