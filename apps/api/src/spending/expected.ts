import { monthEnd } from '#/dashboard/calendar'
import { expectedOccurrences } from '#/forecast/project'
import type { RecurringItemDto } from '#/recurring/dto/recurring.dto'
import { firstDay } from './spending-months'

/** The fields of a recurring item the expected costs need. */
export type ExpectedSeries = Pick<
  RecurringItemDto,
  | 'id'
  | 'accountId'
  | 'name'
  | 'direction'
  | 'status'
  | 'active'
  | 'cadence'
  | 'amountType'
  | 'isFixedCost'
  | 'typicalAmountCents'
  | 'nextExpectedDate'
  | 'endedOn'
  | 'termMonths'
  | 'categoryId'
  | 'categoryName'
  | 'categoryColor'
> & { occurrences: readonly { date: string }[] }

/**
 * Recurring costs still expected in `month` (subscriptions, rent, ...), per
 * category id (`null` = no category), positive integer cents.
 *
 * Only confirmed, active debits count, with the forecast's rules
 * (`expectedOccurrences`): an occurrence already booked, or missed (the
 * account's data goes past it by more than the cadence tolerance), is not
 * expected, nor any on or after its cancellation date. `horizons` is the
 * day each account's data goes up to. Late
 * occurrences of the month before are left out: they belong to that month.
 *
 * Pure: no I/O, no logging (amounts are private).
 */
export function expectedByCategory(
  items: readonly ExpectedSeries[],
  month: string,
  horizons: ReadonlyMap<string, string>,
): Map<string | null, number> {
  const start = firstDay(month)
  const window = { today: start, start, monthEnd: monthEnd(month) }
  const result = new Map<string | null, number>()
  for (const item of items) {
    if (item.status !== 'confirmed' || !item.active) continue
    if (item.direction !== 'debit') continue
    const occurrences = expectedOccurrences(
      {
        id: item.id,
        accountId: item.accountId,
        name: item.name,
        direction: item.direction,
        cadence: item.cadence,
        amountType: item.amountType,
        isFixedCost: item.isFixedCost,
        typicalAmountCents: item.typicalAmountCents,
        nextExpectedDate: item.nextExpectedDate,
        endedOn: item.endedOn,
        termMonths: item.termMonths,
        bookedDates: item.occurrences.map((o) => o.date),
        categoryName: item.categoryName,
        categoryColor: item.categoryColor,
      },
      window,
      horizons.get(item.accountId) ?? null,
    )
    for (const occurrence of occurrences) {
      if (occurrence.expectedDate < start) continue
      result.set(
        item.categoryId,
        (result.get(item.categoryId) ?? 0) - occurrence.amountCents,
      )
    }
  }
  return result
}
