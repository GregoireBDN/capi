import { daysInMonth } from '#/recurring/dates'
import type { ExpectedRepaymentStatus } from './dto/owed.dto'
import { recurringShareOf } from './shares'

/**
 * Repayments expected in a month from recurring items shared with a contact
 * (#359, the partner case). Pure, no I/O.
 */

export interface SharedRecurringItem {
  id: string
  name: string
  accountId: string
  contactId: string
  contactName: string
  /** The contact's usual repayment day, or null (month end). */
  repaymentDay: number | null
  share: { bps: number | null; amountCents: number | null }
  shareFrom: string
  /** Positive cents. */
  typicalAmountCents: number
  nextExpectedDate: string | null
  active: boolean
  endedOn: string | null
  /** Booked charges of the series (positive cents). */
  occurrences: readonly {
    transactionId: string
    date: string
    amountCents: number
  }[]
}

/** The contact's receivable on a booked charge. */
export interface ChargeReceivable {
  id: string
  amountCents: number
  repaidCents: number
  /** The part let go (#437): no longer expected. */
  forgivenCents: number
}

export interface ExpectedRepayment {
  recurringItemId: string
  name: string
  contactId: string
  contactName: string
  accountId: string
  expectedCents: number
  receivedCents: number
  date: string
  status: ExpectedRepaymentStatus
  receivableId: string | null
}

/** The day a contact's repayment is expected in `month` (`YYYY-MM`). */
export function expectedDay(
  month: string,
  repaymentDay: number | null,
): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const last = daysInMonth(year, monthNumber)
  const day = Math.min(repaymentDay ?? last, last)
  return `${month}-${String(day).padStart(2, '0')}`
}

/**
 * What each shared item's contact should repay in `month`: their receivable
 * on each charge booked in the month (a charge let go is left out), or,
 * when none is booked yet, their share of the charge still expected in the
 * month (not on or after a cancellation, not before the share starts).
 * `receivableOf` finds the contact's receivable on a booked charge.
 */
export function expectedRepayments(
  items: readonly SharedRecurringItem[],
  month: string,
  receivableOf: (
    transactionId: string,
    contactId: string,
  ) => ChargeReceivable | undefined,
): ExpectedRepayment[] {
  const result: ExpectedRepayment[] = []
  for (const item of items) {
    const date = expectedDay(month, item.repaymentDay)
    const base = {
      recurringItemId: item.id,
      name: item.name,
      contactId: item.contactId,
      contactName: item.contactName,
      accountId: item.accountId,
      date,
    }
    const booked = item.occurrences.filter((o) => o.date.startsWith(month))
    if (booked.length > 0) {
      for (const occurrence of booked) {
        const receivable = receivableOf(
          occurrence.transactionId,
          item.contactId,
        )
        if (!receivable) continue
        // What is still claimed: the share minus the part let go (#437).
        const claimed = receivable.amountCents - receivable.forgivenCents
        const received = Math.min(receivable.repaidCents, claimed)
        // Let go with nothing left to claim: not expected any more.
        if (receivable.forgivenCents > 0 && received >= claimed) continue
        result.push({
          ...base,
          expectedCents: claimed,
          receivedCents: received,
          status:
            received >= claimed
              ? 'received'
              : received > 0
                ? 'partial'
                : 'expected',
          receivableId: receivable.id,
        })
      }
      continue
    }
    const next = item.nextExpectedDate
    if (
      !item.active ||
      next === null ||
      !next.startsWith(month) ||
      next < item.shareFrom ||
      (item.endedOn !== null && next >= item.endedOn)
    ) {
      continue
    }
    const expectedCents = recurringShareOf(item.typicalAmountCents, item.share)
    if (expectedCents <= 0) continue
    result.push({
      ...base,
      expectedCents,
      receivedCents: 0,
      status: 'expected',
      receivableId: null,
    })
  }
  return result.sort(
    (a, b) =>
      a.contactName.localeCompare(b.contactName, 'fr') ||
      a.name.localeCompare(b.name, 'fr'),
  )
}
