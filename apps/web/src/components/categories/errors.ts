import { ApiRequestError } from '#/lib/queries'

/** French message for a failed category request (API messages stay in logs). */
export function categoryErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Cette catégorie n’existe plus.'
  if (error.status === 409) {
    return error.apiMessage?.includes('name')
      ? 'Une catégorie porte déjà ce nom.'
      : 'Cette catégorie est utilisée : choisissez où déplacer ses opérations.'
  }
  if (error.status === 400) return 'Vérifiez les informations saisies.'
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
