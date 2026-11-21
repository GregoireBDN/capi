/**
 * ISIN (ISO 6166, ADR 0006): 2 letters, 9 letters or digits, then a check
 * digit. Letters count as two digits (A = 10 … Z = 35) and the Luhn sum of
 * the whole must end in 0. The country prefix is not checked, so synthetic
 * fixtures use `ZZ…` ISINs that can never name a real security. The same
 * rule is the database's `isin_is_valid` (migration 0046) and the web's
 * `lib/isin.ts`.
 */

const FORMAT = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

/** Upper case, spaces and dashes dropped (`"zz00 msci-wd03"` → `"ZZ00MSCIWD03"`). */
export function normalizeIsin(text: string): string {
  return text.replace(/[\s-]/g, '').toUpperCase()
}

/** The check digit of the first 11 characters. */
export function isinCheckDigit(body: string): number {
  let digits = ''
  for (const char of body) {
    digits += /\d/.test(char) ? char : String(char.charCodeAt(0) - 55)
  }
  let total = 0
  let double = true
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    total += digit
    double = !double
  }
  return (10 - (total % 10)) % 10
}

/** Whether `isin` (already normalized) is a well-formed ISIN. */
export function isValidIsin(isin: string): boolean {
  return (
    FORMAT.test(isin) && isinCheckDigit(isin.slice(0, 11)) === Number(isin[11])
  )
}
