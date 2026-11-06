/**
 * Euro amounts typed by the user, read straight into integer cents: the text
 * is split on the decimal separator and never goes through `parseFloat`.
 */

import { formatUnsignedZero } from '#/lib/money'

/** Highest target the API accepts (10 000 000 €). */
export const MAX_TARGET_CENTS = 1_000_000_000

/**
 * `"400"` → 40000, `"1 234,5"` → 123450, `"12.30 €"` → 1230. Spaces (`\s`
 * covers the no-break ones `Intl` prints), a trailing `€` and one `,` or `.` decimal separator
 * with up to two digits are accepted. Returns null for anything else.
 */
export function parseEurosToCents(text: string): number | null {
  const compact = text.replace(/\s/g, '').replace(/€$/, '')
  const match = /^(\d+)(?:[.,](\d{0,2}))?$/.exec(compact)
  if (!match) return null
  const euros = Number(match[1])
  const cents = Number((match.at(2) ?? '').padEnd(2, '0'))
  const total = euros * 100 + cents
  return Number.isSafeInteger(total) ? total : null
}

/** Cents as an editable amount: `40000` → `"400"`, `12345` → `"123,45"`. */
export function centsToInput(cents: number): string {
  const euros = Math.trunc(cents / 100)
  const rest = Math.abs(cents % 100)
  return rest === 0
    ? String(euros)
    : `${euros},${String(rest).padStart(2, '0')}`
}

/** Error message for a target typed by the user, or null when valid. */
export function targetError(text: string): string | null {
  const cents = parseEurosToCents(text)
  if (text.trim() === '') return 'Indiquez un montant'
  if (cents === null) return 'Montant invalide (ex. 350 ou 350,50)'
  if (cents <= 0) return 'Le montant doit être supérieur à 0'
  if (cents > MAX_TARGET_CENTS) return 'Montant trop élevé'
  return null
}

const wholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const exactEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

/**
 * Compact but exact amount for the meters: `36 €` for a whole euro,
 * `44,59 €` otherwise (rounding would hide a 0,10 € overrun).
 */
export function formatBudgetAmount(cents: number): string {
  return formatUnsignedZero(
    cents % 100 === 0 ? wholeEuros : exactEuros,
    cents / 100,
  )
}
