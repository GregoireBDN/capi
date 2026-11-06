/**
 * Exact non-negative decimals on `BigInt`, for crypto quantities and prices.
 *
 * Quantities (`numeric(38, 18)`) and EUR prices (`numeric(38, 12)`) travel as
 * decimal strings (`"0.00012345"`) and never go through a JS float: a value is
 * held as `digits / 10^scale` with `digits` a `bigint`.
 */

export interface Decimal {
  /** Value × 10^scale. */
  digits: bigint
  /** Number of decimal places. */
  scale: number
}

const DECIMAL = /^(\d+)(?:\.(\d+))?$/
const JSON_NUMBER = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/
/** Exponents beyond this are refused instead of building huge integers. */
const MAX_EXPONENT = 64

const pow10 = (n: number) => 10n ** BigInt(n)

/** `"12.50"` → `{ digits: 1250n, scale: 2 }`, or null if not a plain decimal. */
export function parseDecimal(text: string): Decimal | null {
  const match = DECIMAL.exec(text)
  if (!match) return null
  const fraction = match[2] ?? ''
  return { digits: BigInt(match[1] + fraction), scale: fraction.length }
}

/** Canonical string: no leading zeros, no trailing fractional zeros. */
export function formatDecimal({ digits, scale }: Decimal): string {
  const text = digits.toString().padStart(scale + 1, '0')
  if (scale === 0) return text
  const integer = text.slice(0, text.length - scale)
  const fraction = text.slice(text.length - scale).replace(/0+$/, '')
  return fraction === '' ? integer : `${integer}.${fraction}`
}

/** Canonical form of a decimal string (`"001.500"` → `"1.5"`); throws if invalid. */
export function normalizeDecimal(text: string): string {
  const parsed = parseDecimal(text)
  if (!parsed) throw new Error('Not a decimal')
  return formatDecimal(parsed)
}

/** `numerator / denominator` rounded half to even (both non-negative). */
export function divideHalfEven(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n || numerator < 0n) throw new Error('Out of range')
  const quotient = numerator / denominator
  const twice = (numerator % denominator) * 2n
  if (twice > denominator) return quotient + 1n
  if (twice === denominator && quotient % 2n === 1n) return quotient + 1n
  return quotient
}

/** The same value with exactly `scale` decimals, rounded half to even. */
export function rescale(value: Decimal, scale: number): Decimal {
  if (scale >= value.scale) {
    return { digits: value.digits * pow10(scale - value.scale), scale }
  }
  return {
    digits: divideHalfEven(value.digits, pow10(value.scale - scale)),
    scale,
  }
}

/** Whether `text` is a plain decimal with at most these integer / fractional digits. */
export function fitsNumeric(
  text: string,
  integerDigits: number,
  scale: number,
): boolean {
  const match = DECIMAL.exec(text)
  if (!match) return false
  const integer = match[1].replace(/^0+(?=\d)/, '')
  return integer.length <= integerDigits && (match[2] ?? '').length <= scale
}

/**
 * `quantity × priceEur` in integer cents, rounded half to even, computed
 * exactly. Both arguments are plain decimal strings.
 */
export function valueInCents(quantity: string, priceEur: string): bigint {
  const q = parseDecimal(quantity)
  const p = parseDecimal(priceEur)
  if (!q || !p) throw new Error('Not a decimal')
  return divideHalfEven(q.digits * p.digits * 100n, pow10(q.scale + p.scale))
}

/**
 * A JSON number literal (`61234.5`, `1.23e-7`, `4E3`) as a canonical decimal
 * string, read from its text so no float is involved. Null for negative or
 * malformed literals and absurd exponents.
 */
export function decimalFromJsonNumber(literal: string): string | null {
  const match = JSON_NUMBER.exec(literal)
  if (!match || match[1] === '-') return null
  const exponent = Number(match[4] ?? '0')
  if (Math.abs(exponent) > MAX_EXPONENT) return null
  const fraction = match[3] ?? ''
  const digits = BigInt(match[2] + fraction)
  const scale = fraction.length - exponent
  return formatDecimal(
    scale >= 0
      ? { digits, scale }
      : { digits: digits * pow10(-scale), scale: 0 },
  )
}

/** Prefix marking the strings `quoteJsonNumbers` made out of numbers. */
export const JSON_NUMBER_MARK = '\uE000'

/**
 * Wraps every number literal of a JSON text in quotes, prefixed with
 * `JSON_NUMBER_MARK`, so `JSON.parse` keeps its exact text instead of turning
 * it into a float, and real strings stay distinguishable. Strings are left
 * alone.
 */
export function quoteJsonNumbers(json: string): string {
  let out = ''
  let i = 0
  while (i < json.length) {
    const char = json[i]
    if (char === '"') {
      let end = i + 1
      while (end < json.length && json[end] !== '"') {
        end += json[end] === '\\' ? 2 : 1
      }
      out += json.slice(i, end + 1)
      i = end + 1
    } else if (char === '-' || (char >= '0' && char <= '9')) {
      let end = i + 1
      while (end < json.length && /[0-9.eE+-]/.test(json[end])) end++
      out += `"${JSON_NUMBER_MARK}${json.slice(i, end)}"`
      i = end
    } else {
      out += char
      i++
    }
  }
  return out
}
