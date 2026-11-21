import { describe, expect, it } from 'vitest'
import { accountKindLabel } from './labels'

describe('accountKindLabel', () => {
  it('names an account by its type (#404)', () => {
    expect(
      accountKindLabel({ type: 'life_insurance', cryptoSource: null }),
    ).toBe('Assurance vie')
    expect(accountKindLabel({ type: 'savings', cryptoSource: null })).toBe(
      'Livret d’épargne',
    )
  })

  it('names a crypto account by its source (#408)', () => {
    expect(accountKindLabel({ type: 'crypto', cryptoSource: 'exchange' })).toBe(
      'Plateforme crypto',
    )
    expect(accountKindLabel({ type: 'crypto', cryptoSource: 'wallet' })).toBe(
      'Wallet crypto',
    )
    expect(accountKindLabel({ type: 'crypto', cryptoSource: 'manual' })).toBe(
      'Cryptos saisies à la main',
    )
    expect(accountKindLabel({ type: 'crypto', cryptoSource: null })).toBe(
      'Crypto',
    )
  })
})
