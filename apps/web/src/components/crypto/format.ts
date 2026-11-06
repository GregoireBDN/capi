/**
 * Crypto quantities and prices are exact decimal strings (`"0.12345678"`).
 * They are parsed and printed as text, never through a JS float: `Intl`
 * formats a numeric string exactly.
 */

/** Same bounds as the API (`numeric(38, 18)` and `numeric(38, 12)`). */
const QUANTITY = { integer: 20, scale: 18 }
const PRICE = { integer: 26, scale: 12 }

/** Formats a decimal string; the cast is for `Intl`'s exact string input. */
const formatString = (format: Intl.NumberFormat, value: string) =>
  format.format(value as unknown as number)

const quantityFormat = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 8,
})

/** `"1234.123456789"` → `1 234,12345679` (up to 8 decimals). */
export function formatQuantity(quantity: string): string {
  return formatString(quantityFormat, quantity)
}

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
const smallEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumSignificantDigits: 4,
})

/** Price per unit: cents above 1 €, 4 significant digits below (`0,0001234 €`). */
export function formatPrice(priceEur: string): string {
  const below1 = /^0(\.|$)/.test(priceEur) && priceEur !== '0'
  return formatString(below1 ? smallEuros : euros, priceEur)
}

function parseDecimalInput(
  text: string,
  { integer, scale }: { integer: number; scale: number },
): string | null {
  const compact = text.replace(/\s/g, '')
  const match = /^(\d+)(?:[.,](\d*))?$/.exec(compact)
  if (!match) return null
  const whole = match[1].replace(/^0+(?=\d)/, '')
  const fraction = (match.at(2) ?? '').replace(/0+$/, '')
  if (whole.length > integer || fraction.length > scale) return null
  return fraction === '' ? whole : `${whole}.${fraction}`
}

/** `1 234,5` / `0.5` → `"1234.5"`, or null (≤ 20 digits, ≤ 18 decimals). */
export function parseQuantityInput(text: string): string | null {
  return parseDecimalInput(text, QUANTITY)
}

/** `0,000123` → `"0.000123"`, or null (≤ 12 decimals). */
export function parsePriceInput(text: string): string | null {
  return parseDecimalInput(text, PRICE)
}

/** `"0.5"` → `0,5`, for an input field. */
export function decimalToInput(value: string): string {
  return value.replace('.', ',')
}

/** `à l’instant`, `il y a 3 min`, `il y a 2 h`, `il y a 4 j`. */
export function formatPriceAge(fetchedAt: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - Date.parse(fetchedAt)) / 60_000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  return `il y a ${Math.floor(hours / 24)} j`
}
