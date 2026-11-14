import { queryOptions } from '@tanstack/react-query'
import {
  passkeysControllerList,
  passkeysControllerRemove,
  passkeysControllerRename,
} from '#/api'
import { ApiRequestError, unwrap } from '#/lib/queries'

export const passkeyKeys = { all: ['passkeys'] as const }

export const passkeysQuery = queryOptions({
  queryKey: passkeyKeys.all,
  queryFn: () => unwrap(passkeysControllerList({ throwOnError: false })),
  staleTime: 0,
})

export const renamePasskey = (id: string, name: string) =>
  unwrap(
    passkeysControllerRename({
      path: { id },
      body: { name },
      throwOnError: false,
    }),
  )

export const revokePasskey = (id: string) =>
  unwrap(passkeysControllerRemove({ path: { id }, throwOnError: false }))

/** French message for a failed passkey request (API messages stay in logs). */
export function passkeyErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Cette passkey n’existe plus.'
  if (error.status === 400) return 'Nom invalide.'
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
