import { formatDecimal, parseDecimal } from '#/common/decimal'
import type { DateFormat, DecimalSeparator } from './profile.types'

/**
 * Cell parsers of the CSV profiles (#431). Amounts go straight from text to
 * integer cents and quantities stay exact decimal strings: never through a
 * float. Every error message is generic and never echoes the cell.
 */

/** Currency marks dropped around an amount (`12,50 €`, `EUR 12.50`). */
const CURRENCY = /€|\bEUR\b/gi

/**
 * A signed amount in integer cents.
 *
 * - With a `decimalSeparator`: the other mark, spaces and `'` are thousands
 *   separators (`-1 234,56`, `1.234,56`, `1,234.56`), at most two decimals.
 * - Without (the standard format): `.` or `,` as the decimal mark, spaces
 *   only as thousands separators (`-1234.56`, `-1 234,56`).
 *
 * A leading `+`/`-` (or U+2212) gives the sign; a currency mark is ignored.
 *
 * @throws {Error} on anything else.
 */
export function parseAmountToCents(
  text: string,
  decimalSeparator: DecimalSeparator | null,
): number {
  let s = text
    .replace(CURRENCY, '')
    .replace(/\u2212/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  let sign = 1
  if (s.startsWith('-') || s.startsWith('+')) {
    if (s.startsWith('-')) sign = -1
    s = s.slice(1).trim()
  }
  let integer: string
  let fraction: string
  if (decimalSeparator === null) {
    const match = /^(\d+|\d{1,3}(?: \d{3})+)(?:[.,](\d{1,2}))?$/.exec(s)
    if (!match) throw new Error('Invalid amount')
    integer = match[1].replace(/ /g, '')
    fraction = match[2] ?? ''
  } else {
    const parts = s.split(decimalSeparator)
    if (parts.length > 2) throw new Error('Invalid amount')
    const other = decimalSeparator === ',' ? '.' : ','
    // Plain digits, or groups of three after a thousands separator.
    const grouped = new RegExp(`^\\d{1,3}(?:[ '${other}]\\d{3})+$`)
    if (!/^\d+$/.test(parts[0]) && !grouped.test(parts[0])) {
      throw new Error('Invalid amount')
    }
    integer = parts[0].replace(/\D/g, '')
    fraction = parts[1] ?? ''
    if (parts.length === 2 && !/^\d{1,2}$/.test(fraction)) {
      throw new Error('Invalid amount')
    }
  }
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) throw new Error('Amount out of range')
  return cents === 0 ? 0 : sign * cents
}

/**
 * An exact non-negative decimal (quantity, unit price), canonical with `.`
 * (`"0,50"` → `"0.5"`). `decimalSeparator` null accepts `.` or `,`; a given
 * one refuses the other mark (no thousands separator but spaces, since a
 * quantity's `1.234` is ambiguous).
 *
 * @throws {Error} on anything else.
 */
export function parseExactDecimal(
  text: string,
  decimalSeparator: DecimalSeparator | null,
): string {
  const s = text.replace(CURRENCY, '').replace(/\s/g, '')
  const other = decimalSeparator === ',' ? '.' : ','
  if (decimalSeparator !== null && s.includes(other)) {
    throw new Error('Invalid number')
  }
  const parsed = parseDecimal(s.replace(',', '.'))
  if (!parsed) throw new Error('Invalid number')
  return formatDecimal(parsed)
}

/**
 * A calendar date as `YYYY-MM-DD`, read with `format`; null `format` accepts
 * `yyyy-mm-dd` and `dd/mm/yyyy` (the standard format). Rejects days that do
 * not exist (`31/02/2026`).
 *
 * @throws {Error} on anything else.
 */
export function parseDateWithFormat(
  text: string,
  format: DateFormat | null,
): string {
  const s = text.trim()
  if (format === null) {
    return /^\d{4}-/.test(s)
      ? parseDateWithFormat(s, 'yyyy-mm-dd')
      : parseDateWithFormat(s, 'dd/mm/yyyy')
  }
  const pattern = DATE_PATTERNS[format]
  const match = pattern.regex.exec(s)
  if (!match) throw new Error('Invalid date')
  const day = Number(match[pattern.day])
  const month = Number(match[pattern.month])
  let year = Number(match[pattern.year])
  if (format === 'dd/mm/yy') year += 2000
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    throw new Error('Invalid date')
  }
  if (day > daysInMonth(year, month)) throw new Error('Invalid date')
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`
}

const DATE_PATTERNS: Record<
  DateFormat,
  { regex: RegExp; day: number; month: number; year: number }
> = {
  'yyyy-mm-dd': {
    regex: /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/,
    year: 1,
    month: 2,
    day: 3,
  },
  'dd/mm/yyyy': {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    day: 1,
    month: 2,
    year: 3,
  },
  'dd-mm-yyyy': {
    regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    day: 1,
    month: 2,
    year: 3,
  },
  'dd.mm.yyyy': {
    regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    day: 1,
    month: 2,
    year: 3,
  },
  'dd/mm/yy': {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
    day: 1,
    month: 2,
    year: 3,
  },
  'mm/dd/yyyy': {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    month: 1,
    day: 2,
    year: 3,
  },
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return leap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Whether `text` reads as a date in `format` (used to guess a format). */
export function readsAsDate(text: string, format: DateFormat): boolean {
  try {
    parseDateWithFormat(text, format)
    return true
  } catch {
    return false
  }
}
