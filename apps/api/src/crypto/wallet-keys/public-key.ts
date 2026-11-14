import { createHash } from 'node:crypto'
import { keccak_256 } from '@noble/hashes/sha3'
import type { CryptoKeyFamily } from '#/database/schema/domain-enums'

/**
 * Validation of wallet public keys before they are saved: Bitcoin extended
 * public keys (xpub, ypub, zpub: base58check with their version bytes) and EVM
 * addresses (`0x` + 40 hex digits, EIP-55 checksum when mixed case).
 *
 * Private keys and recovery phrases are recognized and refused with their own
 * reason, so the owner is told never to enter them. Nothing here logs or
 * returns the key in an error: a public key reveals the whole wallet.
 */

export type BitcoinKeyFormat = 'xpub' | 'ypub' | 'zpub'

export type PublicKeyError =
  /** An extended private key (xprv…) or a raw 32-byte private key. */
  | 'private_key'
  /** 12 to 24 words: a recovery phrase. */
  | 'seed_phrase'
  /** Right shape, wrong checksum (typo). */
  | 'checksum'
  /** A testnet key (tpub, upub, vpub). */
  | 'testnet'
  /** Neither an xpub / ypub / zpub nor a 0x address. */
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
      family: Extract<CryptoKeyFamily, 'evm'>
      format: 'address'
      /** EIP-55 checksummed address. */
      publicKey: string
    }
  | { ok: false; error: PublicKeyError }

/** API messages, one per reason (never containing the key). */
export const PUBLIC_KEY_ERROR_MESSAGES: Record<PublicKeyError, string> = {
  private_key:
    'This is a private key: never enter it. Use the extended public key (xpub, ypub, zpub) or the 0x address.',
  seed_phrase:
    'This is a recovery phrase: never enter it. Use the extended public key (xpub, ypub, zpub) or the 0x address.',
  checksum: 'The key checksum is wrong: check it for a typo.',
  testnet: 'Testnet keys are not supported.',
  format: 'Not a Bitcoin xpub, ypub or zpub, nor an EVM 0x address.',
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
  if (/^0x[0-9a-f]{40}$/i.test(text)) return checkEvmAddress(text)
  if (/^[a-zA-Z]{4}[1-9A-HJ-NP-Za-km-z]{100,120}$/.test(text)) {
    return checkExtendedKey(text)
  }
  return { ok: false, error: 'format' }
}
