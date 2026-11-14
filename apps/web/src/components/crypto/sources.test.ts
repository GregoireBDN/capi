import { describe, expect, it } from 'vitest'
import { ApiRequestError } from '#/lib/queries'
import {
  exchangeProviderOf,
  maskPublicKey,
  publicKeyFormat,
  walletKeyErrorMessage,
} from './sources'

/** Public test vectors only (BIP32 test vector 1, EIP-55 example). */
const XPUB =
  'xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8'
const XPRV =
  'xprv9s21ZrQH143K3QTDL4LXw2F7HEK3wJUD2nW2nRk4stbPy6cq3jPPqjiChkVvvNKmPGJxWUtg6LnF5kejMRNNU3TGtRBeJgk33yuGBxrMPHi'
const ADDRESS = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'

describe('publicKeyFormat', () => {
  it('recognizes Bitcoin extended public keys and EVM addresses', () => {
    expect(publicKeyFormat(XPUB)).toEqual({ family: 'bitcoin' })
    expect(publicKeyFormat(`  ${ADDRESS}\n`)).toEqual({ family: 'evm' })
    expect(publicKeyFormat(ADDRESS.toLowerCase())).toEqual({ family: 'evm' })
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
