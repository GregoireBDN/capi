import type {
  BitcoinAddressType,
  CryptoAccountSource,
  CryptoChain,
  CryptoExchangeProvider,
  CryptoHoldingOrigin,
  WalletKeyAddressTypeChoice,
  WalletKeyFormat,
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

/** A token added by its contract (#269): no price provider id, no price. */
export function isContractAsset(assetId: string): boolean {
  return assetId.startsWith('erc20.')
}

/** Badge of a holding line computed from an import or a sync. */
export const DERIVED_ORIGIN_LABELS: Record<
  Exclude<CryptoHoldingOrigin, 'manual'>,
  string
> = {
  import: 'Importé',
  sync: 'Synchronisé',
}

/** Bitcoin address types, as shown to the owner. */
export const BITCOIN_ADDRESS_TYPE_LABELS: Record<BitcoinAddressType, string> = {
  legacy: 'Legacy (1…)',
  nested_segwit: 'SegWit (3…)',
  native_segwit: 'Native SegWit (bc1q…)',
  taproot: 'Taproot (bc1p…)',
}

/** Choices of an xpub's address type, in the order of the form. */
export const XPUB_ADDRESS_TYPE_OPTIONS: readonly {
  value: WalletKeyAddressTypeChoice
  label: string
  description: string
}[] = [
  {
    value: 'native_segwit',
    label: BITCOIN_ADDRESS_TYPE_LABELS.native_segwit,
    description: 'Le plus courant. Chemin 84’ dans Ledger Live.',
  },
  {
    value: 'nested_segwit',
    label: BITCOIN_ADDRESS_TYPE_LABELS.nested_segwit,
    description: 'Chemin 49’.',
  },
  {
    value: 'legacy',
    label: BITCOIN_ADDRESS_TYPE_LABELS.legacy,
    description: 'Chemin 44’.',
  },
  {
    value: 'detect',
    label: 'Je ne sais pas',
    description: 'Le type est trouvé à la première synchronisation.',
  },
]

/** "Où trouver ma clé ?", per wallet of the form (others: `default`). */
export const WALLET_KEY_HELP: Record<string, readonly string[]> = {
  Ledger: [
    'Bitcoin : dans Ledger Live, ouvrez le compte, puis ⋯ → Modifier le compte → Avancé, et copiez la clé « xpub… ». Le chemin affiché à côté (84’, 49’ ou 44’) donne le type d’adresses.',
    'Ethereum et compatibles : l’adresse 0x du compte (Recevoir).',
  ],
  Trezor: [
    'Bitcoin : dans Trezor Suite, ouvrez le compte, puis Détails → Afficher la xpub.',
    'Ethereum et compatibles : l’adresse 0x du compte (Recevoir).',
  ],
  MetaMask: [
    'Copiez l’adresse 0x affichée sous le nom du compte : elle sert pour Ethereum et tous les réseaux compatibles.',
  ],
  default: [
    'Bitcoin : la « clé publique étendue » (xpub, ypub ou zpub) du compte, souvent dans ses réglages avancés. À défaut, une adresse de réception (bc1…, 3…, 1…).',
    'Ethereum et compatibles : l’adresse 0x du compte.',
  ],
}

const NEVER = 'ne la saisissez jamais'
const PUBLIC_KEYS =
  'la clé publique (xpub, ypub, zpub), une adresse Bitcoin ou l’adresse 0x'
const PRIVATE_KEY_MESSAGE = `C’est une clé privée : ${NEVER}. Collez ${PUBLIC_KEYS}.`
const SEED_PHRASE_MESSAGE = `C’est une phrase de récupération : ${NEVER}. Collez ${PUBLIC_KEYS}.`
const FORMAT_MESSAGE =
  'Clé non reconnue : collez une xpub, ypub ou zpub, une adresse Bitcoin (bc1…, 3…, 1…) ou une adresse 0x (Ethereum et compatibles).'
const CHECKSUM_MESSAGE =
  'Clé ou adresse invalide : elle contient une faute de frappe ou est incomplète. Copiez-la à nouveau.'
const TESTNET_MESSAGE =
  'Les clés et adresses de réseau de test ne sont pas prises en charge.'
const DESCRIPTOR_MESSAGE =
  'C’est un descripteur de portefeuille : collez seulement la clé qu’il contient (xpub…).'
const DUPLICATE_MESSAGE = 'Cette clé est déjà suivie par un compte.'

export type PublicKeyFormat =
  | {
      family: 'bitcoin'
      /** Extended key prefix, or a single address. */
      kind: WalletKeyFormat
      /** The type of a single address (an extended key's is chosen). */
      addressType?: BitcoinAddressType
      error?: undefined
      danger?: undefined
    }
  | {
      family: 'evm'
      kind?: undefined
      addressType?: undefined
      error?: undefined
      danger?: undefined
    }
  | {
      family?: undefined
      kind?: undefined
      addressType?: undefined
      error: string
      /** A private key or a recovery phrase: flagged as soon as it is pasted. */
      danger?: boolean
    }

const BASE58 = '[1-9A-HJ-NP-Za-km-z]'
const BECH32 = '[02-9ac-hj-np-z]'

/** Type of a mainnet Bitcoin address from its shape, or null. */
function bitcoinAddressType(text: string): BitcoinAddressType | null {
  const lower = text.toLowerCase()
  // bech32 is single case.
  if (text === lower || text === text.toUpperCase()) {
    if (new RegExp(`^bc1q${BECH32}{38,58}$`).test(lower)) return 'native_segwit'
    if (new RegExp(`^bc1p${BECH32}{58}$`).test(lower)) return 'taproot'
  }
  if (new RegExp(`^1${BASE58}{25,33}$`).test(text)) return 'legacy'
  if (new RegExp(`^3${BASE58}{25,33}$`).test(text)) return 'nested_segwit'
  return null
}

/**
 * Shape of a pasted public key, checked as it is typed: what it is (an
 * extended key, a Bitcoin address, an EVM address), or why it can't be one.
 * Private keys and recovery phrases are refused before anything is sent.
 * Checksums are checked by the API on save.
 */
export function publicKeyFormat(input: string): PublicKeyFormat {
  const text = input.trim()
  if (text === '') return { error: 'Collez la clé publique du wallet' }
  if (/^[a-z]+(\s+[a-z]+){11,23}$/i.test(text))
    return { error: SEED_PHRASE_MESSAGE, danger: true }
  if (
    /^(0x)?[0-9a-f]{64}$/i.test(text) ||
    /^[xyztuvXYZ]prv/.test(text) ||
    new RegExp(`^[5KL]${BASE58}{50,51}$`).test(text)
  )
    return { error: PRIVATE_KEY_MESSAGE, danger: true }
  if (/^(sh\()?(pkh|wpkh|sh|wsh|tr|addr|combo|multi|sortedmulti)\(/i.test(text))
    return /[xyztuvXYZ]prv/.test(text)
      ? { error: PRIVATE_KEY_MESSAGE, danger: true }
      : { error: DESCRIPTOR_MESSAGE }
  if (/^[tuv]pub/.test(text) || /^(tb|bcrt)1/i.test(text))
    return { error: TESTNET_MESSAGE }
  if (/^0x[0-9a-f]{40}$/i.test(text)) return { family: 'evm' }
  const extended = new RegExp(`^([xyz]pub)${BASE58}{100,116}$`).exec(text)
  if (extended)
    return { family: 'bitcoin', kind: extended[1] as 'xpub' | 'ypub' | 'zpub' }
  const addressType = bitcoinAddressType(text)
  if (addressType) return { family: 'bitcoin', kind: 'address', addressType }
  if (new RegExp(`^[mn2]${BASE58}{25,34}$`).test(text))
    return { error: TESTNET_MESSAGE }
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
  if (/descriptor/i.test(message)) return DESCRIPTOR_MESSAGE
  if (/^Not a Bitcoin/i.test(message)) return FORMAT_MESSAGE
  if (/address type/i.test(message))
    return 'Ce type d’adresses ne correspond pas à la clé.'
  if (/at least one public key/i.test(message))
    return 'Un wallet garde au moins une clé : ajoutez-en une autre avant de retirer celle-ci.'
  return null
}

/**
 * What a saved Bitcoin key reads, for the key list: « Native SegWit (bc1q…) »,
 * « Adresse · Taproot (bc1p…) », or the detection still to come.
 */
export function walletKeyTypeLabel(key: {
  format?: WalletKeyFormat | null
  addressTypes?: BitcoinAddressType[] | null
  detectingAddressType?: boolean
}): string | null {
  if (!key.format) return null
  if (key.detectingAddressType)
    return 'Type d’adresses détecté à la prochaine synchronisation'
  const types = (key.addressTypes ?? [])
    .map((type) => BITCOIN_ADDRESS_TYPE_LABELS[type])
    .join(' + ')
  return key.format === 'address' ? `Adresse · ${types}` : types || null
}

/** `xpub6612…cet8`: enough to recognize a key without showing all of it. */
export function maskPublicKey(key: string): string {
  return key.length <= 14 ? key : `${key.slice(0, 8)}…${key.slice(-6)}`
}
