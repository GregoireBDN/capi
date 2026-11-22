import { ApiRequestError } from './api'

const NETWORK =
  'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.'
const SESSION = 'Votre session a expiré. Reconnectez-vous puis réessayez.'
const SERVER = 'Le serveur a rencontré une erreur. Réessayez dans un instant.'

/** Start of the API's 400 for a file no format reads (#431). */
const UNRECOGNISED = 'Unrecognised CSV format'

/** Whether a failed preview is a file of a format the app does not know yet. */
export function isUnrecognisedFormat(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    error.status === 400 &&
    (error.apiMessage ?? '').startsWith(UNRECOGNISED)
  )
}

/** French message for a failed `POST /imports/preview`. */
export function uploadErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return NETWORK
  }
  const message = error.apiMessage ?? ''
  switch (error.status) {
    case 400:
      if (message.startsWith(UNRECOGNISED)) {
        return 'Ce fichier n’est dans aucun format connu.'
      }
      if (message.includes('investment movements')) {
        return 'Ce fichier contient des mouvements de placement : il ne s’importe pas sur un compte bancaire.'
      }
      if (message.startsWith('Missing column')) {
        return 'Il manque à ce fichier une colonne du format enregistré pour cette source.'
      }
      if (message === 'The file is empty') return 'Le fichier est vide.'
      if (message.includes('not valid UTF-8')) {
        return 'Le fichier n’est pas dans l’encodage attendu par son format enregistré.'
      }
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
      return 'Le fichier n’a pas pu être lu. Vérifiez qu’il s’agit bien d’un export CSV de votre banque.'
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

/** French message for a failed `POST /import-profiles`. */
export function profileErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return NETWORK
  }
  const message = error.apiMessage ?? ''
  switch (error.status) {
    case 409:
      return 'Un format enregistré lit déjà ces colonnes.'
    case 400:
      if (message.includes('already read without a profile')) {
        return 'Ce fichier est déjà reconnu : importez-le directement.'
      }
      if (message.includes('amount') || message.includes('debit')) {
        return 'Choisissez une colonne de montant, ou une colonne de débit et une de crédit.'
      }
      if (message.includes('already mapped')) {
        return 'Une même colonne est choisie deux fois.'
      }
      return 'Ce format n’a pas pu être enregistré : vérifiez les colonnes choisies.'
    case 401:
      return SESSION
    default:
      return error.status >= 502 && error.status <= 504 ? NETWORK : SERVER
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
