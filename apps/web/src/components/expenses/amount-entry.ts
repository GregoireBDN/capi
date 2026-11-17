/**
 * The amount of a manual transaction as typed, key by key, on the sheet's
 * keypad or a physical keyboard (#245). It stays the text the user sees
 * ("12,5"), read into cents with `parseEurosToCents` only when saved: never
 * through a float.
 */

/** Highest amount the API accepts (1 000 000 €). */
export const MAX_AMOUNT_CENTS = 100_000_000

/** A key of the keypad: a digit, the decimal comma or "effacer". */
export type AmountKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | ','
  | 'back'

/** `^digits(,0–2 digits)?$`, or empty. */
const TYPED = /^(\d*)(?:,(\d{0,2}))?$/

/** Cents of an amount as typed, or null when it is not one. */
function typedCents(amount: string): number | null {
  const match = TYPED.exec(amount)
  if (!match) return null
  const euros = Number(match[1] || '0')
  const cents = Number((match.at(2) ?? '').padEnd(2, '0'))
  return euros * 100 + cents
}

/**
 * The amount once `key` is pressed: a second comma, a third decimal or an
 * amount past the API's limit are ignored, and a leading zero is replaced
 * ("0" then "5" gives "5").
 */
export function pressAmountKey(amount: string, key: AmountKey): string {
  if (key === 'back') return amount.slice(0, -1)
  if (key === ',') {
    if (amount.includes(',')) return amount
    return `${amount || '0'},`
  }
  const next = amount === '0' ? key : amount + key
  const cents = typedCents(next)
  return cents === null || cents > MAX_AMOUNT_CENTS ? amount : next
}

/** The key a physical keyboard key stands for, or null. */
export function amountKeyOf(key: string): AmountKey | null {
  if (/^\d$/.test(key)) return key as AmountKey
  if (key === ',' || key === '.') return ','
  if (key === 'Backspace') return 'back'
  return null
}

/**
 * Text typed or pasted in the amount field (desktop): spaces and a trailing
 * "€" dropped, "." read as ",". Returns null when it isn't an amount the
 * keypad could have typed, so the field keeps its previous value.
 */
export function typedAmount(text: string): string | null {
  const compact = text.replace(/\s/g, '').replace(/€$/, '').replace('.', ',')
  if (!TYPED.test(compact)) return null
  const cents = typedCents(compact)
  return cents === null || cents > MAX_AMOUNT_CENTS ? null : compact
}
