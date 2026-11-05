import { ApiRequestError } from './api'

const NETWORK =
  'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.'
const SESSION = 'Votre session a expiré. Reconnectez-vous puis réessayez.'
const SERVER = 'Le serveur a rencontré une erreur. Réessayez dans un instant.'

/** French message for a failed `POST /imports/preview`. */
export function uploadErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return NETWORK
  }
  const message = error.apiMessage ?? ''
  switch (error.status) {
    case 400:
      if (message.startsWith('Not a CIC CSV export')) {
        return message.includes('empty')
          ? 'Le fichier est vide.'
          : 'Ce fichier n’est pas un export CSV CIC. Téléchargez les opérations au format CSV depuis votre espace CIC.'
      }
      if (message.includes('checking or savings')) {
        return 'Ce compte ne peut pas recevoir d’import : choisissez un compte courant ou un livret.'
      }
      if (message.includes('archived')) {
        return 'Ce compte est archivé : il ne peut plus recevoir d’import.'
      }
      if (message.includes('accountId')) {
        return 'Compte introuvable. Rechargez la page puis réessayez.'
      }
      return 'Le fichier n’a pas pu être lu. Vérifiez qu’il s’agit bien d’un export CSV CIC.'
    case 401:
      return SESSION
    case 413:
      return 'Le fichier dépasse la taille maximale de 5 Mo.'
    case 415:
      return 'Le fichier n’a pas pu être envoyé. Réessayez.'
    case 502:
    case 503:
    case 504:
      return NETWORK
    default:
      return SERVER
  }
}

/** French message for a failed commit. */
export function commitErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return NETWORK
  }
  switch (error.status) {
    case 409:
      return error.apiMessage?.includes('outdated')
        ? 'Cet aperçu est périmé : importez à nouveau le fichier.'
        : 'Cet import a déjà été validé.'
    case 404:
      return 'Cet aperçu a expiré : importez à nouveau le fichier.'
    case 400:
      return 'Certains choix ne sont plus valides : importez à nouveau le fichier.'
    case 401:
      return SESSION
    default:
      return error.status >= 502 && error.status <= 504 ? NETWORK : SERVER
  }
}

/** Generic French message for the other calls (accounts, history, delete). */
export function genericErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return NETWORK
  }
  if (error.status === 401) return SESSION
  if (error.status === 404) return 'Cet import n’existe plus.'
  return error.status >= 502 && error.status <= 504 ? NETWORK : SERVER
}
