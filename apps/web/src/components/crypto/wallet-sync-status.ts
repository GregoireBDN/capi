import type {
  WalletSyncChainFailureDto,
  WalletSyncFailure,
  WalletSyncStatusDto,
} from '#/api/types.gen'
import { CRYPTO_CHAIN_LABELS } from './sources'

/** Why a chain could not be read, as the account page says it (#250). */
export const WALLET_SYNC_FAILURE_LABELS: Record<WalletSyncFailure, string> = {
  rate_limited: 'trop de requêtes',
  timeout: 'délai dépassé',
  network: 'service injoignable',
  http: 'erreur du service',
  malformed: 'réponse illisible',
  rpc: 'réponse illisible',
  wrong_chain: 'le service lit une autre chaîne',
  tokens: 'contrats des jetons introuvables',
  unexpected: 'erreur inattendue',
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const timeFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
})
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

/** "à 10:31" today (Europe/Paris), "le 7 novembre à 10:31" otherwise. */
export function retryTimeText(retryAt: string, now: Date = new Date()): string {
  const at = new Date(retryAt)
  return dayFormat.format(at) === dayFormat.format(now)
    ? `à ${timeFormat.format(at)}`
    : `le ${dateTimeFormat.format(at)}`
}

/** A retry time still to come, or null. */
function pendingRetry(retryAt: string | null, now: Date): string | null {
  return retryAt !== null && new Date(retryAt).getTime() > now.getTime()
    ? retryAt
    : null
}

/** "Bitcoin : trop de requêtes, nouvel essai possible à 10:31". */
export function chainFailureText(
  failure: WalletSyncChainFailureDto,
  now: Date = new Date(),
): string {
  const retryAt = pendingRetry(failure.retryAt, now)
  return (
    `${CRYPTO_CHAIN_LABELS[failure.chain]} : ` +
    WALLET_SYNC_FAILURE_LABELS[failure.reason] +
    (retryAt ? `, nouvel essai possible ${retryTimeText(retryAt, now)}` : '')
  )
}

/** "Prochain essai possible à 10:31" while a rate-limit backoff runs. */
export function nextAttemptText(
  sync: WalletSyncStatusDto,
  now: Date = new Date(),
): string | null {
  const retryAt = pendingRetry(sync.retryAt, now)
  return retryAt
    ? `Prochain essai possible ${retryTimeText(retryAt, now)}`
    : null
}

/** Whether some chains were read by the attempt that failed on others. */
export function partialSync(sync: WalletSyncStatusDto): boolean {
  return (
    sync.failedAt !== null &&
    sync.syncedAt !== null &&
    new Date(sync.syncedAt).getTime() === new Date(sync.failedAt).getTime()
  )
}

/** The toast after "Synchroniser" when chains could not be read. */
export function syncFailedToast(
  sync: WalletSyncStatusDto,
  now: Date = new Date(),
): string {
  const chains = sync.failedChains.map((f) => CRYPTO_CHAIN_LABELS[f.chain])
  const what =
    chains.length > 0
      ? `Lecture impossible pour ${chains.join(', ')}`
      : 'Synchronisation impossible pour le moment'
  const retryAt = pendingRetry(sync.retryAt, now)
  const when = retryAt
    ? ` (nouvel essai possible ${retryTimeText(retryAt, now)})`
    : ''
  const kept =
    chains.length > 0 && partialSync(sync)
      ? 'leurs derniers avoirs connus sont conservés, les autres chaînes sont à jour.'
      : 'les derniers avoirs connus sont conservés.'
  return `${what}${when} : ${kept}`
}
