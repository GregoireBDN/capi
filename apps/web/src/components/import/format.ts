import type { ImportSummaryDto } from '#/api'
import { format, parseISO } from 'date-fns'
import { plural } from '#/lib/plural'

export { plural }

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
  [/^Negative credit amount$/i, 'montant au crédit négatif'],
  [/^Invalid amount$/i, 'montant invalide'],
  [/^Missing amount$/i, 'montant manquant'],
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

/** What undoing a committed import deletes and puts back (#371). */
export interface UndoFigures {
  fileName: string
  accountName: string
  inserted: number
  /** Rows edited by hand, deleted with their edits. */
  edited: number
  /** Manual entries absorbed by reconciliation, put back. */
  absorbed: number
}

/**
 * The undo confirmation: the rows deleted, then, when there are any, how
 * many were edited by hand (their edits are lost, a re-import brings back
 * the bank rows only) and how many had absorbed a manual entry (put back as
 * one). Without either, the plain sentence.
 */
export function undoDescription({
  fileName,
  accountName,
  inserted,
  edited,
  absorbed,
}: UndoFigures): string {
  const deleted = `${plural(inserted, 'opération ajoutée', 'opérations ajoutées')} par « ${fileName} » sur ${accountName} ${inserted > 1 ? 'seront supprimées' : 'sera supprimée'}`
  if (edited === 0 && absorbed === 0) {
    return `${deleted}. Cette action est irréversible.`
  }
  const among = [
    edited > 0 &&
      `${edited} ${edited > 1 ? 'modifiées' : 'modifiée'} à la main`,
    absorbed > 0 &&
      `${absorbed} ${absorbed > 1 ? 'rapprochées de vos saisies' : 'rapprochée d’une saisie'}`,
  ].filter(Boolean)
  const restored =
    absorbed > 0
      ? absorbed > 1
        ? ` : ces ${absorbed} saisies seront remises comme saisies manuelles`
        : ' : cette saisie sera remise comme saisie manuelle'
      : ''
  const lost =
    edited > 0 ? ' Réimporter le fichier ne rendra pas les modifications.' : ''
  return `${deleted}, dont ${among.join(' et ')}${restored}.${lost}`
}

const SOURCE_LABEL: Record<string, string> = {
  cic_csv: 'CSV CIC',
  spreadsheet: 'Historique (tableur)',
  standard_csv: 'Format standard',
  csv_profile: 'Format enregistré',
}

/** « CSV CIC », « Format standard », or the saved format's name (#431). */
export function sourceLabel(
  item: Pick<ImportSummaryDto, 'source' | 'profileName'>,
): string {
  if (item.source === 'csv_profile' && item.profileName) {
    return item.profileName
  }
  return SOURCE_LABEL[item.source] ?? item.source
}
