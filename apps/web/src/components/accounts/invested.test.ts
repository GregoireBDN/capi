import { describe, expect, it } from 'vitest'
import type { AccountPerformanceDto } from '#/api/types.gen'
import { investedSourceText, takesInvestedBase } from './invested'

type Figures = Parameters<typeof investedSourceText>[1]

function figures(
  overrides: Partial<AccountPerformanceDto> = {},
): Figures & Pick<AccountPerformanceDto, 'unknownCost'> {
  return {
    contributionsCents: 1_000_000,
    contributionsDate: '2026-10-31',
    contributionsSource: 'typed',
    investedBase: null,
    linkedTransfersCount: 0,
    unknownCostCount: 0,
    unknownCost: [],
    ...overrides,
  }
}

const pea = { type: 'brokerage', cryptoSource: null } as const
const wallet = { type: 'crypto', cryptoSource: 'wallet' } as const
const exchange = { type: 'crypto', cryptoSource: 'exchange' } as const

describe('takesInvestedBase', () => {
  it('is typed on a PEA, a life insurance and employee savings only (#360, #373)', () => {
    for (const type of [
      'brokerage',
      'life_insurance',
      'employee_savings',
    ] as const) {
      expect(
        takesInvestedBase({ type, cryptoSource: null, archivedAt: null }),
      ).toBe(true)
    }
    expect(takesInvestedBase({ ...wallet, archivedAt: null })).toBe(false)
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
        pea,
        figures({ contributionsSource: 'links', linkedTransfersCount: 1 }),
      ),
    ).toBe('D’après 1 virement lié')
    expect(investedSourceText(pea, figures())).toBe(
      'Saisi sur la valeur du 31 oct. 2026',
    )
    expect(investedSourceText(pea, figures({ linkedTransfersCount: 2 }))).toBe(
      'Saisi sur la valeur du 31 oct. 2026 + 2 virements liés',
    )
  })

  it("names a crypto account's coins of unknown cost (#373)", () => {
    expect(
      investedSourceText(
        wallet,
        figures({
          contributionsSource: 'coins',
          linkedTransfersCount: 2,
          unknownCost: [
            { assetId: 'bitcoin', symbol: 'BTC', quantity: '0.1' },
            { assetId: 'ethereum', symbol: 'ETH', quantity: '2' },
          ],
        }),
      ),
    ).toBe(
      'Au prix d’achat des cryptos reçues de vos plateformes · hors 0,1 BTC et 2 ETH sans coût connu',
    )
    expect(
      investedSourceText(wallet, figures({ contributionsSource: 'coins' })),
    ).toBe('Au prix de revient de vos cryptos')
  })

  it('has nothing to say when the amount is unknown', () => {
    expect(
      investedSourceText(pea, figures({ contributionsCents: null })),
    ).toBeNull()
  })
})
