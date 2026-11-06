import { ApiRequestError } from '#/lib/queries'

/** French message for a failed savings request (API messages stay in logs). */
export function savingsErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Cet objectif n’existe plus.'
  if (error.status === 400) return 'Données invalides. Vérifiez le formulaire.'
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
