import { ApiRequestError } from '#/lib/queries'

/** French message for a failed rule request (API messages stay in logs). */
export function ruleErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.'
  }
  if (error.status === 401) return 'Votre session a expiré. Reconnectez-vous.'
  if (error.status === 404) return 'Cette règle n’existe plus.'
  if (error.status === 400) {
    const message = error.apiMessage ?? ''
    if (message.includes('regular expression')) {
      return 'Cette expression régulière n’est pas valide.'
    }
    if (message.includes('letter or digit')) {
      return 'Le motif doit contenir au moins une lettre ou un chiffre.'
    }
    if (message.includes('minAmountCents')) {
      return 'Le montant minimum dépasse le maximum.'
    }
    if (message.includes('exactly once')) {
      return 'La liste des règles a changé. Rechargez la page.'
    }
    if (message.includes('categoryId')) return 'Cette catégorie n’existe plus.'
    if (message.includes('accountId')) return 'Ce compte n’existe plus.'
    return 'Vérifiez les informations saisies.'
  }
  if (error.status === 429)
    return 'Trop de requêtes. Réessayez dans un instant.'
  return 'Une erreur est survenue. Réessayez.'
}
