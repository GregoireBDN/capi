import { ApiRequestError } from '#/lib/queries'

/** French message for a failed budget request (API messages stay in logs). */
export function budgetErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Cette catégorie n’existe plus.'
  if (error.status === 400) {
    return 'Seules les catégories de dépenses et de revenus peuvent avoir un budget.'
  }
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
