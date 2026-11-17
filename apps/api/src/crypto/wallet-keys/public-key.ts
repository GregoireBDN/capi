import { createHash } from 'node:crypto'
import { keccak_256 } from '@noble/hashes/sha3'
import { bech32, bech32m } from '@scure/base'
import type {
  BitcoinAddressType,
  CryptoKeyFamily,
  DerivableAddressType,
} from '#/database/schema/domain-enums'

/**
 * Validation of wallet public keys before they are saved: Bitcoin extended
 * public keys (xpub, ypub, zpub: base58check with their version bytes),
 * single Bitcoin mainnet addresses (P2PKH `1…` and P2SH `3…` in base58check,
 * SegWit `bc1q…` in bech32 and Taproot `bc1p…` in bech32m, BIP173 / BIP350)
 * and EVM addresses (`0x` + 40 hex digits, EIP-55 checksum when mixed case).
 *
 * Private keys and recovery phrases are recognized and refused with their own
 * reason, so the owner is told never to enter them. Nothing here logs or
 * returns the key in an error: a public key reveals the whole wallet.
 */

export type BitcoinKeyFormat = 'xpub' | 'ypub' | 'zpub'

/** Address type an extended key's prefix stands for (SLIP-132). */
export const PREFIX_ADDRESS_TYPES: Record<
  BitcoinKeyFormat,
  DerivableAddressType
> = {
  xpub: 'legacy',
  ypub: 'nested_segwit',
  zpub: 'native_segwit',
}

export type PublicKeyError =
  /** An extended private key (xprv…), a WIF or a raw 32-byte private key. */
  | 'private_key'
  /** 12 to 24 words: a recovery phrase. */
  | 'seed_phrase'
  /** Right shape, wrong checksum (typo). */
  | 'checksum'
  /** A testnet key or address (tpub, upub, vpub, tb1…, m…, n…, 2…). */
  | 'testnet'
  /** An output descriptor (`wpkh([…]xpub…/0/*)`): the xpub alone is needed. */
  | 'descriptor'
  /** Neither a Bitcoin key or address nor a 0x address. */
  | 'format'

export type PublicKeyCheck =
  | {
      ok: true
      family: Extract<CryptoKeyFamily, 'bitcoin'>
      format: BitcoinKeyFormat
      /** The key as it will be stored. */
      publicKey: string
    }
  | {
      ok: true
      family: Extract<CryptoKeyFamily, 'bitcoin'>
      format: 'address'
      addressType: BitcoinAddressType
      /** The address as it will be stored (bech32 in lower case). */
      publicKey: string
    }
  | {
      ok: true
      family: Extract<CryptoKeyFamily, 'evm'>
      format: 'address'
      /** EIP-55 checksummed address. */
      publicKey: string
    }
  | { ok: false; error: PublicKeyError }

/** API messages, one per reason (never containing the key). */
export const PUBLIC_KEY_ERROR_MESSAGES: Record<PublicKeyError, string> = {
  private_key:
    'This is a private key: never enter it. Use the extended public key (xpub, ypub, zpub), a Bitcoin address or the 0x address.',
  seed_phrase:
    'This is a recovery phrase: never enter it. Use the extended public key (xpub, ypub, zpub), a Bitcoin address or the 0x address.',
  checksum: 'The key checksum is wrong: check it for a typo.',
  testnet: 'Testnet keys and addresses are not supported.',
  descriptor:
    'This is an output descriptor: paste the extended public key (xpub…) alone.',
  format:
    'Not a Bitcoin extended public key (xpub, ypub, zpub) or address, nor an EVM 0x address.',
}

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE58_INDEX = new Map(
  [...BASE58_ALPHABET].map((char, index) => [char, BigInt(index)]),
)

/** BIP32 serialized key: version, depth, fingerprint, child, chain code, key. */
const EXTENDED_KEY_BYTES = 78
const CHECKSUM_BYTES = 4

/** Version bytes (hex) of mainnet extended public keys (BIP32, BIP49, BIP84). */
const PUBLIC_VERSIONS: Record<string, BitcoinKeyFormat> = {
  '0488b21e': 'xpub',
  '049d7cb2': 'ypub',
  '04b24746': 'zpub',
}
/** Testnet extended public keys (tpub, upub, vpub). */
const TESTNET_PUBLIC_VERSIONS = new Set(['043587cf', '044a5262', '045f1cf6'])
/** Extended private keys, mainnet and testnet (xprv, yprv, zprv, Yprv, Zprv, tprv, uprv, vprv). */
const PRIVATE_VERSIONS = new Set([
  '0488ade4',
  '049d7878',
  '04b2430c',
  '0295b005',
  '02aa7a99',
  '04358394',
  '044a4e28',
  '045f18bc',
])

/** Base58check version bytes of mainnet / testnet addresses and WIF keys. */
const P2PKH_VERSION = 0x00
const P2SH_VERSION = 0x05
const TESTNET_ADDRESS_VERSIONS = new Set([0x6f, 0xc4])
const WIF_VERSIONS = new Set([0x80, 0xef])

/** Base58 to bytes (each leading `1` is a zero byte); null on a bad character. */
export function base58Decode(text: string): Uint8Array | null {
  let value = 0n
  for (const char of text) {
    const digit = BASE58_INDEX.get(char)
    if (digit === undefined) return null
    value = value * 58n + digit
  }
  const bytes: number[] = []
  while (value > 0n) {
    bytes.push(Number(value & 0xffn))
    value >>= 8n
  }
  for (const char of text) {
    if (char !== '1') break
    bytes.push(0)
  }
  return Uint8Array.from(bytes.reverse())
}

function sha256(data: Uint8Array): Buffer {
  return createHash('sha256').update(data).digest()
}

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

function checkExtendedKey(text: string): PublicKeyCheck {
  // An extended private key is refused even with a typo in it.
  if (/^[xyztuvXYZ]prv/.test(text)) return { ok: false, error: 'private_key' }
  const bytes = base58Decode(text)
  if (bytes === null || bytes.length !== EXTENDED_KEY_BYTES + CHECKSUM_BYTES) {
    return { ok: false, error: 'format' }
  }
  const payload = bytes.subarray(0, EXTENDED_KEY_BYTES)
  const checksum = bytes.subarray(EXTENDED_KEY_BYTES)
  const expected = sha256(sha256(payload)).subarray(0, CHECKSUM_BYTES)
  if (!expected.equals(checksum)) return { ok: false, error: 'checksum' }

  const version = hex(payload.subarray(0, 4))
  if (PRIVATE_VERSIONS.has(version)) return { ok: false, error: 'private_key' }
  if (TESTNET_PUBLIC_VERSIONS.has(version)) {
    return { ok: false, error: 'testnet' }
  }
  const format = PUBLIC_VERSIONS[version]
  // A public key is a compressed point: 0x02 or 0x03 then 32 bytes.
  const keyPrefix = payload[EXTENDED_KEY_BYTES - 33]
  if (!format || (keyPrefix !== 2 && keyPrefix !== 3)) {
    return { ok: false, error: 'format' }
  }
  return { ok: true, family: 'bitcoin', format, publicKey: text }
}

/** Payload of a base58check string, or null when the checksum is wrong. */
function base58check(text: string): Uint8Array | null {
  const bytes = base58Decode(text)
  if (bytes === null || bytes.length <= CHECKSUM_BYTES) return null
  const payload = bytes.subarray(0, bytes.length - CHECKSUM_BYTES)
  const expected = sha256(sha256(payload)).subarray(0, CHECKSUM_BYTES)
  return expected.equals(bytes.subarray(bytes.length - CHECKSUM_BYTES))
    ? payload
    : null
}

/** `1…` / `3…` addresses (and WIF private keys, refused). */
function checkBase58Address(text: string): PublicKeyCheck {
  const payload = base58check(text)
  if (payload === null) {
    // A WIF private key is refused even with a typo in it.
    if (/^[5KL9c]/.test(text) && text.length >= 51) {
      return { ok: false, error: 'private_key' }
    }
    return { ok: false, error: /^[13mn2]/.test(text) ? 'checksum' : 'format' }
  }
  const version = payload[0]
  if (
    WIF_VERSIONS.has(version) &&
    (payload.length === 33 || payload.length === 34)
  ) {
    return { ok: false, error: 'private_key' }
  }
  if (payload.length !== 21) return { ok: false, error: 'format' }
  if (TESTNET_ADDRESS_VERSIONS.has(version)) {
    return { ok: false, error: 'testnet' }
  }
  if (version === P2PKH_VERSION || version === P2SH_VERSION) {
    return {
      ok: true,
      family: 'bitcoin',
      format: 'address',
      addressType: version === P2PKH_VERSION ? 'legacy' : 'nested_segwit',
      publicKey: text,
    }
  }
  return { ok: false, error: 'format' }
}

/**
 * SegWit addresses: witness version 0 in bech32 (20-byte key hash or 32-byte
 * script hash), version 1 in bech32m (32-byte Taproot key). Later versions
 * are not standard yet and refused.
 */
function checkSegwitAddress(text: string): PublicKeyCheck {
  // Mixed case is invalid in bech32; stored in lower case.
  if (text !== text.toLowerCase() && text !== text.toUpperCase()) {
    return { ok: false, error: 'format' }
  }
  const address = text.toLowerCase()
  const hrp = address.slice(0, address.lastIndexOf('1'))
  if (hrp === 'tb' || hrp === 'bcrt') return { ok: false, error: 'testnet' }
  if (hrp !== 'bc') return { ok: false, error: 'format' }
  const version = address.charAt(3)
  const decoded =
    version === 'q'
      ? bech32.decodeUnsafe(address, 90)
      : bech32m.decodeUnsafe(address, 90)
  if (!decoded) return { ok: false, error: 'checksum' }
  const [witnessVersion, ...words] = decoded.words
  const program = bech32.fromWordsUnsafe(words)
  if (!program) return { ok: false, error: 'format' }
  const valid =
    (witnessVersion === 0 &&
      (program.length === 20 || program.length === 32)) ||
    (witnessVersion === 1 && program.length === 32)
  if (!valid) return { ok: false, error: 'format' }
  return {
    ok: true,
    family: 'bitcoin',
    format: 'address',
    addressType: witnessVersion === 0 ? 'native_segwit' : 'taproot',
    publicKey: address,
  }
}

/** EIP-55: a hex letter is upper case when its nibble of keccak256(lowercase address) is ≥ 8. */
export function toChecksumAddress(address: string): string {
  const lower = address.slice(2).toLowerCase()
  const hash = hex(keccak_256(new TextEncoder().encode(lower)))
  let out = '0x'
  for (let i = 0; i < lower.length; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i]
  }
  return out
}

function checkEvmAddress(text: string): PublicKeyCheck {
  const digits = text.slice(2)
  const singleCase =
    digits === digits.toLowerCase() || digits === digits.toUpperCase()
  const checksummed = toChecksumAddress(text)
  // All lower or all upper case carries no checksum (EIP-55): accepted and
  // stored checksummed. Mixed case must match it.
  if (!singleCase && checksummed !== `0x${digits}`) {
    return { ok: false, error: 'checksum' }
  }
  return { ok: true, family: 'evm', format: 'address', publicKey: checksummed }
}

/** Checks a public key typed or pasted by the owner (surrounding spaces ignored). */
export function checkPublicKey(input: string): PublicKeyCheck {
  const text = input.trim()
  if (/^[a-z]+(\s+[a-z]+){11,23}$/i.test(text)) {
    return { ok: false, error: 'seed_phrase' }
  }
  if (/^(0x)?[0-9a-f]{64}$/i.test(text)) {
    return { ok: false, error: 'private_key' }
  }
  if (
    /^(sh\()?(pkh|wpkh|sh|wsh|tr|addr|combo|multi|sortedmulti)\(/i.test(text)
  ) {
    return /[xyztuvXYZ]prv/.test(text)
      ? { ok: false, error: 'private_key' }
      : { ok: false, error: 'descriptor' }
  }
  if (/^0x[0-9a-f]{40}$/i.test(text)) return checkEvmAddress(text)
  if (/^[a-zA-Z]{4}[1-9A-HJ-NP-Za-km-z]{100,120}$/.test(text)) {
    return checkExtendedKey(text)
  }
  if (/^(bc|tb|bcrt)1[02-9ac-hj-np-z]{39,87}$/i.test(text)) {
    return checkSegwitAddress(text)
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{25,52}$/.test(text)) {
    return checkBase58Address(text)
  }
  return { ok: false, error: 'format' }
}
