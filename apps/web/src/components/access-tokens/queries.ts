import { queryOptions } from '@tanstack/react-query'
import {
  accessTokensControllerAudit,
  accessTokensControllerCreate,
  accessTokensControllerList,
  accessTokensControllerRevoke,
} from '#/api'
import type { CreateAccessTokenDto } from '#/api/types.gen'
import { ApiRequestError, unwrap } from '#/lib/queries'

export const AUDIT_LIMIT = 20

export const accessTokenKeys = {
  all: ['access-tokens'] as const,
  list: ['access-tokens', 'list'] as const,
  audit: ['access-tokens', 'audit'] as const,
}

export const accessTokensQuery = queryOptions({
  queryKey: accessTokenKeys.list,
  queryFn: () => unwrap(accessTokensControllerList({ throwOnError: false })),
  staleTime: 0,
})

export const accessTokenAuditQuery = queryOptions({
  queryKey: accessTokenKeys.audit,
  queryFn: () =>
    unwrap(
      accessTokensControllerAudit({
        query: { limit: AUDIT_LIMIT },
        throwOnError: false,
      }),
    ),
  staleTime: 0,
})

export const createAccessToken = (body: CreateAccessTokenDto) =>
  unwrap(accessTokensControllerCreate({ body, throwOnError: false }))

export const revokeAccessToken = (id: string) =>
  unwrap(accessTokensControllerRevoke({ path: { id }, throwOnError: false }))

/** French message for a failed token request (API messages stay in logs). */
export function accessTokenErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Ce jeton n’existe plus.'
  if (error.status === 400) {
    return error.apiMessage?.startsWith('At most')
      ? 'Trop de jetons actifs. Révoquez-en un avant d’en créer un autre.'
      : 'Données invalides. Vérifiez le formulaire.'
  }
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
