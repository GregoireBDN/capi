/**
 * The state each row of the Réglages list shows under its name (#300):
 * short French phrases, counts spelt out (« aucune passkey », « 1 session »).
 */

/** « aucune passkey », « 1 passkey », « 3 passkeys ». */
export function countLabel(
  count: number,
  singular: string,
  plural: string,
  none: string,
): string {
  if (count === 0) return none
  return `${count} ${count === 1 ? singular : plural}`
}

/** Sécurité: the password is always there, then passkeys and sessions. */
export function securitySummary(
  passkeys: number | undefined,
  sessions: number | undefined,
): string {
  const parts = ['Mot de passe']
  if (passkeys !== undefined)
    parts.push(countLabel(passkeys, 'passkey', 'passkeys', 'aucune passkey'))
  if (sessions !== undefined)
    parts.push(countLabel(sessions, 'session', 'sessions', 'aucune session'))
  return parts.join(', ')
}

/**
 * Claude et accès: every access in one count (#329), the personal access
 * tokens and the connected apps (`apps` is null when the server has remote
 * access off).
 */
export function accessSummary(tokens: number, apps: number | null): string {
  return countLabel(
    tokens + (apps ?? 0),
    'accès actif',
    'accès actifs',
    'Aucun accès',
  )
}
