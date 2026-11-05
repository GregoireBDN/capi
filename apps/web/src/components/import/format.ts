import { format, parseISO } from 'date-fns'

export { plural } from '#/lib/plural'

/**
 * Calendar date `YYYY-MM-DD` → `dd/MM/yyyy`. Parsed as a local date (no time
 * zone shift), so the day shown is always the day stored.
 */
export function formatDate(date: string): string {
  return format(parseISO(date), 'dd/MM/yyyy')
}

/** ISO timestamp → `dd/MM/yyyy à HH:mm` in the viewer's time zone. */
export function formatDateTime(timestamp: string): string {
  return format(new Date(timestamp), "dd/MM/yyyy 'à' HH:mm")
}

/** "du 01/03/2026 au 31/03/2026", a single day, or "—" when unknown. */
export function formatPeriod(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  if (start === end) return `le ${formatDate(start)}`
  return `du ${formatDate(start)} au ${formatDate(end)}`
}

const REASON_PARTS: [RegExp, string][] = [
  [/^Same amount$/i, 'même montant'],
  [/^same day$/i, 'même jour'],
  [/^1 day apart$/i, '1 jour d’écart'],
  [/^(\d+) days apart$/i, '$1 jours d’écart'],
  [/^same merchant$/i, 'même marchand'],
  [/^similar label$/i, 'libellé proche'],
  [/^same balance$/i, 'même solde'],
]

/**
 * The API explains conflicts in English ("Same amount, same day, similar
 * label"); translate the known parts, drop the reason if one is unknown.
 */
export function conflictReasonFr(reason: string | null): string | null {
  if (!reason) return null
  const parts = reason.split(',').map((part) => part.trim())
  const translated = parts.map((part) => {
    const match = REASON_PARTS.find(([pattern]) => pattern.test(part))
    return match ? part.replace(match[0], match[1]) : null
  })
  if (translated.some((part) => part === null)) return null
  const text = translated.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const ISSUE_PARTS: [RegExp, string][] = [
  [/^Unterminated quoted field$/i, 'guillemet non fermé'],
  [/^Expected (\d+) fields, found (\d+)$/i, '$2 colonnes au lieu de $1'],
  [/^Invalid or missing date$/i, 'date invalide ou manquante'],
  [/^Invalid value date$/i, 'date de valeur invalide'],
  [/^Invalid balance$/i, 'solde invalide'],
  [/^Missing label$/i, 'libellé manquant'],
  [/^Both debit and credit are filled$/i, 'débit et crédit tous deux remplis'],
  [/^Neither debit nor credit is filled$/i, 'ni débit ni crédit'],
  [/^Invalid debit amount$/i, 'montant au débit invalide'],
  [/^Invalid credit amount$/i, 'montant au crédit invalide'],
]

/** French text for a parse issue ("Invalid balance; Missing label"). */
export function parseIssueFr(message: string): string {
  const parts = message.split(';').map((part) => part.trim())
  const translated = parts.map((part) => {
    const match = ISSUE_PARTS.find(([pattern]) => pattern.test(part))
    return match ? part.replace(match[0], match[1]) : null
  })
  if (translated.some((part) => part === null)) return 'ligne illisible'
  const text = translated.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
