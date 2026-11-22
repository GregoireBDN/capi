import {
  accountCryptoImportsControllerPreview,
  cryptoImportsControllerCommit,
  cryptoImportsControllerRemove,
} from '#/api'
import type {
  CryptoAssetChoiceDto,
  CryptoImportDto,
  CryptoImportRowDto,
} from '#/api/types.gen'
import { ApiRequestError, unwrap } from '#/lib/queries'

/** Largest file the API accepts (mirrors `IMPORT_FILE_MAX_BYTES`). */
export const MAX_EXPORT_BYTES = 5 * 1024 * 1024

export function previewExport(accountId: string, file: File) {
  return unwrap(
    accountCryptoImportsControllerPreview({
      path: { id: accountId },
      body: { file },
      throwOnError: false,
    }),
  )
}

export function commitExport(importId: string, assets: CryptoAssetChoiceDto[]) {
  return unwrap(
    cryptoImportsControllerCommit({
      path: { id: importId },
      body: assets.length > 0 ? { assets } : {},
      throwOnError: false,
    }),
  )
}

export function discardExport(importId: string) {
  return unwrap(
    cryptoImportsControllerRemove({
      path: { id: importId },
      throwOnError: false,
    }),
  )
}

export const FORMAT_LABELS: Record<CryptoImportDto['format'], string> = {
  binance_csv: 'Binance',
  coinbase_csv: 'Coinbase',
  ledger_live_csv: 'Ledger Live',
}

export const KIND_LABELS: Record<CryptoImportRowDto['kind'], string> = {
  buy: 'Achat',
  sell: 'Vente',
  convert: 'Conversion',
  fee: 'Frais',
  deposit: 'Dépôt',
  withdrawal: 'Retrait',
  transfer_internal: 'Transfert interne',
  income: 'Revenu',
  other: 'Inconnue',
  observed_in: 'Arrivée',
  observed_out: 'Départ',
}

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const day = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** `10/01/2025 10:05`, Paris time. */
export function formatInstant(iso: string): string {
  return dateTime.format(new Date(iso))
}

/** "du 10 janv. 2025 au 7 févr. 2025" (Paris days), or null without lines. */
export function periodText(
  detail: Pick<CryptoImportDto, 'periodStart' | 'periodEnd'>,
): string | null {
  if (!detail.periodStart || !detail.periodEnd) return null
  const start = day.format(new Date(detail.periodStart))
  const end = day.format(new Date(detail.periodEnd))
  return start === end ? `le ${start}` : `du ${start} au ${end}`
}

/** "Lignes 3, 5 et 8" for the skipped lines. */
export function lineList(lines: number[]): string {
  if (lines.length === 1) return `Ligne ${lines[0]}`
  const shown = lines.slice(0, 10)
  const rest = lines.length - shown.length
  const text =
    rest > 0
      ? `${shown.join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}`
      : `${shown.slice(0, -1).join(', ')} et ${shown.at(-1)}`
  return `Lignes ${text}`
}

const NETWORK =
  'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.'

/** French message for a failed upload, commit or discard. */
export function exchangeImportErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError) || error.status === null) {
    return NETWORK
  }
  const message = error.apiMessage ?? ''
  switch (error.status) {
    case 400:
      if (message.startsWith('Not a Ledger Live')) {
        return 'Ce fichier n’est pas un historique des opérations exporté depuis Ledger Live (CSV).'
      }
      if (message.startsWith('This is a Ledger Live export')) {
        return 'Ce fichier est un historique Ledger Live : importez-le dans le compte du wallet.'
      }
      if (message.startsWith('Not a Binance or Coinbase')) {
        return 'Ce fichier n’est pas un export « Transactions » Binance ou Coinbase au format CSV.'
      }
      if (message.startsWith('This is a Binance export')) {
        return 'Ce fichier est un export Binance : importez-le dans le compte Binance.'
      }
      if (message.startsWith('This is a Coinbase export')) {
        return 'Ce fichier est un export Coinbase : importez-le dans le compte Coinbase.'
      }
      if (message.includes('archived')) {
        return 'Ce compte est archivé : il ne peut plus recevoir d’import.'
      }
      return 'Le fichier n’a pas pu être importé. Vérifiez qu’il s’agit bien d’un export « Transactions ».'
    case 401:
      return 'Votre session a expiré. Reconnectez-vous puis réessayez.'
    case 404:
      return 'Cet import n’existe plus. Envoyez à nouveau le fichier.'
    case 409:
      return 'Cet import a déjà été validé ou a expiré. Envoyez à nouveau le fichier.'
    case 413:
      return 'Le fichier dépasse la taille maximale de 5 Mo.'
    case 429:
      return 'Trop de requêtes. Réessayez dans un instant.'
    default:
      return 'Le serveur a rencontré une erreur. Réessayez dans un instant.'
  }
}
