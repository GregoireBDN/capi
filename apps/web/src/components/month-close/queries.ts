import { queryOptions } from '@tanstack/react-query'
import {
  integrityControllerCheck,
  monthCloseControllerClose,
  monthCloseControllerGet,
  monthCloseControllerList,
  monthCloseControllerReopen,
  monthCloseControllerUpdate,
} from '#/api'
import type { UpdateMonthCloseDto } from '#/api/types.gen'
import { ApiRequestError, unwrap } from '#/lib/queries'

/**
 * Under the dashboard keys: what refreshes the dashboard after an import, a
 * correction or a value update (e.g. `afterSnapshotsChanged`) refreshes the
 * review steps too.
 */
export const monthCloseKeys = {
  month: (month: string) => ['dashboard', 'month-close', month] as const,
  integrity: (month: string) => ['dashboard', 'integrity', month] as const,
  closed: ['dashboard', 'closed-months'] as const,
}

/** Every closed month, for the month bar's state (#505). */
export const closedMonthsQuery = queryOptions({
  queryKey: monthCloseKeys.closed,
  queryFn: () => unwrap(monthCloseControllerList({ throwOnError: false })),
})

/** Steps, progress and report of `month`. Refetched on mount. */
export function monthCloseQuery(month: string) {
  return queryOptions({
    queryKey: monthCloseKeys.month(month),
    queryFn: () =>
      unwrap(monthCloseControllerGet({ path: { month }, throwOnError: false })),
    staleTime: 0,
  })
}

/**
 * Consistency checks of `month` (#427), a step of the review read on its own:
 * a slow or failed check never holds the other steps back.
 */
export function integrityQuery(month: string) {
  return queryOptions({
    queryKey: monthCloseKeys.integrity(month),
    queryFn: () =>
      unwrap(
        integrityControllerCheck({ query: { month }, throwOnError: false }),
      ),
    staleTime: 0,
  })
}

export function updateMonthClose(month: string, body: UpdateMonthCloseDto) {
  return unwrap(
    monthCloseControllerUpdate({ path: { month }, body, throwOnError: false }),
  )
}

export function closeMonth(month: string, notes: string | null) {
  return unwrap(
    monthCloseControllerClose({
      path: { month },
      body: { notes },
      throwOnError: false,
    }),
  )
}

export function reopenMonth(month: string) {
  return unwrap(
    monthCloseControllerReopen({ path: { month }, throwOnError: false }),
  )
}

/** French message for a failed request (API messages stay in logs). */
export function monthCloseErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 409)
    return 'Le mois a changé d’état entre-temps. Rechargez la page.'
  if (error.status === 400) return 'Ce mois ne peut pas encore être clôturé.'
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
