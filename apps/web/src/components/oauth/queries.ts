import { queryOptions } from '@tanstack/react-query'
import {
  oAuthConsentControllerApprove,
  oAuthConsentControllerAudit,
  oAuthConsentControllerDeny,
  oAuthConsentControllerDetails,
  oAuthConsentControllerGrants,
  oAuthConsentControllerRevokeGrant,
  oAuthControllerMetadata,
} from '#/api'
import { ApiRequestError, unwrap } from '#/lib/queries'

/** The authorization request's parameters, as received in the page URL. */
export const AUTHORIZE_PARAMS = [
  'client_id',
  'redirect_uri',
  'response_type',
  'code_challenge',
  'code_challenge_method',
  'scope',
  'state',
  'resource',
] as const
export type AuthorizeParams = Partial<
  Record<(typeof AUTHORIZE_PARAMS)[number], string>
>

/** Keeps the known string parameters (the API checks their values). */
export function authorizeParams(
  search: Record<string, unknown>,
): AuthorizeParams {
  const params: AuthorizeParams = {}
  for (const key of AUTHORIZE_PARAMS) {
    const value = search[key]
    if (typeof value === 'string') params[key] = value
  }
  return params
}

export const oauthKeys = {
  all: ['oauth'] as const,
  details: (params: AuthorizeParams) => ['oauth', 'authorize', params] as const,
  grants: ['oauth', 'grants'] as const,
  audit: ['oauth', 'audit'] as const,
  metadata: ['oauth', 'metadata'] as const,
}

export const authorizationDetailsQuery = (params: AuthorizeParams) =>
  queryOptions({
    queryKey: oauthKeys.details(params),
    queryFn: () =>
      unwrap(
        oAuthConsentControllerDetails({ query: params, throwOnError: false }),
      ),
    retry: false,
    staleTime: Infinity,
  })

export const approveAuthorization = (
  params: AuthorizeParams,
  allowWrite: boolean,
) =>
  unwrap(
    oAuthConsentControllerApprove({
      body: { ...params, allowWrite },
      throwOnError: false,
    }),
  )

export const denyAuthorization = (params: AuthorizeParams) =>
  unwrap(oAuthConsentControllerDeny({ body: params, throwOnError: false }))

/** Calls read for an app's detail, filtered to the app (#329). */
export const AUDIT_LIMIT = 200

/**
 * Connected applications. A 404 means remote access is off on the server
 * (`REMOTE_MCP_ENABLED`): the profile then shows nothing about it.
 */
export const grantsQuery = queryOptions({
  queryKey: oauthKeys.grants,
  queryFn: async () => {
    try {
      return await unwrap(oAuthConsentControllerGrants({ throwOnError: false }))
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404) return null
      throw error
    }
  },
  staleTime: 0,
})

export const oauthAuditQuery = queryOptions({
  queryKey: oauthKeys.audit,
  queryFn: () =>
    unwrap(
      oAuthConsentControllerAudit({
        query: { limit: AUDIT_LIMIT },
        throwOnError: false,
      }),
    ),
  staleTime: 0,
})

/**
 * The connector's address for claude.ai (#329): the MCP adapter's public
 * origin (the issuer) and `/mcp`.
 */
export const connectorUrlQuery = queryOptions({
  queryKey: oauthKeys.metadata,
  queryFn: async () => {
    const metadata = await unwrap(
      oAuthControllerMetadata({ throwOnError: false }),
    )
    const issuer = (metadata as { issuer?: unknown } | null)?.issuer
    return typeof issuer === 'string'
      ? `${issuer.replace(/\/+$/, '')}/mcp`
      : null
  },
  staleTime: Infinity,
})

export const revokeGrant = (id: string) =>
  unwrap(
    oAuthConsentControllerRevokeGrant({ path: { id }, throwOnError: false }),
  )

/** French message for an authorization request the API refused. */
export function authorizationErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404)
    return 'L’accès à distance n’est pas activé sur ce serveur.'
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  if (error.status === 400) {
    switch (error.apiMessage) {
      case 'Unknown client':
        return 'Application inconnue : relancez la connexion depuis Claude.'
      case 'Invalid redirect URI':
        return 'Adresse de retour non autorisée pour cette application.'
      case 'Invalid resource':
        return 'Cette demande vise un autre serveur.'
      default:
        return 'Demande d’autorisation invalide : relancez la connexion depuis Claude.'
    }
  }
  return 'Une erreur est survenue. Réessayez.'
}

export function grantErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 404)
    return 'Cette connexion n’existe plus.'
  return authorizationErrorMessage(error)
}
