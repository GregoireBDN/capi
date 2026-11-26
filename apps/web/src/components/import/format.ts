import type { ImportSummaryDto, ParseIssueDto } from '#/api'
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

const ISSUE_FIELDS: [RegExp, string[]][] = [
  [/^Invalid or missing date$/i, ['date']],
  [/^Invalid value date$/i, ['valueDate']],
  [/^Invalid balance$/i, ['balance']],
  [/^Missing label$/i, ['label']],
  [
    /^(Both debit and credit are filled|Neither debit nor credit is filled)$/i,
    ['debit', 'credit'],
  ],
  [/^Invalid debit amount$/i, ['debit']],
  [/^(Invalid|Negative) credit amount$/i, ['credit']],
  [/^(Invalid|Missing) amount$/i, ['amount']],
]

/**
 * The fields a parse issue blames ("Invalid balance; Missing label" →
 * balance, label): their cells are shown in red (#433).
 */
export function issueFields(message: string): Set<string> {
  const fields = new Set<string>()
  for (const part of message.split(';').map((p) => p.trim())) {
    const match = ISSUE_FIELDS.find(([pattern]) => pattern.test(part))
    match?.[1].forEach((field) => fields.add(field))
  }
  return fields
}

/** `2026-03-02` → `2026-03`, the month of the Opérations page to open. */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

/** A piece of an issue sentence: text, or a value from the file (mono). */
export type SentencePart = string | { value: string }

type Cells = NonNullable<ParseIssueDto['cells']>

function cellOf(cells: Cells, field: string): string {
  return cells.find((cell) => cell.field === field)?.value.trim() ?? ''
}

function sentenceFor(part: string, cells: Cells): SentencePart[] | null {
  const value = (field: string) => cellOf(cells, field)
  const withValue = (
    field: string,
    before: string,
    after: string,
    missing: string,
  ): SentencePart[] => {
    const v = value(field)
    return v ? [before, { value: v }, after] : [missing]
  }
  if (/^Invalid or missing date$/i.test(part)) {
    return withValue(
      'date',
      'La date ',
      ' n’existe pas.',
      'La date est manquante.',
    )
  }
  if (/^Invalid value date$/i.test(part)) {
    return withValue(
      'valueDate',
      'La date de valeur ',
      ' n’est pas valide.',
      'La date de valeur est manquante.',
    )
  }
  if (/^Invalid balance$/i.test(part)) {
    return withValue(
      'balance',
      'Le solde ',
      ' n’est pas un montant.',
      'Le solde est illisible.',
    )
  }
  if (/^Missing label$/i.test(part)) return ['Le libellé est vide.']
  if (/^Both debit and credit are filled$/i.test(part)) {
    return [
      'Débit ',
      { value: value('debit') },
      ' et crédit ',
      { value: value('credit') },
      ' sont remplis tous les deux : lequel garder ?',
    ]
  }
  if (/^Neither debit nor credit is filled$/i.test(part)) {
    return ['Ni débit ni crédit : indiquez le montant.']
  }
  if (/^Negative credit amount$/i.test(part)) {
    return withValue(
      'credit',
      'Le crédit ',
      ' est négatif.',
      'Le montant est manquant.',
    )
  }
  const amountField = /^Invalid debit amount$/i.test(part)
    ? 'debit'
    : /^Invalid credit amount$/i.test(part)
      ? 'credit'
      : /^(Invalid|Missing) amount$/i.test(part)
        ? 'amount'
        : null
  if (amountField) {
    return withValue(
      amountField,
      'Le montant ',
      ' n’est pas lisible.',
      'Le montant est manquant.',
    )
  }
  return null
}

/**
 * The title of an unreadable line (#433): one plain sentence per problem,
 * naming the value the file holds (« La date 31/11/2026 n’existe pas. »).
 * A line not split into columns, or a problem without a sentence, falls back
 * to the translated message.
 */
export function issueSentence(
  issue: Pick<ParseIssueDto, 'message' | 'cells'>,
): SentencePart[] {
  const fallback = [`${parseIssueFr(issue.message)}.`]
  if (!issue.cells) return fallback
  const parts: SentencePart[] = []
  for (const part of issue.message.split(';').map((p) => p.trim())) {
    const sentence = sentenceFor(part, issue.cells)
    if (!sentence) return fallback
    if (parts.length > 0) parts.push(' ')
    parts.push(...sentence)
  }
  return parts.length > 0 ? parts : fallback
}

/** The form fields an unreadable line's file values go under (#433). */
export type FixField = 'date' | 'amount' | 'label' | 'balance'

export interface FileValues {
  values: Partial<Record<FixField, string>>
  /** The fields the error blames, shown in red. */
  bad: Set<FixField>
}

const FIX_FIELD: Record<string, FixField | undefined> = {
  date: 'date',
  amount: 'amount',
  debit: 'amount',
  credit: 'amount',
  label: 'label',
  balance: 'balance',
}

/**
 * What the file holds for each field of the fix form (#433): the date, the
 * amount (debit, credit or amount; « -5,00 / 5,00 » when both are filled),
 * the label and the balance. Null when the line was not split into columns.
 */
export function fileValuesOf(
  issue: Pick<ParseIssueDto, 'message' | 'cells'>,
): FileValues | null {
  if (!issue.cells) return null
  const cell = (field: string) => cellOf(issue.cells!, field)
  const amounts = [cell('debit'), cell('credit'), cell('amount')].filter(
    (v) => v !== '',
  )
  const values: FileValues['values'] = {}
  if (cell('date')) values.date = cell('date')
  if (amounts.length > 0) values.amount = amounts.join(' / ')
  if (cell('label')) values.label = cell('label')
  if (cell('balance')) values.balance = cell('balance')
  const bad = new Set<FixField>()
  for (const field of issueFields(issue.message)) {
    const fix = FIX_FIELD[field]
    if (fix) bad.add(fix)
  }
  return { values, bad }
}
