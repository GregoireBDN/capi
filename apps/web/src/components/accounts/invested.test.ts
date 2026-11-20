import { describe, expect, it } from 'vitest'
import type { AccountPerformanceDto } from '#/api/types.gen'
import { investedSourceText, takesInvestedBase } from './invested'

type Figures = Parameters<typeof investedSourceText>[1]

function figures(overrides: Partial<AccountPerformanceDto> = {}): Figures {
  return {
    contributionsCents: 1_000_000,
    contributionsDate: '2026-10-31',
    contributionsSource: 'typed',
    investedBase: null,
    linkedTransfersCount: 0,
    unknownCostCount: 0,
    ...overrides,
  }
}

const pea = { type: 'brokerage', cryptoSource: null } as const
const wallet = { type: 'crypto', cryptoSource: 'wallet' } as const
const exchange = { type: 'crypto', cryptoSource: 'exchange' } as const

describe('takesInvestedBase', () => {
  it('is typed on every investment account but an exchange (#360)', () => {
    for (const type of [
      'brokerage',
      'life_insurance',
      'employee_savings',
    ] as const) {
      expect(
        takesInvestedBase({ type, cryptoSource: null, archivedAt: null }),
      ).toBe(true)
    }
    expect(takesInvestedBase({ ...wallet, archivedAt: null })).toBe(true)
    expect(takesInvestedBase({ ...exchange, archivedAt: null })).toBe(false)
    expect(
      takesInvestedBase({
        type: 'savings',
        cryptoSource: null,
        archivedAt: null,
      }),
    ).toBe(false)
    expect(
      takesInvestedBase({ ...pea, archivedAt: '2026-01-01T00:00:00.000Z' }),
    ).toBe(false)
  })
})

describe('investedSourceText', () => {
  it('says where the invested amount comes from, in one line', () => {
    expect(investedSourceText(exchange, figures())).toBe(
      'D’après vos exports, au prix d’achat',
    )
    expect(
      investedSourceText(
        pea,
        figures({
          contributionsSource: 'base',
          investedBase: { amountCents: 900_000, on: '2026-01-02' },
          linkedTransfersCount: 3,
        }),
      ),
    ).toBe('Saisi au 2 janv. 2026 + 3 virements liés')
    expect(
      investedSourceText(
        wallet,
        figures({
          contributionsSource: 'base',
          investedBase: { amountCents: 900_000, on: '2025-03-01' },
          linkedTransfersCount: 2,
          unknownCostCount: 1,
        }),
      ),
    ).toBe(
      'Saisi au 1er mars 2025 + 2 envois d’une plateforme · dont 1 envoi sans coût connu',
    )
    expect(
      investedSourceText(
        pea,
        figures({ contributionsSource: 'links', linkedTransfersCount: 1 }),
      ),
    ).toBe('D’après 1 virement lié')
    expect(investedSourceText(pea, figures())).toBe(
      'Saisi sur la valeur du 31 oct. 2026',
    )
    expect(investedSourceText(wallet, figures())).toBe(
      'D’après les montants investis de vos avoirs',
    )
  })

  it('has nothing to say when the amount is unknown', () => {
    expect(
      investedSourceText(pea, figures({ contributionsCents: null })),
    ).toBeNull()
  })
})
