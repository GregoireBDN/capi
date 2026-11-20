import type { RecurringItemDto, RecurringSummaryDto } from '#/api/types.gen'

/** Synthetic recurring item (fake merchant, account and amounts). */
export function recurringItem(
  overrides: Partial<RecurringItemDto> = {},
): RecurringItemDto {
  const id = overrides.id ?? 'item-1'
  const item: RecurringItemDto = {
    id,
    accountId: 'a0000000-0000-4000-8000-000000000001',
    accountName: 'Compte courant',
    merchantKey: 'EXEMPLE',
    searchText: 'Exemple',
    name: 'Exemple',
    direction: 'debit',
    status: 'confirmed',
    categoryId: null,
    categorySlug: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    isFixedCost: true,
    isSubscription: false,
    cadence: 'monthly',
    detectedCadence: 'monthly',
    cadenceOverridden: false,
    amountType: 'fixed',
    typicalAmountCents: 1_000,
    latestAmountCents: 1_000,
    minAmountCents: 1_000,
    maxAmountCents: 1_000,
    yearlyCostCents: 12_000,
    monthlyEquivalentCents: 1_000,
    previousAmountCents: null,
    priceChangeCents: null,
    priceChangedOn: null,
    confidence: 0.9,
    active: true,
    firstSeenDate: '2026-01-10',
    lastSeenDate: '2026-10-10',
    nextExpectedDate: '2026-11-10',
    occurrenceCount: 10,
    occurrences: [
      { transactionId: `${id}-t2`, date: '2026-10-10', amountCents: 1_000 },
      { transactionId: `${id}-t1`, date: '2026-09-10', amountCents: 1_000 },
    ],
    amountRuns: [
      { amountCents: 1_000, from: '2026-01-10', to: '2026-10-10', count: 10 },
    ],
    notes: null,
    endedOn: null,
    ended: false,
    chargedAfterEnd: null,
    termMonths: null,
    renewalDate: null,
    renewalReminder: false,
    share: null,
    ownMonthlyEquivalentCents: 0,
    ownYearlyCostCents: 0,
    ...overrides,
  }
  // Not shared (#359): the owner's part is the whole cost.
  return {
    ...item,
    ownMonthlyEquivalentCents:
      overrides.ownMonthlyEquivalentCents ?? item.monthlyEquivalentCents,
    ownYearlyCostCents: overrides.ownYearlyCostCents ?? item.yearlyCostCents,
  }
}

export function recurringSummary(
  overrides: Partial<RecurringSummaryDto> = {},
): RecurringSummaryDto {
  return {
    debits: {
      monthlyCents: 0,
      yearlyCents: 0,
      count: 0,
      fixed: { monthlyCents: 0, yearlyCents: 0, count: 0 },
      variable: { monthlyCents: 0, yearlyCents: 0, count: 0 },
      subscriptions: { monthlyCents: 0, yearlyCents: 0, count: 0 },
    },
    credits: { monthlyCents: 0, yearlyCents: 0, count: 0 },
    suggestedCount: 0,
    inactiveCount: 0,
    endedCount: 0,
    ...overrides,
  }
}
