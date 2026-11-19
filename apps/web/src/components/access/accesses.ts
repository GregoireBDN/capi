import type {
  AccessTokenDto,
  AccessTokenScope,
  OAuthGrantDto,
} from '#/api/types.gen'

/**
 * One row of « Accès actifs » (#329): a personal access token (Claude on a
 * Mac, a script) or an app connected through OAuth (claude.ai, the phone).
 */
export interface AccessItem {
  /** Unique across both kinds. */
  key: string
  kind: 'token' | 'app'
  id: string
  name: string
  scope: AccessTokenScope
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  expired: boolean
  /** Where a connected app sends its sign-in back (`claude.ai`). */
  host?: string
}

/** Tokens and connected apps in one list, the last used first. */
export function mergeAccesses(
  tokens: readonly AccessTokenDto[],
  grants: readonly OAuthGrantDto[] | null | undefined,
  now: Date,
): AccessItem[] {
  const items: AccessItem[] = [
    ...tokens.map(
      (token): AccessItem => ({
        key: `token:${token.id}`,
        kind: 'token',
        id: token.id,
        name: token.name,
        scope: token.scope,
        createdAt: token.createdAt,
        lastUsedAt: token.lastUsedAt,
        expiresAt: token.expiresAt,
        expired: token.expired,
      }),
    ),
    ...(grants ?? []).map(
      (grant): AccessItem => ({
        key: `app:${grant.id}`,
        kind: 'app',
        id: grant.id,
        name: grant.clientName,
        scope: grant.scope,
        createdAt: grant.createdAt,
        lastUsedAt: grant.lastUsedAt,
        expiresAt: grant.expiresAt,
        expired: Date.parse(grant.expiresAt) <= now.getTime(),
        host: grant.redirectHost,
      }),
    ),
  ]
  const recency = (item: AccessItem) =>
    Date.parse(item.lastUsedAt ?? item.createdAt)
  // Expired ones last: they no longer work, they are only there to be removed.
  return items.sort(
    (a, b) => Number(a.expired) - Number(b.expired) || recency(b) - recency(a),
  )
}
