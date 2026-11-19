import type { ForecastDto, ForecastItemDto } from '#/api/types.gen'

/** Synthetic data only. */
export const FORECAST_CHECKING_ID = '10000000-0000-4000-8000-000000000001'

export function forecastItem(
  overrides: Partial<ForecastItemDto> = {},
): ForecastItemDto {
  return {
    recurringItemId: '30000000-0000-4000-8000-000000000001',
    accountId: FORECAST_CHECKING_ID,
    name: 'Streaming test',
    date: '2026-11-20',
    expectedDate: '2026-11-20',
    amountCents: -1_399,
    direction: 'debit',
    amountType: 'fixed',
    isFixedCost: true,
    categoryName: 'Abonnements',
    categoryColor: '#7c3aed',
    categoryIcon: 'repeat',
    ...overrides,
  }
}

/** November 28 to 30: a rent debit, then the salary. */
export function forecast(overrides: Partial<ForecastDto> = {}): ForecastDto {
  const rent = forecastItem({
    recurringItemId: '30000000-0000-4000-8000-000000000002',
    name: 'Loyer test',
    date: '2026-11-29',
    expectedDate: '2026-11-29',
    amountCents: -80_000,
  })
  const salary = forecastItem({
    recurringItemId: '30000000-0000-4000-8000-000000000003',
    name: 'Salaire test',
    date: '2026-11-30',
    expectedDate: '2026-11-30',
    amountCents: 250_000,
    direction: 'credit',
    isFixedCost: false,
    categoryName: 'Salaire',
  })
  return {
    today: '2026-11-28',
    monthEnd: '2026-11-30',
    accounts: [
      {
        id: FORECAST_CHECKING_ID,
        name: 'Compte test',
        type: 'checking',
        balanceCents: 100_000,
        balanceDate: '2026-11-27',
      },
    ],
    startingBalanceCents: 100_000,
    startingBalanceDate: '2026-11-27',
    knownUntil: '2026-11-27',
    projectedFrom: '2026-11-28',
    stale: false,
    staleAfterDays: 7,
    thresholdCents: 0,
    recurringItemCount: 2,
    items: [rent, salary],
    expectedDebitsCents: -80_000,
    expectedCreditsCents: 250_000,
    estimate: {
      dailyCents: 1_000,
      days: 3,
      coveredCents: 0,
      totalCents: -3_000,
      basedOnFrom: '2026-08-01',
      basedOnTo: '2026-10-31',
    },
    points: [
      {
        date: '2026-11-28',
        balanceCents: 99_000,
        items: [],
        estimateCents: -1_000,
      },
      {
        date: '2026-11-29',
        balanceCents: 18_000,
        items: [rent],
        estimateCents: -1_000,
      },
      {
        date: '2026-11-30',
        balanceCents: 267_000,
        items: [salary],
        estimateCents: -1_000,
      },
    ],
    endBalanceCents: 267_000,
    lowest: { date: '2026-11-29', balanceCents: 18_000 },
    belowThreshold: null,
    ...overrides,
  }
}
