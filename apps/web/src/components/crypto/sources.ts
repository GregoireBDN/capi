import type {
  CryptoAccountSource,
  CryptoChain,
  CryptoExchangeProvider,
  CryptoHoldingOrigin,
  CryptoKeyFamily,
} from '#/api/types.gen'
import { ApiRequestError } from '#/lib/queries'

/** Where a crypto account's holdings come from, as shown to the owner. */
export const CRYPTO_SOURCE_LABELS: Record<CryptoAccountSource, string> = {
  exchange: 'Plateforme d’échange',
  wallet: 'Wallet',
  manual: 'Saisie manuelle',
}

export const CRYPTO_EXCHANGE_PROVIDER_LABELS: Record<
  CryptoExchangeProvider,
  string
> = {
  binance: 'Binance',
  coinbase: 'Coinbase',
  other: 'Autre plateforme',
}

/** Provider of an exchange from its display name (Kraken… = `other`). */
export function exchangeProviderOf(name: string): CryptoExchangeProvider {
  const key = name.trim().toLowerCase()
  return key === 'binance' || key === 'coinbase' ? key : 'other'
}

export const CRYPTO_CHAIN_LABELS: Record<CryptoChain, string> = {
  bitcoin: 'Bitcoin',
  ethereum: 'Ethereum',
  arbitrum: 'Arbitrum',
  base: 'Base',
  optimism: 'Optimism',
  polygon: 'Polygon',
  bsc: 'BNB Chain',
}

/** Chains an EVM address can be read on, in the order of the form. */
export const EVM_CHAINS: readonly CryptoChain[] = [
  'ethereum',
  'arbitrum',
  'base',
  'optimism',
  'polygon',
  'bsc',
]

/** Badge of a holding line computed from an import or a sync. */
export const DERIVED_ORIGIN_LABELS: Record<
  Exclude<CryptoHoldingOrigin, 'manual'>,
  string
> = {
  import: 'Importé',
  sync: 'Synchronisé',
}

const PRIVATE_KEY_MESSAGE =
  'C’est une clé privée : ne la saisissez jamais. Collez la clé publique (xpub, ypub, zpub) ou l’adresse 0x.'
const SEED_PHRASE_MESSAGE =
  'C’est une phrase de récupération : ne la saisissez jamais. Collez la clé publique (xpub, ypub, zpub) ou l’adresse 0x.'
const FORMAT_MESSAGE =
  'Clé non reconnue : collez une xpub, ypub ou zpub (Bitcoin) ou une adresse 0x (Ethereum et compatibles).'
const CHECKSUM_MESSAGE =
  'Clé invalide : elle contient une faute de frappe ou est incomplète. Copiez-la à nouveau.'
const TESTNET_MESSAGE =
  'Les clés de réseau de test ne sont pas prises en charge.'
const DUPLICATE_MESSAGE = 'Cette clé est déjà suivie par un compte.'

export type PublicKeyFormat =
  | { family: CryptoKeyFamily; error?: undefined; danger?: undefined }
  | {
      family?: undefined
      error: string
      /** A private key or a recovery phrase: flagged as soon as it is pasted. */
      danger?: boolean
    }

/**
 * Shape of a pasted public key, checked as it is typed: the family it belongs
 * to, or why it can't be one. Private keys and recovery phrases are refused
 * before anything is sent. The checksum is checked by the API on save.
 */
export function publicKeyFormat(input: string): PublicKeyFormat {
  const text = input.trim()
  if (text === '') return { error: 'Collez la clé publique du wallet' }
  if (/^[a-z]+(\s+[a-z]+){11,23}$/i.test(text))
    return { error: SEED_PHRASE_MESSAGE, danger: true }
  if (/^(0x)?[0-9a-f]{64}$/i.test(text) || /^[xyztuvXYZ]prv/.test(text))
    return { error: PRIVATE_KEY_MESSAGE, danger: true }
  if (/^[tuv]pub/.test(text)) return { error: TESTNET_MESSAGE }
  if (/^0x[0-9a-f]{40}$/i.test(text)) return { family: 'evm' }
  if (/^[xyz]pub[1-9A-HJ-NP-Za-km-z]{100,116}$/.test(text))
    return { family: 'bitcoin' }
  return { error: FORMAT_MESSAGE }
}

/**
 * French message for a public key the API refused (invalid key, already
 * tracked), or null when the error is about something else.
 */
export function walletKeyErrorMessage(error: unknown): string | null {
  if (!(error instanceof ApiRequestError)) return null
  const message = error.apiMessage ?? ''
  if (error.status === 409 && /public key/i.test(message))
    return DUPLICATE_MESSAGE
  if (error.status !== 400) return null
  if (/private key/i.test(message)) return PRIVATE_KEY_MESSAGE
  if (/recovery phrase/i.test(message)) return SEED_PHRASE_MESSAGE
  if (/checksum/i.test(message)) return CHECKSUM_MESSAGE
  if (/testnet/i.test(message)) return TESTNET_MESSAGE
  if (/Not a Bitcoin xpub/i.test(message)) return FORMAT_MESSAGE
  if (/at least one public key/i.test(message))
    return 'Un wallet garde au moins une clé : ajoutez-en une autre avant de retirer celle-ci.'
  return null
}

/** `xpub6612…cet8`: enough to recognize a key without showing all of it. */
export function maskPublicKey(key: string): string {
  return key.length <= 14 ? key : `${key.slice(0, 8)}…${key.slice(-6)}`
}
