/**
 * Well-known merchants whose bank labels are too messy for the generic
 * cleanup (truncated names, payment-processor prefixes, billing suffixes).
 *
 * Each pattern is tested, in order, against the candidate merchant text once
 * it is uppercased, stripped of accents and has `*`, `_`, `/` turned into
 * spaces. The first match wins, so put the more specific entries first.
 *
 * Keep this table small: it is for forms the generic cleanup cannot fix, not a
 * merchant directory. Categorization rules (#12) handle everything else.
 */
export interface MerchantAlias {
  /** Display name returned as `merchant`. */
  name: string
  pattern: RegExp
}

export const MERCHANT_ALIASES: readonly MerchantAlias[] = [
  { name: 'Uber Eats', pattern: /^UBER ?EATS\b/ },
  // `UBR* PENDING UBE`, `UBER *TRIP`, `UBER BV`
  { name: 'Uber', pattern: /^(UBER|UBR)\b/ },
  { name: 'Amazon Prime', pattern: /^(AMAZON|AMZN) ?PRIME\b/ },
  // `AMAZON MKTPLACE`, `AMZN MKTP FR`, `AMAZON.FR`, `AMAZON PAYMENTS`
  { name: 'Amazon', pattern: /^(AMAZON|AMZN)(\b|MKTP)/ },
  // `APPLE COM/BILL`, `APPLE.COM/BILL`, `ITUNES.COM`
  { name: 'Apple', pattern: /^(APPLE[ .]?COM|ITUNES)\b/ },
  // `PAYPAL *SOMESHOP`, `PAYPAL EUROPE`
  { name: 'PayPal', pattern: /^PAYPAL\b/ },
  // `SNCF`, `OUI.SNCF`, `SNCF CONNECT`, `SNCF-VOYAGEURS`
  { name: 'SNCF', pattern: /^(OUI[ .]?)?SNCF\b/ },
  { name: 'Google', pattern: /^GOOGLE\b/ },
  { name: 'Netflix', pattern: /^NETFLIX/ },
  { name: 'Spotify', pattern: /^SPOTIFY/ },
]
