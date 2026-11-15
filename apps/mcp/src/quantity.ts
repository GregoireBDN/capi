/**
 * Crypto quantities as exact decimal strings (#104), the way the API stores
 * them (`numeric(38, 18)`): never through a float. Text typed by the model is
 * checked and rewritten in the canonical form the API accepts
 * (`^\d{1,20}(\.\d{1,18})?$`, no useless zeros), so two spellings of the same
 * quantity compare equal.
 */

const MAX_INTEGER_DIGITS = 20
const MAX_DECIMALS = 18

/**
 * `"0,50"` / `"1 234.5"` / `"0.123400000000000000"` → `"0.5"` / `"1234.5"` /
 * `"0.1234"`; `null` when the text isn't a plain non-negative decimal (sign,
 * exponent, more than 18 decimals or 20 integer digits, thousands separators
 * other than spaces).
 */
export function parseQuantity(text: string): string | null {
  const compact = text.replace(/[\s  ]/g, '')
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(compact)
  if (!match) return null
  const [, units = '', decimals = ''] = match
  if (decimals.length > MAX_DECIMALS) return null
  const integer = units.replace(/^0+(?=\d)/, '')
  if (integer.length > MAX_INTEGER_DIGITS) return null
  const fraction = decimals.replace(/0+$/, '')
  return fraction ? `${integer}.${fraction}` : integer
}

/** Canonical form of a quantity read from the API (it is always valid there). */
export function canonicalQuantity(quantity: string): string {
  return parseQuantity(quantity) ?? quantity
}

export function isZeroQuantity(quantity: string): boolean {
  return canonicalQuantity(quantity) === '0'
}

/** For French output: decimal comma, digits unchanged (`"0.5"` → `0,5`). */
export function frenchQuantity(quantity: string): string {
  return canonicalQuantity(quantity).replace('.', ',')
}
