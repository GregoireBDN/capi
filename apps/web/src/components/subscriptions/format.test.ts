import { describe, expect, it } from 'vitest'
import type { CategoryDto, RecurringItemDto } from '#/api/types.gen'
import {
  addMonths,
  formatChargeCount,
  formatRunPeriod,
  describeSchedule,
  formatChargedAfterEnd,
  formatEnd,
  formatAmountPerPeriod,
  formatPrepaid,
  formatPriceChange,
  prepaidMonthlyCents,
  formatRelativeDay,
  groupItems,
  todayInParis,
  upcomingDebits,
} from './format'
import { categoryChoices } from './RecurringEditor'
import { recurringItem } from './test-fixtures'

/** Testing Library-style: `Intl` emits narrow no-break spaces. */
const text = (value: string | null) => value?.replace(/\s/g, ' ') ?? null

describe('subscriptions format helpers', () => {
  it('reads today in Europe/Paris', () => {
    expect(todayInParis(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01')
  })

  it('formats relative days', () => {
    const today = '2026-11-06'
    expect(formatRelativeDay('2026-11-06', today)).toBe('aujourd’hui')
    expect(formatRelativeDay('2026-11-07', today)).toBe('demain')
    expect(formatRelativeDay('2026-11-11', today)).toBe('dans 5 jours')
    expect(formatRelativeDay('2026-11-05', today)).toBe('hier')
    expect(formatRelativeDay('2026-11-01', today)).toBe('il y a 5 jours')
  })

  it('formats a price change with its month', () => {
    const today = '2026-11-06'
    expect(
      text(
        formatPriceChange(
          { priceChangeCents: 200, priceChangedOn: '2026-03-12' },
          today,
        ),
      ),
    ).toBe('+2,00 € depuis mars')
    expect(
      text(
        formatPriceChange(
          { priceChangeCents: -150, priceChangedOn: '2025-12-01' },
          today,
        ),
      ),
    ).toBe('−1,50 € depuis décembre 2025')
    expect(
      formatPriceChange(
        { priceChangeCents: null, priceChangedOn: null },
        today,
      ),
    ).toBeNull()
  })

  it('adds months without overflowing the month end', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15')
  })

  it('lists the upcoming debits of the next 30 days', () => {
    const items: RecurringItemDto[] = [
      recurringItem({
        id: 'rent',
        name: 'Loyer',
        nextExpectedDate: '2026-11-02',
      }),
      recurringItem({
        id: 'basket',
        name: 'Panier',
        cadence: 'weekly',
        nextExpectedDate: '2026-11-10',
      }),
      recurringItem({
        id: 'far',
        name: 'Assurance',
        nextExpectedDate: '2026-12-20',
      }),
      recurringItem({
        id: 'sug',
        status: 'suggested',
        nextExpectedDate: '2026-11-08',
      }),
      recurringItem({
        id: 'off',
        active: false,
        nextExpectedDate: '2026-11-08',
      }),
      recurringItem({
        id: 'pay',
        direction: 'credit',
        nextExpectedDate: '2026-11-28',
      }),
    ]
    const upcoming = upcomingDebits(items, '2026-11-06')
    expect(upcoming.map((u) => `${u.item.id} ${u.date}`)).toEqual([
      'basket 2026-11-10',
      'basket 2026-11-17',
      'basket 2026-11-24',
      'basket 2026-12-01',
      // Expected on the 2nd but not imported yet: carried to next month.
      'rent 2026-12-02',
    ])
  })

  it('stops the upcoming debits of a cancelled item before its end', () => {
    const upcoming = upcomingDebits(
      [
        recurringItem({
          id: 'basket',
          cadence: 'weekly',
          nextExpectedDate: '2026-11-10',
          endedOn: '2026-11-24',
        }),
        recurringItem({
          id: 'gone',
          nextExpectedDate: '2026-11-10',
          endedOn: '2026-11-01',
          ended: true,
        }),
      ],
      '2026-11-06',
    )
    expect(upcoming.map((u) => [u.date, u.last])).toEqual([
      ['2026-11-10', false],
      ['2026-11-17', true],
    ])
  })

  it('formats the end date and a charge after it', () => {
    const today = '2026-11-06'
    expect(text(formatEnd({ endedOn: '2026-12-15' }, today))).toBe(
      'Résilié · fin le 15 déc.',
    )
    expect(text(formatEnd({ endedOn: '2027-01-02' }, today))).toBe(
      'Résilié · fin le 2 janv. 2027',
    )
    expect(text(formatEnd({ endedOn: '2026-12-01' }, today))).toBe(
      'Résilié · fin le 1er déc.',
    )
    expect(formatEnd({ endedOn: null }, today)).toBeNull()
    expect(
      text(formatChargedAfterEnd({ chargedAfterEnd: '2026-11-04' }, today)),
    ).toBe('Prélevé après la résiliation (4 nov.)')
    expect(formatChargedAfterEnd({ chargedAfterEnd: null }, today)).toBeNull()
  })

  it('shows a prepaid plan by its monthly cost and renews it by its term (#314)', () => {
    const plan = recurringItem({
      name: 'Hébergeur',
      cadence: 'yearly',
      termMonths: 24,
      typicalAmountCents: 18_000,
      monthlyEquivalentCents: 750,
      lastSeenDate: '2024-11-20',
      nextExpectedDate: '2026-11-20',
      renewalDate: '2026-11-20',
    })
    expect(text(formatAmountPerPeriod(plan))).toBe('7,50 € / mois')
    expect(text(formatPrepaid(plan))).toBe('payé 180,00 € pour 24 mois')
    expect(formatPrepaid(recurringItem())).toBeNull()
    expect(describeSchedule(plan)).toBe('tous les 24 mois, payé d’avance')
    expect(upcomingDebits([plan], '2026-11-06').map((u) => u.date)).toEqual([
      '2026-11-20',
    ])
    // Cancelled at the renewal: nothing upcoming.
    expect(
      upcomingDebits([{ ...plan, endedOn: '2026-11-20' }], '2026-11-06'),
    ).toEqual([])
    // An unimported renewal is carried a whole term forward, not a year.
    expect(
      upcomingDebits(
        [{ ...plan, nextExpectedDate: '2026-10-01' }],
        '2026-11-06',
        800,
      ).map((u) => u.date),
    ).toEqual(['2028-10-01'])
  })

  it('spreads a prepaid payment half to even, like the API', () => {
    expect(prepaidMonthlyCents(18_000, 24)).toBe(750)
    expect(prepaidMonthlyCents(9_999, 24)).toBe(417)
    expect(prepaidMonthlyCents(108, 24)).toBe(4)
    expect(prepaidMonthlyCents(132, 24)).toBe(6)
  })

  it('says when a series falls', () => {
    const at = (cadence: RecurringItemDto['cadence'], date: string) =>
      describeSchedule({
        cadence,
        nextExpectedDate: date,
        lastSeenDate: '2026-10-01',
      })
    expect(at('monthly', '2026-12-07')).toBe('le 7 du mois')
    expect(at('monthly', '2026-12-01')).toBe('le 1er du mois')
    expect(at('monthly', '2026-11-30')).toBe('en fin de mois')
    expect(at('weekly', '2026-11-09')).toBe('chaque lundi')
    expect(at('quarterly', '2026-12-07')).toBe('tous les 3 mois')
    expect(text(at('yearly', '2027-03-15'))).toBe('chaque année le 15 mars')
  })

  it('describes runs of equal amounts and the charge count', () => {
    const today = '2026-11-06'
    expect(
      text(
        formatRunPeriod(
          { from: '2026-08-07', to: '2026-11-07', count: 4 },
          today,
        ),
      ),
    ).toBe('août → nov. · 4 fois')
    expect(
      text(
        formatRunPeriod(
          { from: '2025-09-07', to: '2026-07-07', count: 11 },
          today,
        ),
      ),
    ).toBe('sept. 2025 → juil. · 11 fois')
    expect(
      formatRunPeriod(
        { from: '2026-11-03', to: '2026-11-03', count: 1 },
        today,
      ),
    ).toBe('nov. · 1 fois')
    expect(
      formatChargeCount(
        {
          occurrenceCount: 15,
          direction: 'debit',
          firstSeenDate: '2025-09-07',
        },
        today,
      ),
    ).toBe('15 prélèvements depuis septembre 2025')
    expect(
      formatChargeCount(
        {
          occurrenceCount: 1,
          direction: 'credit',
          firstSeenDate: '2026-11-03',
        },
        today,
      ),
    ).toBe('1 versement depuis novembre')
  })

  it('groups items by status and kind', () => {
    const groups = groupItems([
      recurringItem({ id: 's1', status: 'suggested', confidence: 0.5 }),
      recurringItem({ id: 's2', status: 'suggested', confidence: 0.9 }),
      recurringItem({ id: 'sub', isSubscription: true, isFixedCost: true }),
      recurringItem({ id: 'fix', isFixedCost: true }),
      recurringItem({ id: 'var', isFixedCost: false }),
      recurringItem({ id: 'inc', direction: 'credit' }),
      recurringItem({ id: 'dis', status: 'dismissed' }),
      // Cancelled: ended items apart, latest end first; a future end stays.
      recurringItem({ id: 'end1', endedOn: '2026-09-01', ended: true }),
      recurringItem({ id: 'end2', endedOn: '2026-10-01', ended: true }),
      recurringItem({
        id: 'soon',
        isSubscription: true,
        endedOn: '2026-12-01',
      }),
    ])
    expect(groups.suggestions.map((i) => i.id)).toEqual(['s2', 's1'])
    expect(groups.subscriptions.map((i) => i.id)).toEqual(['sub', 'soon'])
    expect(groups.ended.map((i) => i.id)).toEqual(['end2', 'end1'])
    expect(groups.fixed.map((i) => i.id)).toEqual(['fix'])
    expect(groups.variable.map((i) => i.id)).toEqual(['var'])
    expect(groups.incomes.map((i) => i.id)).toEqual(['inc'])
    expect(groups.dismissed.map((i) => i.id)).toEqual(['dis'])
  })
})

describe('categoryChoices', () => {
  /** Synthetic categories only. */
  const category = (slug: string, kind: CategoryDto['kind'] = 'expense') => ({
    id: slug,
    slug,
    name: slug,
    kind,
    color: null,
    icon: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  })
  const categories = [
    category('groceries'),
    category('subscriptions'),
    category('leisure'),
    category('rent'),
    category('salary', 'income'),
  ]

  it('offers the current and usual categories first, the rest on demand', () => {
    const few = categoryChoices(categories, 'debit', 'leisure', false)
    expect(few.shown.map((c) => c.slug)).toEqual([
      'leisure',
      'subscriptions',
      'rent',
    ])
    expect(few.hiddenCount).toBe(1)
    const all = categoryChoices(categories, 'debit', 'leisure', true)
    expect(all.shown.map((c) => c.slug)).toEqual([
      'leisure',
      'subscriptions',
      'rent',
      'groceries',
    ])
    // Credits get income categories.
    expect(
      categoryChoices(categories, 'credit', '', false).shown.map((c) => c.slug),
    ).toEqual(['salary'])
  })
})
