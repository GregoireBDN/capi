/**
 * Amounts are typed unsigned (#326): the iOS decimal pad has no « - », so the
 * sign is a choice next to the amount, never a character of it. The text
 * stays what the user sees ("12,5") and is read into cents only through
 * `parseEurosToCents`: never through a float.
 */

import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import {
  MAX_AMOUNT_CENTS,
  typedAmount,
} from '#/components/expenses/amount-entry'

/** `out` is money out (negative), `in` money in (positive). */
export type AmountSign = 'out' | 'in'

/**
 * What a change of the field's text gives: the unsigned amount, and the
 * sign when the text started with one (a pasted « -12,50 », or « - » typed on
 * a physical keyboard). Null when it isn't an amount (letters, a third
 * decimal, over `maxCents`): the field then keeps its previous value.
 */
export function readAmountInput(
  text: string,
  maxCents: number = MAX_AMOUNT_CENTS,
): { amount: string; sign: AmountSign | null } | null {
  const trimmed = text.trim()
  const mark = /^[-−–+]/.exec(trimmed)?.[0]
  const sign: AmountSign | null = !mark ? null : mark === '+' ? 'in' : 'out'
  const amount = typedAmount(mark ? trimmed.slice(1) : trimmed, maxCents)
  if (amount === null) return null
  // « ,5 » typed first reads « 0,5 ».
  return { amount: amount.startsWith(',') ? `0${amount}` : amount, sign }
}

/** Signed cents of an unsigned amount and its sign, or null when invalid. */
export function signedCents(amount: string, sign: AmountSign): number | null {
  const cents = parseEurosToCents(amount)
  if (cents === null) return null
  return sign === 'out' && cents !== 0 ? -cents : cents
}

/** Signed cents as the field shows them: `-1250` → « 12,50 » and `out`. */
export function splitSignedCents(cents: number): {
  amount: string
  sign: AmountSign
} {
  return {
    amount: centsToInput(Math.abs(cents)),
    sign: cents < 0 ? 'out' : 'in',
  }
}

/** Cap of the fields holding values rather than payments (1 000 000 000 €). */
export const LARGE_AMOUNT_CENTS = 100_000_000_000
