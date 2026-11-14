import { describe, expect, it } from 'vitest'
import {
  BitcoinAddressDeriver,
  MAX_ADDRESSES_PER_BRANCH,
} from './bitcoin-derivation'
import { BIP44_XPUB, BIP49_YPUB, BIP84_ZPUB } from './test-vectors'

describe('BitcoinAddressDeriver', () => {
  it('derives BIP84 native SegWit receive and change addresses from a zpub', () => {
    const deriver = new BitcoinAddressDeriver()
    expect(deriver.derive(BIP84_ZPUB, 0, 0, 2)).toEqual([
      'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
      'bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g',
    ])
    expect(deriver.derive(BIP84_ZPUB, 1, 0, 1)).toEqual([
      'bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el',
    ])
  })

  it('derives BIP49 nested SegWit addresses from a ypub', () => {
    const deriver = new BitcoinAddressDeriver()
    expect(deriver.derive(BIP49_YPUB, 0, 0, 1)).toEqual([
      '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf',
    ])
  })

  it('derives BIP44 legacy addresses from an xpub', () => {
    const deriver = new BitcoinAddressDeriver()
    expect(deriver.derive(BIP44_XPUB, 0, 0, 1)).toEqual([
      '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA',
    ])
  })

  it('returns any window of a branch, the same from the cache', () => {
    const deriver = new BitcoinAddressDeriver()
    const all = deriver.derive(BIP84_ZPUB, 0, 0, 25)
    expect(new Set(all).size).toBe(25)
    expect(deriver.derive(BIP84_ZPUB, 0, 20, 5)).toEqual(all.slice(20))
    expect(new BitcoinAddressDeriver().derive(BIP84_ZPUB, 0, 1, 1)).toEqual([
      all[1],
    ])
  })

  it('refuses keys that are not extended public keys, without echoing them', () => {
    const deriver = new BitcoinAddressDeriver()
    const address = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359'
    expect(() => deriver.derive(address, 0, 0, 1)).toThrow(
      'Not a Bitcoin extended public key',
    )
    try {
      deriver.derive(`${BIP84_ZPUB.slice(0, -1)}t`, 0, 0, 1)
    } catch (error) {
      expect((error as Error).message).not.toContain(BIP84_ZPUB.slice(0, 20))
    }
    expect(() =>
      deriver.derive(BIP84_ZPUB, 0, MAX_ADDRESSES_PER_BRANCH, 1),
    ).toThrow(RangeError)
  })
})
