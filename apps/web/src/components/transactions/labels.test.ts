import { describe, expect, it } from 'vitest'
import { displayLabel, secondaryLabel } from './labels'

/** Synthetic labels only. */
describe('secondaryLabel (#266)', () => {
  it('hides a raw label that only wraps the merchant in bank words', () => {
    expect(
      secondaryLabel({ rawLabel: 'VIR SEPA VERS PEA', merchant: 'Vers Pea' }),
    ).toBeNull()
    expect(
      secondaryLabel({
        rawLabel: 'PAIEMENT CB 2810 TESTVILLE FAKEMART CARTE 0000',
        merchant: 'Fakemart',
      }),
    ).toBeNull()
    expect(
      secondaryLabel({
        rawLabel: 'PAIEMENT CB 1810 SHOP.EXAMPLE CARTE 0000',
        merchant: 'Shop',
      }),
    ).toBeNull()
  })

  it('ignores case and accents', () => {
    expect(
      secondaryLabel({
        rawLabel: 'PRLV SEPA ENERGIE VERTE TEST',
        merchant: 'Énergie Verte',
      }),
    ).toBeNull()
  })

  it('keeps a raw label that adds information', () => {
    expect(
      secondaryLabel({
        rawLabel: 'PRLV SEPA FAKE ASSURANCE CONTRAT 42',
        merchant: 'Mutuelle Test',
      }),
    ).toBe('PRLV SEPA FAKE ASSURANCE CONTRAT 42')
    // A partial word is not a match.
    expect(
      secondaryLabel({
        rawLabel: 'PAIEMENT CB FAKEMARTIN',
        merchant: 'Fakemart',
      }),
    ).toBe('PAIEMENT CB FAKEMARTIN')
  })

  it('shows nothing more when the row already shows the raw label', () => {
    const row = { rawLabel: 'PAIEMENT CB 1810 TEST CARTE 0000', merchant: null }
    expect(displayLabel(row)).toBe(row.rawLabel)
    expect(secondaryLabel(row)).toBeNull()
  })
})
