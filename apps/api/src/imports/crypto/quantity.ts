import { decimalFromJsonNumber, divideHalfEven } from '#/crypto/decimal'

/**
 * Signed crypto quantities as exact `bigint`s at 18 decimals, the scale of
 * the `numeric(38, 18)` columns. Exports are read from their text: no float
 * is ever involved.
 */

export const QUANTITY_SCALE = 18
const UNIT = 10n ** BigInt(QUANTITY_SCALE)
/** Integer digits a `numeric(38, 18)` holds. */
const MAX_INTEGER_DIGITS = 38 - QUANTITY_SCALE

/**
 * `"-0.0012"`, `"+1"`, `"1E-8"`, `"1,234.5"` (thousands commas) → units of
 * 10^-18, or null when not a number or when it has more than 18 decimals or
 * 20 integer digits.
 */
export function parseQuantity(text: string): bigint | null {
  let value = text.trim().replace(/,/g, '')
  let negative = false
  if (value.startsWith('-') || value.startsWith('+')) {
    negative = value.startsWith('-')
    value = value.slice(1)
  }
  if (value === '' || !/^[\d.eE+-]+$/.test(value)) return null
  const canonical = decimalFromJsonNumber(value)
  if (canonical === null) return null
  const [integer, fraction = ''] = canonical.split('.')
  if (fraction.length > QUANTITY_SCALE) return null
  if (integer.replace(/^0+/, '').length > MAX_INTEGER_DIGITS) return null
  const units = BigInt(integer + fraction.padEnd(QUANTITY_SCALE, '0'))
  return negative ? -units : units
}

/** Canonical signed decimal string (`-0.0012`, `3`). */
export function formatQuantity(units: bigint): string {
  const negative = units < 0n
  const abs = negative ? -units : units
  const integer = abs / UNIT
  const fraction = (abs % UNIT)
    .toString()
    .padStart(QUANTITY_SCALE, '0')
    .replace(/0+$/, '')
  const text = fraction === '' ? `${integer}` : `${integer}.${fraction}`
  return negative && abs !== 0n ? `-${text}` : text
}

/** EUR quantity (units of 10^-18) as cents, rounded half to even. */
export function quantityToCents(units: bigint): number {
  const negative = units < 0n
  const cents = divideHalfEven(negative ? -units : units, UNIT / 100n)
  return Number(negative ? -cents : cents)
}

/**
 * Money cell to signed cents: `€1234.56`, `-€12.3`, `€-12.30`, `1,234.567 €`,
 * `EUR 12`. Long decimals are rounded half to even. Null when unreadable.
 */
export function parseMoneyCents(text: string): number | null {
  const cleaned = text
    .replace(/[€\s ]|EUR/gi, '')
    .replace(/,/g, '')
    .trim()
  if (cleaned === '') return null
  const units = parseMoneyUnits(cleaned)
  return units === null ? null : quantityToCents(units)
}

function parseMoneyUnits(text: string): bigint | null {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text)
  if (!match) return null
  const fraction = match[3] ?? ''
  const digits = BigInt(match[2] + fraction)
  const scaled =
    fraction.length <= QUANTITY_SCALE
      ? digits * 10n ** BigInt(QUANTITY_SCALE - fraction.length)
      : divideHalfEven(digits, 10n ** BigInt(fraction.length - QUANTITY_SCALE))
  return match[1] === '-' ? -scaled : scaled
}
