import type { PositionLineDto, PositionsDto } from '#/api/types.gen'
import { formatShortDay } from '#/lib/period'

/** The palette colour of the n-th line (largest first), like a chart series. */
export function lineColor(index: number): string {
  return `var(--chart-${(index % 8) + 1})`
}

/** « 70,7 % » of the value. */
export function lineShare(cents: number, totalCents: number): string {
  if (totalCents <= 0) return '—'
  const tenths = Math.round((cents / totalCents) * 1000)
  return `${(tenths / 10).toLocaleString('fr-FR')} %`
}

/** « ETF Monde (exemple) » → « ETF Monde »: no parenthesis in the rows. */
export function shortName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '') || name
}

/** The ticker, else the first letters of the name's words (4 at most). */
export function tickerOf(
  line: Pick<PositionLineDto, 'ticker' | 'name'>,
): string {
  if (line.ticker) return line.ticker.slice(0, 4).toUpperCase()
  const words = shortName(line.name)
    .split(/\s+/)
    .filter((word) => word && !/^etf$/i.test(word))
  const letters =
    words.length > 1
      ? words.map((word) => word[0]).join('')
      : (words[0] ?? line.name).slice(0, 4)
  return letters.slice(0, 4).toUpperCase()
}

/** « 3 lignes · relevé du 31 oct. », « 1 ligne sans cours ». */
export function linesStatus(data: PositionsDto): string | undefined {
  if (data.lines.length === 0) return undefined
  const count = `${data.lines.length} ligne${data.lines.length > 1 ? 's' : ''}`
  const missing = data.totals.withoutPriceCount
  if (missing > 0) {
    return `${count} · ${missing} sans cours`
  }
  return data.asOf ? `${count} · au ${formatShortDay(data.asOf)}` : count
}
