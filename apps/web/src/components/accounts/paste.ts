import { parseAmountToCents } from './amount'
import { parseFrenchDate } from './dates'

/** Most rows one bulk save may send (same bound as the API). */
export const PASTE_MAX_ROWS = 500

export interface PastedRow {
  /** 1-based line number in the pasted text. */
  line: number
  date: string
  valueCents: number
  contributionsCents: number | null
}

export interface PasteError {
  line: number
  text: string
  message: string
}

export interface PastedHistory {
  /** Valid rows, oldest first. */
  rows: PastedRow[]
  errors: PasteError[]
  /** True when the first line had no digit and was skipped as a header. */
  skippedHeader: boolean
}

/**
 * Reads a statement history pasted as `jj/mm/aaaa;valeur;investi` lines
 * (`;` or tab separated, the invested amount optional, French amounts). Every line is
 * checked on its own so the preview can show which ones are wrong.
 */
export function parseSnapshotHistory(
  text: string,
  today: string,
): PastedHistory {
  const rows: PastedRow[] = []
  const errors: PasteError[] = []
  const seen = new Map<string, number>()
  let skippedHeader = false
  let first = true

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1
    const content = raw.trim()
    if (content === '') return
    if (first) {
      first = false
      if (!/\d/.test(content)) {
        skippedHeader = true
        return
      }
    }
    const fail = (message: string) =>
      errors.push({ line, text: content, message })

    const cells = content.split(/[;\t]/).map((cell) => cell.trim())
    if (cells.length < 2 || cells.length > 3) {
      fail('Attendu : date;valeur;investi (investi facultatif)')
      return
    }
    const [dateText, valueText, contributionsText = ''] = cells
    const date = parseFrenchDate(dateText)
    if (date === null) {
      fail(`Date invalide « ${dateText} » (jj/mm/aaaa)`)
      return
    }
    if (date > today) {
      fail('Date dans le futur')
      return
    }
    const valueCents = parseAmountToCents(valueText)
    if (valueCents === null) {
      fail(`Valeur invalide « ${valueText} »`)
      return
    }
    if (valueCents < 0) {
      fail('La valeur ne peut pas être négative')
      return
    }
    let contributionsCents: number | null = null
    if (contributionsText !== '') {
      contributionsCents = parseAmountToCents(contributionsText)
      if (contributionsCents === null) {
        fail(`Montant investi invalide « ${contributionsText} »`)
        return
      }
    }
    const previous = seen.get(date)
    if (previous !== undefined) {
      fail(`Date déjà présente ligne ${previous}`)
      return
    }
    seen.set(date, line)
    rows.push({ line, date, valueCents, contributionsCents })
  })

  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { rows, errors, skippedHeader }
}
