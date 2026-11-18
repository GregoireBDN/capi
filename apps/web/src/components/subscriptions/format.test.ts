import { describe, expect, it } from 'vitest'
import type { RecurringItemDto } from '#/api/types.gen'
import {
  addMonths,
  formatChargedAfterEnd,
  formatEnd,
  formatPriceChange,
  formatRelativeDay,
  groupItems,
  todayInParis,
  upcomingDebits,
} from './format'
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
