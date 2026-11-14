import type { MonthReportDto } from '#/api/types.gen'

/** `-123456` → `-1234,56` (integer arithmetic, French decimal comma). */
export function centsToCsv(cents: number | null): string {
  if (cents === null) return ''
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

function cell(value: string): string {
  return /[;"\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/**
 * The month's report as a CSV for a French spreadsheet: `;` separated,
 * decimal comma, CRLF lines (the caller adds the UTF-8 BOM).
 */
export function reportToCsv(report: MonthReportDto): string {
  const rows: string[][] = [
    ['Rubrique', 'Libellé', 'Montant (€)', 'Mois précédent (€)', 'Budget (€)'],
    ['Total', 'Revenus', centsToCsv(report.flow.incomeCents), '', ''],
    ['Total', 'Dépenses', centsToCsv(report.flow.expenseCents), '', ''],
    ['Total', 'Épargné', centsToCsv(report.flow.netCents), '', ''],
    ['Total', 'Épargne cible', centsToCsv(report.savingsTargetCents), '', ''],
    [
      'Total',
      'Patrimoine en fin de mois',
      centsToCsv(report.netWorthCents),
      '',
      '',
    ],
    ...report.categories.map((category) => [
      category.kind === 'expense' ? 'Dépense' : 'Revenu',
      category.name ?? 'Sans catégorie',
      centsToCsv(category.amountCents),
      centsToCsv(category.previousAmountCents),
      centsToCsv(category.targetCents),
    ]),
    ...report.oneOffs.map((oneOff) => [
      'Ponctuel',
      `${oneOff.date} ${oneOff.label}`,
      centsToCsv(oneOff.amountCents),
      '',
      '',
    ]),
  ]
  if (report.notes) rows.push(['Notes', report.notes, '', '', ''])
  return rows.map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n'
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
