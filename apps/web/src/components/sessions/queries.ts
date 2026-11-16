import { queryOptions } from '@tanstack/react-query'
import { sessionsControllerList, sessionsControllerRevoke } from '#/api'
import { ApiRequestError, unwrap } from '#/lib/queries'

export const sessionKeys = { all: ['sessions'] as const }

export const sessionsQuery = queryOptions({
  queryKey: sessionKeys.all,
  queryFn: () => unwrap(sessionsControllerList({ throwOnError: false })),
  staleTime: 0,
})

export const revokeSession = (id: string) =>
  unwrap(sessionsControllerRevoke({ path: { id }, throwOnError: false }))

/** French message for a failed sessions request (API messages stay in logs). */
export function sessionErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Cette session est déjà terminée.'
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
