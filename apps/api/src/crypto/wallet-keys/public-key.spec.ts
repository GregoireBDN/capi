import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { base58Decode, checkPublicKey, toChecksumAddress } from './public-key'

/**
 * Synthetic keys only: the published BIP32 / EIP-55 test vectors, and
 * extended keys built here from fixed fake bytes.
 */

/** BIP32 test vector 1, chain m. */
const BIP32_XPUB =
  'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8'
const BIP32_XPRV =
  'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest()
}

/** Independent base58check encoder, to build fake extended keys. */
function base58check(payload: Buffer): string {
  const data = Buffer.concat([payload, sha256(sha256(payload)).subarray(0, 4)])
  let value = BigInt(`0x${data.toString('hex')}`)
  let out = ''
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out
    value /= 58n
  }
  for (const byte of data) {
    if (byte !== 0) break
    out = `1${out}`
  }
  return out
}

/** A fake extended key with the given version bytes and key prefix byte. */
function fakeExtendedKey(version: string, keyPrefix = 0x02): string {
  const payload = Buffer.concat([
    Buffer.from(version, 'hex'),
    Buffer.from([3]), // depth
    Buffer.from('a1b2c3d4', 'hex'), // parent fingerprint
    Buffer.from('80000000', 'hex'), // child number
    Buffer.alloc(32, 0x5a), // chain code
    Buffer.from([keyPrefix]),
    Buffer.alloc(32, 0x11),
  ])
  return base58check(payload)
}

/** Changes one character of the key body (keeps the prefix). */
function typo(key: string): string {
  const i = 20
  const replacement = key[i] === 'a' ? 'b' : 'a'
  return key.slice(0, i) + replacement + key.slice(i + 1)
}

describe('base58Decode', () => {
  it('keeps leading zero bytes and refuses characters outside the alphabet', () => {
    expect(Array.from(base58Decode('11')!)).toEqual([0, 0])
    expect(Array.from(base58Decode('1z')!)).toEqual([0, 57])
    expect(base58Decode('0OIl')).toBeNull()
  })
})

describe('checkPublicKey: Bitcoin extended public keys', () => {
  it('accepts the BIP32 test vector xpub', () => {
    expect(checkPublicKey(BIP32_XPUB)).toEqual({
      ok: true,
      family: 'bitcoin',
      format: 'xpub',
      publicKey: BIP32_XPUB,
    })
  })

  it('recognizes xpub, ypub and zpub by their version bytes', () => {
    const xpub = fakeExtendedKey('0488b21e')
    const ypub = fakeExtendedKey('049d7cb2')
    const zpub = fakeExtendedKey('04b24746')
    expect(xpub.startsWith('xpub')).toBe(true)
    expect(ypub.startsWith('ypub')).toBe(true)
    expect(zpub.startsWith('zpub')).toBe(true)
    expect(checkPublicKey(xpub)).toMatchObject({ ok: true, format: 'xpub' })
    expect(checkPublicKey(ypub)).toMatchObject({ ok: true, format: 'ypub' })
    expect(checkPublicKey(zpub)).toMatchObject({ ok: true, format: 'zpub' })
  })

  it('ignores surrounding spaces and line breaks from a paste', () => {
    expect(checkPublicKey(`  ${BIP32_XPUB}\n`)).toMatchObject({
      ok: true,
      publicKey: BIP32_XPUB,
    })
  })

  it('refuses a typo through the checksum', () => {
    expect(checkPublicKey(typo(BIP32_XPUB))).toEqual({
      ok: false,
      error: 'checksum',
    })
    expect(checkPublicKey(typo(fakeExtendedKey('04b24746')))).toEqual({
      ok: false,
      error: 'checksum',
    })
  })

  it('refuses truncated keys as a wrong format', () => {
    expect(checkPublicKey(BIP32_XPUB.slice(0, -1))).toEqual({
      ok: false,
      error: 'format',
    })
  })

  it('refuses extended private keys, even with a typo', () => {
    expect(checkPublicKey(BIP32_XPRV)).toEqual({
      ok: false,
      error: 'private_key',
    })
    expect(checkPublicKey(typo(BIP32_XPRV))).toEqual({
      ok: false,
      error: 'private_key',
    })
    expect(checkPublicKey(fakeExtendedKey('04b2430c'))).toEqual({
      ok: false,
      error: 'private_key',
    })
  })

  it('refuses testnet keys', () => {
    const tpub = fakeExtendedKey('043587cf')
    expect(tpub.startsWith('tpub')).toBe(true)
    expect(checkPublicKey(tpub)).toEqual({ ok: false, error: 'testnet' })
    expect(checkPublicKey(fakeExtendedKey('045f1cf6'))).toEqual({
      ok: false,
      error: 'testnet',
    })
  })

  it('refuses unknown versions and keys that are not a compressed point', () => {
    expect(checkPublicKey(fakeExtendedKey('0295b43f'))).toEqual({
      ok: false,
      error: 'format',
    })
    expect(checkPublicKey(fakeExtendedKey('0488b21e', 0x04))).toEqual({
      ok: false,
      error: 'format',
    })
  })
})

describe('checkPublicKey: EVM addresses', () => {
  // EIP-55 test vectors.
  const CHECKSUMMED = [
    '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
    '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
    '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
  ]

  it('accepts EIP-55 checksummed addresses as they are', () => {
    for (const address of CHECKSUMMED) {
      expect(toChecksumAddress(address.toLowerCase())).toBe(address)
      expect(checkPublicKey(address)).toEqual({
        ok: true,
        family: 'evm',
        format: 'address',
        publicKey: address,
      })
    }
  })

  it('accepts single-case addresses and stores them checksummed', () => {
    const [address] = CHECKSUMMED
    expect(checkPublicKey(address.toLowerCase())).toMatchObject({
      ok: true,
      publicKey: address,
    })
    expect(checkPublicKey(`0x${address.slice(2).toUpperCase()}`)).toMatchObject(
      { ok: true, publicKey: address },
    )
  })

  it('refuses a mixed-case address whose checksum is wrong', () => {
    // One letter's case flipped.
    const wrong = '0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'
    expect(checkPublicKey(wrong)).toEqual({ ok: false, error: 'checksum' })
  })

  it('refuses addresses of the wrong length or without 0x', () => {
    expect(checkPublicKey('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeA')).toEqual({
      ok: false,
      error: 'format',
    })
    expect(checkPublicKey('5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toEqual({
      ok: false,
      error: 'format',
    })
  })

  it('refuses raw private keys', () => {
    const fakePrivate = `0x${'4c'.repeat(32)}`
    expect(checkPublicKey(fakePrivate)).toEqual({
      ok: false,
      error: 'private_key',
    })
    expect(checkPublicKey('4c'.repeat(32))).toEqual({
      ok: false,
      error: 'private_key',
    })
  })
})

describe('checkPublicKey: other input', () => {
  it('refuses a recovery phrase', () => {
    const phrase = Array.from({ length: 12 }, () => 'abandon').join(' ')
    expect(checkPublicKey(phrase)).toEqual({
      ok: false,
      error: 'seed_phrase',
    })
    expect(checkPublicKey(`${phrase}\n${phrase}`)).toEqual({
      ok: false,
      error: 'seed_phrase',
    })
  })

  it('refuses anything else as a wrong format', () => {
    for (const text of ['', 'bc1qexample', 'not a key', 'xpub']) {
      expect(checkPublicKey(text)).toEqual({ ok: false, error: 'format' })
    }
  })
})

/**
 * Bitcoin addresses from the published documents only: the first receive
 * addresses of the BIP44 / BIP49 / BIP84 / BIP86 test mnemonic and the
 * BIP173 / BIP350 examples.
 */
const BIP44_ADDRESS = '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA'
const BIP49_ADDRESS = '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf'
const BIP84_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
const BIP86_ADDRESS =
  'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'
const BIP173_UPPER = 'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4'
const BIP173_P2WSH =
  'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3'

describe('checkPublicKey: Bitcoin addresses', () => {
  it('accepts mainnet addresses of each type', () => {
    expect(checkPublicKey(BIP44_ADDRESS)).toEqual({
      ok: true,
      family: 'bitcoin',
      format: 'address',
      addressType: 'legacy',
      publicKey: BIP44_ADDRESS,
    })
    expect(checkPublicKey(` ${BIP49_ADDRESS}\n`)).toMatchObject({
      ok: true,
      addressType: 'nested_segwit',
      publicKey: BIP49_ADDRESS,
    })
    expect(checkPublicKey(BIP84_ADDRESS)).toMatchObject({
      ok: true,
      addressType: 'native_segwit',
    })
    expect(checkPublicKey(BIP173_P2WSH)).toMatchObject({
      ok: true,
      addressType: 'native_segwit',
    })
    expect(checkPublicKey(BIP86_ADDRESS)).toMatchObject({
      ok: true,
      addressType: 'taproot',
    })
  })

  it('stores bech32 addresses in lower case and refuses mixed case', () => {
    expect(checkPublicKey(BIP173_UPPER)).toMatchObject({
      ok: true,
      publicKey: BIP173_UPPER.toLowerCase(),
    })
    const mixed = `${BIP84_ADDRESS.slice(0, 10)}${BIP84_ADDRESS.slice(10).toUpperCase()}`
    expect(checkPublicKey(mixed)).toEqual({ ok: false, error: 'format' })
  })

  it('refuses a typo through the checksum', () => {
    for (const address of [
      BIP44_ADDRESS,
      BIP49_ADDRESS,
      BIP84_ADDRESS,
      BIP86_ADDRESS,
    ]) {
      const last = address.at(-1) === 'q' ? 'p' : 'q'
      const typo = `${address.slice(0, -1)}${address.at(-1) === 'A' ? 'B' : last}`
      expect(checkPublicKey(typo)).toEqual({ ok: false, error: 'checksum' })
    }
  })

  it('refuses SegWit v0 in bech32m and Taproot in bech32 (BIP350)', () => {
    // The BIP173 key hash with a bech32m checksum.
    expect(
      checkPublicKey('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh'),
    ).toEqual({ ok: false, error: 'checksum' })
    // A witness v1 program with a bech32 checksum.
    expect(
      checkPublicKey(
        'bc1pqurswpc8qurswpc8qurswpc8qurswpc8qurswpc8qurswpc8qurs9s7tj7',
      ),
    ).toEqual({ ok: false, error: 'checksum' })
  })

  it('refuses testnet addresses and other networks', () => {
    expect(
      checkPublicKey('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx'),
    ).toEqual({ ok: false, error: 'testnet' })
    expect(checkPublicKey('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn')).toEqual({
      ok: false,
      error: 'testnet',
    })
    expect(
      checkPublicKey('ltc1qw508d6qejxtdg4y5r3zarvary0c5xw7kgmn4n9'),
    ).toEqual({ ok: false, error: 'format' })
  })

  it('refuses WIF private keys, even with a typo', () => {
    // The WIF examples of the Bitcoin wiki (private key 0x0C28FCA3…).
    const wif = '5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ'
    expect(checkPublicKey(wif)).toEqual({ ok: false, error: 'private_key' })
    expect(checkPublicKey(`${wif.slice(0, -1)}K`)).toEqual({
      ok: false,
      error: 'private_key',
    })
    expect(
      checkPublicKey('KwDiBf89QgGbjEhKnhXJuH7LrciVrZi3qYjgd9M7rFU73sVHnoWn'),
    ).toEqual({ ok: false, error: 'private_key' })
  })

  it('refuses output descriptors, with their own reason', () => {
    expect(
      checkPublicKey(`wpkh([d34db33f/84h/0h/0h]${BIP32_XPUB}/0/*)`),
    ).toEqual({ ok: false, error: 'descriptor' })
    expect(checkPublicKey(`sh(wpkh(${BIP32_XPUB}/0/*))`)).toEqual({
      ok: false,
      error: 'descriptor',
    })
    expect(checkPublicKey(`wpkh(${BIP32_XPRV}/0/*)`)).toEqual({
      ok: false,
      error: 'private_key',
    })
  })
})
