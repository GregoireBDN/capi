import { describe, expect, it } from 'vitest'
import { ApiRequestError } from '#/lib/queries'
import {
  exchangeProviderOf,
  maskPublicKey,
  publicKeyFormat,
  walletKeyErrorMessage,
  walletKeyTypeLabel,
} from './sources'

/** Public test vectors only (BIP32 test vector 1, EIP-55 example). */
const XPUB =
  'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8'
const XPRV =
  'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'
const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

/** First receive addresses of the BIP44 / 49 / 84 / 86 test mnemonic. */
const BIP44_ADDRESS = '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA'
const BIP49_ADDRESS = '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf'
const BIP84_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'
const BIP86_ADDRESS =
  'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr'

describe('publicKeyFormat', () => {
  it('recognizes Bitcoin extended public keys and EVM addresses', () => {
    expect(publicKeyFormat(XPUB)).toEqual({ family: 'bitcoin', kind: 'xpub' })
    expect(publicKeyFormat(`z${XPUB.slice(1)}`)).toEqual({
      family: 'bitcoin',
      kind: 'zpub',
    })
    expect(publicKeyFormat(`  ${ADDRESS}\n`)).toEqual({ family: 'evm' })
    expect(publicKeyFormat(ADDRESS.toLowerCase())).toEqual({ family: 'evm' })
  })

  it('recognizes single Bitcoin addresses and their type (#248)', () => {
    expect(publicKeyFormat(BIP44_ADDRESS)).toEqual({
      family: 'bitcoin',
      kind: 'address',
      addressType: 'legacy',
    })
    expect(publicKeyFormat(BIP49_ADDRESS).addressType).toBe('nested_segwit')
    expect(publicKeyFormat(BIP84_ADDRESS).addressType).toBe('native_segwit')
    expect(publicKeyFormat(BIP84_ADDRESS.toUpperCase()).addressType).toBe(
      'native_segwit',
    )
    expect(publicKeyFormat(BIP86_ADDRESS).addressType).toBe('taproot')
  })

  it('says what was pasted when it is not a public key', () => {
    expect(
      publicKeyFormat('5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ'),
    ).toMatchObject({
      danger: true,
      error: expect.stringMatching(/clé privée/),
    })
    expect(
      publicKeyFormat(`wpkh([d34db33f/84h/0h/0h]${XPUB}/0/*)`).error,
    ).toMatch(/descripteur/)
    expect(
      publicKeyFormat('tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx').error,
    ).toMatch(/réseau de test/)
  })

  it('refuses private keys and recovery phrases with a warning', () => {
    expect(publicKeyFormat(XPRV).error).toMatch(/clé privée/)
    expect(publicKeyFormat(`0x${'4c'.repeat(32)}`).error).toMatch(/clé privée/)
    expect(publicKeyFormat(Array(12).fill('abandon').join(' ')).error).toMatch(
      /phrase de récupération/,
    )
  })

  it('refuses testnet keys, empty input and anything else', () => {
    expect(publicKeyFormat(`t${XPUB.slice(1)}`).error).toMatch(/test/)
    expect(publicKeyFormat('').error).toMatch(/Collez/)
    expect(publicKeyFormat('bc1qexample').error).toMatch(/non reconnue/)
    expect(publicKeyFormat('ltc1qexampleexample').error).toMatch(/non reconnue/)
    expect(publicKeyFormat(ADDRESS.slice(0, -1)).error).toMatch(/non reconnue/)
  })
})

describe('walletKeyErrorMessage', () => {
  it('translates the API reasons and leaves other errors alone', () => {
    const bad = (message: string, status = 400) =>
      walletKeyErrorMessage(new ApiRequestError(status, message))
    expect(bad('The key checksum is wrong: check it for a typo.')).toMatch(
      /faute de frappe/,
    )
    expect(
      bad('This public key is already tracked by an account', 409),
    ).toMatch(/déjà suivie/)
    expect(bad('This is a private key: never enter it.')).toMatch(/clé privée/)
    expect(bad('name must be shorter')).toBeNull()
    expect(walletKeyErrorMessage(new Error('x'))).toBeNull()
    expect(
      bad(
        'Not a Bitcoin extended public key (xpub, ypub, zpub) or address, nor an EVM 0x address.',
      ),
    ).toMatch(/adresse Bitcoin \(bc1…/)
    expect(bad('This is an output descriptor: paste the xpub alone.')).toMatch(
      /descripteur/,
    )
  })
})

describe('walletKeyTypeLabel', () => {
  it('says what a Bitcoin key reads', () => {
    expect(
      walletKeyTypeLabel({ format: 'xpub', addressTypes: ['native_segwit'] }),
    ).toBe('Native SegWit (bc1q…)')
    expect(
      walletKeyTypeLabel({ format: 'address', addressTypes: ['taproot'] }),
    ).toBe('Adresse · Taproot (bc1p…)')
    expect(
      walletKeyTypeLabel({
        format: 'xpub',
        addressTypes: null,
        detectingAddressType: true,
      }),
    ).toMatch(/prochaine synchronisation/)
    expect(walletKeyTypeLabel({ format: null, addressTypes: null })).toBeNull()
  })
})

describe('helpers', () => {
  it('masks keys and maps exchange names to providers', () => {
    expect(maskPublicKey(XPUB)).toBe('xpub661M…GMcet8')
    expect(exchangeProviderOf('Binance')).toBe('binance')
    expect(exchangeProviderOf('Coinbase')).toBe('coinbase')
    expect(exchangeProviderOf('Kraken')).toBe('other')
  })
})
