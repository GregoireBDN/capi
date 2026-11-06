import { ApiRequestError } from '#/lib/queries'

/** French message for a failed snapshot request (API messages stay in logs). */
export function snapshotErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Cette valeur ou ce compte n’existe plus.'
  if (error.status === 400) {
    return 'Valeur refusée : vérifiez la date (pas dans le futur) et les montants. Un compte archivé ne peut pas être modifié.'
  }
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
