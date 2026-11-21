/**
 * ISIN check of sync_security_positions, the API's rule (`positions/isin.ts`, and the
 * database's `isin_is_valid`, ADR 0006): 2 letters, 9 letters or digits and
 * a check digit, letters counting as A = 10 … Z = 35 in a Luhn sum.
 */

const FORMAT = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

/** Upper case, spaces and dashes dropped. */
export function normalizeIsin(text: string): string {
  return text.replace(/[\s-]/g, '').toUpperCase()
}

function checkDigit(body: string): number {
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

/** Whether `isin` (normalized) is a well-formed ISIN. */
export function isValidIsin(isin: string): boolean {
  return FORMAT.test(isin) && checkDigit(isin.slice(0, 11)) === Number(isin[11])
}
