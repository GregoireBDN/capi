import { addMonths, daysBetween } from './dates'

/**
 * Prepaid long-term subscriptions (#314): a plan paid once, upfront, for a
 * term of months (a 24-month VPS, a yearly AI plan...). Pure functions only:
 * no I/O, no logging (amounts are private data). Amounts are positive integer
 * cents, dates `YYYY-MM-DD` calendar dates.
 */

/** Terms the app offers (any term from 2 to 60 months is accepted). */
export const PREPAID_TERMS = [12, 24, 36] as const
export const PREPAID_TERM_MIN_MONTHS = 2
export const PREPAID_TERM_MAX_MONTHS = 60
/**
 * A charge of the same merchant this many days from the renewal date, either
 * way, is the renewal; past it without one, the plan was not renewed (the
 * item is inactive).
 */
export const PREPAID_RENEWAL_WINDOW_DAYS = 30
/** The renewal reminder (« Garder » / « Résilier ») shows this many days before. */
export const PREPAID_REMINDER_DAYS = 30

/**
 * `numerator / denominator` rounded to the nearest integer, ties to the even
 * one (banker's rounding). Integers only; `denominator` > 0.
 */
export function divideHalfEven(numerator: number, denominator: number): number {
  const sign = numerator < 0 ? -1 : 1
  const n = Math.abs(numerator)
  const quotient = Math.floor(n / denominator)
  const twice = 2 * (n - quotient * denominator)
  const rounded =
    twice > denominator || (twice === denominator && quotient % 2 === 1)
      ? quotient + 1
      : quotient
  return sign * rounded || 0
}

/** Monthly equivalent of `amountCents` paid for `termMonths`. */
export function prepaidMonthlyCents(
  amountCents: number,
  termMonths: number,
): number {
  return divideHalfEven(amountCents, termMonths)
}

/** Cost over a year of `amountCents` paid for `termMonths`. */
export function prepaidYearlyCents(
  amountCents: number,
  termMonths: number,
): number {
  return divideHalfEven(amountCents * 12, termMonths)
}

/**
 * Renewal date of a plan paid on `paidOn` for `termMonths`: the same day
 * `termMonths` later, clamped to the month length (2024-02-29 + 12 →
 * 2025-02-28; 2025-01-31 + 13 → 2026-02-28).
 */
export function renewalDate(paidOn: string, termMonths: number): string {
  return addMonths(paidOn, termMonths)
}

export interface PrepaidCandidate {
  id: string
  date: string
}

/**
 * Charges among `candidates` (not linked to any item, after the latest
 * payment) that renew the plan, oldest first: from `lastPaidOn`, the charge
 * closest to each renewal date within `PREPAID_RENEWAL_WINDOW_DAYS` (the
 * earlier one on a tie), then the next renewal from it, until one has none.
 */
export function matchRenewals(
  lastPaidOn: string,
  termMonths: number,
  candidates: readonly PrepaidCandidate[],
): PrepaidCandidate[] {
  const matched: PrepaidCandidate[] = []
  const used = new Set<string>()
  let last = lastPaidOn
  for (;;) {
    const renewal = renewalDate(last, termMonths)
    let best: PrepaidCandidate | null = null
    let bestGap = Infinity
    for (const candidate of candidates) {
      if (used.has(candidate.id) || candidate.date <= last) continue
      const gap = Math.abs(daysBetween(renewal, candidate.date))
      if (gap > PREPAID_RENEWAL_WINDOW_DAYS) continue
      if (
        gap < bestGap ||
        (gap === bestGap && best !== null && candidate.date < best.date)
      ) {
        best = candidate
        bestGap = gap
      }
    }
    if (!best) return matched
    matched.push(best)
    used.add(best.id)
    last = best.date
  }
}

/**
 * Whether a plan renewing on `renewalOn` is still running as of `asOf` (the
 * account's data horizon): until the renewal window is over. Past it with no
 * renewal charge, it was not renewed.
 */
export function prepaidActive(renewalOn: string, asOf: string): boolean {
  return daysBetween(renewalOn, asOf) <= PREPAID_RENEWAL_WINDOW_DAYS
}

/**
 * Whether the renewal reminder shows on `today`: from
 * `PREPAID_REMINDER_DAYS` before the renewal to the renewal day, unless the
 * item is cancelled (`endedOn`) or the owner kept this renewal
 * (`renewalKeptOn`).
 */
export function renewalReminderDue({
  renewalOn,
  endedOn,
  renewalKeptOn,
  today,
}: {
  renewalOn: string
  endedOn: string | null
  renewalKeptOn: string | null
  today: string
}): boolean {
  if (endedOn !== null || renewalKeptOn === renewalOn) return false
  const days = daysBetween(today, renewalOn)
  return days >= 0 && days <= PREPAID_REMINDER_DAYS
}
