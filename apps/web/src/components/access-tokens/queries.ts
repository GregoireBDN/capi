import { queryOptions } from '@tanstack/react-query'
import {
  accessTokensControllerAudit,
  accessTokensControllerCreate,
  accessTokensControllerList,
  accessTokensControllerRename,
  accessTokensControllerRevoke,
} from '#/api'
import type { CreateAccessTokenDto } from '#/api/types.gen'
import { ApiRequestError, unwrap } from '#/lib/queries'

/** Calls shown in an access's detail (#329). */
export const AUDIT_LIMIT = 50

export const accessTokenKeys = {
  all: ['access-tokens'] as const,
  list: ['access-tokens', 'list'] as const,
  audit: (tokenId: string) => ['access-tokens', 'audit', tokenId] as const,
}

export const accessTokensQuery = queryOptions({
  queryKey: accessTokenKeys.list,
  queryFn: () => unwrap(accessTokensControllerList({ throwOnError: false })),
  staleTime: 0,
})

/** The latest calls of one token, newest first. */
export const accessTokenAuditQuery = (tokenId: string) =>
  queryOptions({
    queryKey: accessTokenKeys.audit(tokenId),
    queryFn: () =>
      unwrap(
        accessTokensControllerAudit({
          query: { limit: AUDIT_LIMIT, tokenId },
          throwOnError: false,
        }),
      ),
    staleTime: 0,
  })

export const createAccessToken = (body: CreateAccessTokenDto) =>
  unwrap(accessTokensControllerCreate({ body, throwOnError: false }))

export const renameAccessToken = (id: string, name: string) =>
  unwrap(
    accessTokensControllerRename({
      path: { id },
      body: { name },
      throwOnError: false,
    }),
  )

export const revokeAccessToken = (id: string) =>
  unwrap(accessTokensControllerRevoke({ path: { id }, throwOnError: false }))

/** French message for a failed token request (API messages stay in logs). */
export function accessTokenErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Cet accès n’existe plus.'
  if (error.status === 400) {
    return error.apiMessage?.startsWith('At most')
      ? 'Trop d’accès actifs. Révoquez-en un avant d’en créer un autre.'
      : 'Données invalides. Vérifiez le nom.'
  }
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
