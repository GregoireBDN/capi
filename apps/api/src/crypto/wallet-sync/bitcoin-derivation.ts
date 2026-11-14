import { ripemd160 } from '@noble/hashes/legacy'
import { sha256 } from '@noble/hashes/sha2'
import { bech32, createBase58check } from '@scure/base'
import { HDKey } from '@scure/bip32'
import type { BitcoinKeyFormat } from '../wallet-keys/public-key'
import { checkPublicKey } from '../wallet-keys/public-key'

/**
 * Bitcoin addresses of an account-level extended public key (BIP32), derived
 * locally: nothing leaves the server here. `xpub` gives legacy P2PKH
 * addresses (BIP44), `ypub` nested SegWit P2SH-P2WPKH (BIP49) and `zpub`
 * native SegWit P2WPKH (BIP84). Branch 0 is the receive chain, 1 the change
 * chain.
 */

export type BitcoinBranch = 0 | 1

const base58check = createBase58check(sha256)

/** BIP32 version bytes of each format (mainnet), private then public. */
const VERSIONS: Record<BitcoinKeyFormat, { private: number; public: number }> =
  {
    xpub: { private: 0x0488ade4, public: 0x0488b21e },
    ypub: { private: 0x049d7878, public: 0x049d7cb2 },
    zpub: { private: 0x04b2430c, public: 0x04b24746 },
  }

const P2PKH_VERSION = 0x00
const P2SH_VERSION = 0x05

function hash160(data: Uint8Array): Uint8Array {
  return ripemd160(sha256(data))
}

function withVersion(version: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 1)
  out[0] = version
  out.set(payload, 1)
  return out
}

/** Address of a compressed public key in the format's script type. */
export function addressOf(
  format: BitcoinKeyFormat,
  publicKey: Uint8Array,
): string {
  const keyHash = hash160(publicKey)
  if (format === 'xpub') {
    return base58check.encode(withVersion(P2PKH_VERSION, keyHash))
  }
  if (format === 'zpub') {
    return bech32.encode('bc', [0, ...bech32.toWords(keyHash)])
  }
  // ypub: P2SH wrapping the witness program OP_0 <20-byte key hash>.
  const redeemScript = new Uint8Array(22)
  redeemScript[0] = 0x00
  redeemScript[1] = 0x14
  redeemScript.set(keyHash, 2)
  return base58check.encode(withVersion(P2SH_VERSION, hash160(redeemScript)))
}

/** Hard cap on derived addresses per branch, whatever the gap limit finds. */
export const MAX_ADDRESSES_PER_BRANCH = 2_000

/**
 * Derives addresses of one key, caching the branch keys and the addresses
 * already derived (derivation costs an elliptic-curve multiplication each).
 * The cache lives in memory only.
 */
export class BitcoinAddressDeriver {
  private readonly branches = new Map<string, HDKey>()
  private readonly addresses = new Map<string, string[]>()

  /**
   * Addresses `start` to `start + count - 1` of a branch. Throws on a key
   * that is not a valid mainnet xpub / ypub / zpub (never with the key in
   * the message).
   */
  derive(
    extendedKey: string,
    branch: BitcoinBranch,
    start: number,
    count: number,
  ): string[] {
    if (start < 0 || count < 0 || start + count > MAX_ADDRESSES_PER_BRANCH) {
      throw new RangeError('Address index out of range')
    }
    const cacheKey = `${branch}:${extendedKey}`
    const known = this.addresses.get(cacheKey) ?? []
    if (known.length < start + count) {
      const { format, node } = this.branch(extendedKey, branch)
      for (let index = known.length; index < start + count; index++) {
        const child = node.deriveChild(index)
        known.push(addressOf(format, child.publicKey!))
      }
      this.addresses.set(cacheKey, known)
    }
    return known.slice(start, start + count)
  }

  private branch(
    extendedKey: string,
    branch: BitcoinBranch,
  ): { format: BitcoinKeyFormat; node: HDKey } {
    const check = checkPublicKey(extendedKey)
    if (!check.ok || check.family !== 'bitcoin') {
      throw new Error('Not a Bitcoin extended public key')
    }
    const cacheKey = `${branch}:${extendedKey}`
    let node = this.branches.get(cacheKey)
    if (!node) {
      node = HDKey.fromExtendedKey(
        extendedKey,
        VERSIONS[check.format],
      ).deriveChild(branch)
      this.branches.set(cacheKey, node)
    }
    return { format: check.format, node }
  }
}
