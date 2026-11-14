import type { MonthReportDto } from '#/api/types.gen'
import { amount, text, toCsv } from '#/lib/csv'

export { csvAmount as centsToCsv } from '#/lib/csv'

/**
 * The month's report as a CSV for a French spreadsheet: `;` separated,
 * decimal comma, CRLF lines (the caller adds the UTF-8 BOM). Labels, category
 * names and notes are text cells, neutralised against formulas (`#/lib/csv`).
 */
export function reportToCsv(report: MonthReportDto): string {
  const empty = text('')
  const total = (label: string, cents: number | null) => [
    text('Total'),
    text(label),
    amount(cents),
    empty,
    empty,
  ]
  const rows = [
    [
      'Rubrique',
      'Libellé',
      'Montant (€)',
      'Mois précédent (€)',
      'Budget (€)',
    ].map(text),
    total('Revenus', report.flow.incomeCents),
    total('Dépenses', report.flow.expenseCents),
    total('Épargné', report.flow.netCents),
    total('Épargne cible', report.savingsTargetCents),
    total('Patrimoine en fin de mois', report.netWorthCents),
    ...report.categories.map((category) => [
      text(category.kind === 'expense' ? 'Dépense' : 'Revenu'),
      text(category.name ?? 'Sans catégorie'),
      amount(category.amountCents),
      amount(category.previousAmountCents),
      amount(category.targetCents),
    ]),
    ...report.oneOffs.map((oneOff) => [
      text('Ponctuel'),
      text(`${oneOff.date} ${oneOff.label}`),
      amount(oneOff.amountCents),
      empty,
      empty,
    ]),
  ]
  if (report.notes) {
    rows.push([text('Notes'), text(report.notes), empty, empty, empty])
  }
  return toCsv(rows)
}

/** Saves the report as `rapport-YYYY-MM.csv`. */
export function downloadReportCsv(report: MonthReportDto) {
  const blob = new Blob(['﻿', reportToCsv(report)], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `rapport-${report.month}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
