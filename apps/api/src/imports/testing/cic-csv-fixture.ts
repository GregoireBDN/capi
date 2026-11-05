import { WINDOWS_1252_HIGH_CODE_POINTS } from '#/imports/parsers/windows-1252'

/**
 * Builds synthetic CIC CSV exports for tests: Windows-1252 bytes, `;`
 * separator, comma decimals, `dd/mm/yyyy` dates, CRLF line ends. Test helper
 * only; fake data only.
 */

export const CIC_HEADER = 'Date;Date de valeur;Débit;Crédit;Libellé;Solde'

export interface CicRow {
  /** `YYYY-MM-DD`. */
  date: string
  /** Signed cents: negative = debit column, positive = credit column. */
  amountCents: number
  label: string
  /** Running balance in cents; omitted = empty `Solde` cell. */
  balanceCents?: number
}

/** Encodes a string as Windows-1252, as CIC does. */
export function cp1252(text: string): Buffer {
  const reverse = new Map<number, number>(
    WINDOWS_1252_HIGH_CODE_POINTS.map((cp, i) => [cp, 0x80 + i]),
  )
  return Buffer.from(
    [...text].map((ch) => {
      const cp = ch.codePointAt(0)!
      const byte = reverse.get(cp) ?? (cp <= 0xff ? cp : undefined)
      if (byte === undefined) throw new Error(`Not encodable in cp1252: ${ch}`)
      return byte
    }),
  )
}

/** `-123456` → `-1 234,56` (French format, as CIC writes it). */
export function frenchAmount(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const units = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${sign}${units},${String(abs % 100).padStart(2, '0')}`
}

function frenchDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

/** A CIC export of `rows`, plus raw `extraLines` (e.g. malformed ones) at the end. */
export function cicCsv(rows: CicRow[], extraLines: string[] = []): Buffer {
  const lines = rows.map((row) => {
    const date = frenchDate(row.date)
    const debit = row.amountCents < 0 ? frenchAmount(row.amountCents) : ''
    const credit = row.amountCents >= 0 ? frenchAmount(row.amountCents) : ''
    const balance =
      row.balanceCents === undefined ? '' : frenchAmount(row.balanceCents)
    return [date, date, debit, credit, row.label, balance].join(';')
  })
  return cp1252([CIC_HEADER, ...lines, ...extraLines].join('\r\n') + '\r\n')
}

/** Rows with running balances chained from `openingCents`. */
export function withBalances(
  openingCents: number,
  rows: Omit<CicRow, 'balanceCents'>[],
): CicRow[] {
  let balance = openingCents
  return rows.map((row) => {
    balance += row.amountCents
    return { ...row, balanceCents: balance }
  })
}
