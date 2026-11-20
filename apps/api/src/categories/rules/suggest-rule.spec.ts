import { describe, expect, it } from 'vitest'
import type { SelectCategorizationRule } from '#/categories/categories.schema'
import { type CategorizableTransaction, ruleMatches } from './categorize'
import { stableLabelPart, suggestRuleFromTransaction } from './suggest-rule'

// Synthetic fixtures only: fake labels, amounts and ids.
const CATEGORY_ID = '00000000-0000-4000-8000-0000000000c1'

function tx(
  overrides: Partial<CategorizableTransaction> = {},
): CategorizableTransaction {
  return {
    accountId: '00000000-0000-4000-8000-00000000000a',
    rawLabel: 'PAIEMENT CB 1501 TESTVILLE FAKEMART CARTE 4XXXXXXXXXXX0000',
    merchant: null,
    amountCents: -1_999,
    ...overrides,
  }
}

/** The suggestion as a stored rule, to check it matches its source. */
function asRule(
  suggestion: ReturnType<typeof suggestRuleFromTransaction>,
): SelectCategorizationRule {
  return {
    ...suggestion,
    id: 'suggested',
    position: 0,
    priority: 0,
    counterpartAccountId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('stableLabelPart', () => {
  it.each([
    [
      'PAIEMENT CB 1501 TESTVILLE FAKEMART CARTE 4XXXXXXXXXXX0000',
      'testville fakemart',
    ],
    [
      'PRLV SEPA FAKE TELECOM SA REF 2026-01-0042 MDT ABC123',
      'fake telecom sa',
    ],
    [
      'VIR SEPA RECU /DE FAKE EMPLOYER SAS /MOTIF SALAIRE JANVIER',
      'fake employer sas',
    ],
    ['VIR INST EMIS /DE JANE TESTER 9876543', 'jane tester'],
    ['PAIEMENT PSC 0201 TESTTOWN CAFÉ DU MARCHÉ', 'testtown cafe du marche'],
    ['FAKE STREAMING 12/01 FR 4XXXX', 'fake streaming'],
    [
      'PRLV SEPA FAKE INSURANCE MUTUELLE GENERALE DU TEST 202601',
      'fake insurance mutuelle generale',
    ],
  ])('%s -> %s', (label, expected) => {
    expect(stableLabelPart(label)).toBe(expected)
  })

  it('falls back to the operation words when nothing else is stable', () => {
    expect(stableLabelPart('RETRAIT DAB 0301 1234')).toBe('retrait dab')
    expect(stableLabelPart('CB 0101 12,34')).toBe('cb')
  })

  it('returns an empty string for a label made of numbers only', () => {
    expect(stableLabelPart('0101 1234')).toBe('')
  })
})

describe('suggestRuleFromTransaction', () => {
  it('prefers the merchant key', () => {
    const suggestion = suggestRuleFromTransaction(
      tx({ merchant: 'Fakemart' }),
      CATEGORY_ID,
    )

    expect(suggestion).toEqual({
      enabled: true,
      matchType: 'contains',
      labelPattern: 'Fakemart',
      accountId: null,
      minAmountCents: null,
      maxAmountCents: null,
      categoryId: CATEGORY_ID,
      merchant: null,
    })
  })

  it('falls back to the stable part of the label, upper-cased', () => {
    const suggestion = suggestRuleFromTransaction(
      tx({
        rawLabel: 'PRLV SEPA FAKE TELECOM SA REF 2026-01-0042',
        merchant: '  ',
      }),
      CATEGORY_ID,
    )

    expect(suggestion.labelPattern).toBe('FAKE TELECOM SA')
  })

  it('uses the raw label when it has no stable part', () => {
    expect(
      suggestRuleFromTransaction(tx({ rawLabel: ' 0101 1234 ' }), CATEGORY_ID)
        .labelPattern,
    ).toBe('0101 1234')
  })

  it.each([
    tx(),
    tx({ merchant: 'Fakemart' }),
    tx({ rawLabel: 'VIR SEPA RECU /DE FAKE EMPLOYER SAS /MOTIF SALAIRE' }),
    tx({ rawLabel: 'PAIEMENT CB 0201 TESTTOWN CAFÉ DU MARCHÉ CARTE 4XXX' }),
    tx({ rawLabel: 'RETRAIT DAB 0301 1234' }),
  ])('suggests a rule that matches its source transaction (%#)', (source) => {
    const suggestion = suggestRuleFromTransaction(source, CATEGORY_ID)

    expect(ruleMatches(asRule(suggestion), source)).toBe(true)
  })

  it('suggests a rule that also matches the same merchant on another day', () => {
    const first = tx({
      rawLabel: 'PAIEMENT CB 1501 TESTVILLE FAKEMART CARTE 4XXX0000',
    })
    const later = tx({
      rawLabel: 'PAIEMENT CB 2802 TESTVILLE FAKEMART CARTE 4XXX0000',
      amountCents: -4_210,
    })

    const rule = asRule(suggestRuleFromTransaction(first, CATEGORY_ID))

    expect(ruleMatches(rule, later)).toBe(true)
  })
})
