/**
 * Euro amounts as found on statements, read straight into integer cents: the
 * text is split on its decimal separator and never goes through `parseFloat`.
 */

/** Same bound as the API (`Number.MAX_SAFE_INTEGER` cents). */
const MAX_CENTS = Number.MAX_SAFE_INTEGER

/**
 * Signed amount in French or plain notation → cents, or null.
 *
 * - `1 234,56`, `1234,5`, `-1 234,56 €`, `+300`: comma decimal, spaces
 *   (no-break ones included) as thousands separators;
 * - `1.234,56`, `1.234`: dots as thousands separators;
 * - `1234.56`: a dot followed by one or two digits is a decimal point.
 */
export function parseAmountToCents(text: string): number | null {
  let compact = text.replace(/\s/g, '').replace(/^€|€$/g, '')
  let sign = 1
  if (/^[-−+]/.test(compact)) {
    if (compact[0] !== '+') sign = -1
    compact = compact.slice(1)
  }

  let integer = compact
  let fraction = ''
  const comma = compact.indexOf(',')
  if (comma !== -1) {
    integer = compact.slice(0, comma)
    fraction = compact.slice(comma + 1)
  } else if (/\.\d{1,2}$/.test(compact)) {
    const dot = compact.lastIndexOf('.')
    integer = compact.slice(0, dot)
    fraction = compact.slice(dot + 1)
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(integer)) integer = integer.replace(/\./g, '')
  if (!/^\d+$/.test(integer) || !/^\d{0,2}$/.test(fraction)) return null

  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return null
  return sign * cents || 0
}

/** Cents as an editable amount: `40000` → `"400"`, `-12345` → `"-123,45"`. */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  const euros = Math.trunc(absolute / 100)
  const rest = absolute % 100
  return rest === 0
    ? `${sign}${euros}`
    : `${sign}${euros},${String(rest).padStart(2, '0')}`
}
