import { z } from 'zod'
import type {
  CategorySpendingDto,
  SpendingByCategoryDto,
  SpendingControllerByCategoryData,
  SpendingControllerTrendData,
  SpendingTrendDto,
} from '../api/types.js'
import {
  euros,
  eurosOrUnknown,
  frenchMonth,
  percent,
  periodNote,
  shortMonth,
  signedEuros,
  table,
} from '../format.js'
import { MONTH_PATTERN, resolveAccount, resolveCategory } from './lookup.js'
import { defineTool } from './tool.js'

const monthInput = z
  .string()
  .regex(MONTH_PATTERN)
  .optional()
  .describe(
    'Calendar month YYYY-MM. Default: the current month when it has data, else the month the data stops in.',
  )
const includeOneOffsInput = z
  .boolean()
  .optional()
  .describe(
    'Count one-off (exceptional) expenses. Default false: left out of every figure.',
  )
const accountInput = z
  .string()
  .max(100)
  .optional()
  .describe('Only this account (name). Default: all.')

function categoryLine(c: CategorySpendingDto, averageMonths: number): string {
  const parts = [
    `${euros(c.spentCents)} (${percent(c.share)}, ${c.transactionCount} op.)`,
    `mois précédent ${euros(c.previousSpentCents)} (${signedEuros(c.deltaCents)})`,
    `moyenne ${averageMonths} mois ${eurosOrUnknown(c.averageCents)}`,
  ]
  if (c.targetCents !== null) parts.push(`budget ${euros(c.targetCents)}`)
  if (c.expectedCents > 0)
    parts.push(`encore attendu ce mois-ci ${euros(c.expectedCents)}`)
  if (c.notYetThisMonth) parts.push('pas encore payé ce mois-ci')
  return `- ${c.name ?? 'Sans catégorie'} : ${parts.join(' · ')}`
}

export const spendingByCategoryTool = defineTool({
  name: 'spending_by_category',
  title: 'Dépenses par catégorie',
  description:
    'Expenses of one month by category (transfers excluded), each compared with the previous month and with the average of the months before, plus its budget target. A partial month is compared like for like (same first days). Use spending_history for month-by-month figures.',
  inputSchema: {
    month: monthInput,
    average_months: z
      .number()
      .int()
      .min(1)
      .max(24)
      .optional()
      .describe('Full months before `month` in the average. Default 6.'),
    include_one_offs: includeOneOffsInput,
    account: accountInput,
  },
  async run({ api }, args) {
    const account = args.account
      ? await resolveAccount(api, args.account)
      : undefined
    const query = {
      month: args.month,
      averageMonths: args.average_months,
      includeOneOffs: args.include_one_offs,
      accountId: account?.id,
    } satisfies SpendingControllerByCategoryData['query']
    const data = await api.get<SpendingByCategoryDto>(
      '/api/spending/by-category',
      query,
    )
    const lines = [
      `Dépenses de ${frenchMonth(data.month)}${account ? ` (compte ${account.name})` : ''}, ${data.includeOneOffs ? 'ponctuelles comprises' : 'hors dépenses ponctuelles'}.`,
      periodNote(data.period),
    ]
    if (data.period.status !== 'empty') {
      lines.push(
        `Total : ${euros(data.totalCents)} (${data.transactionCount} op.) · ${frenchMonth(data.previousMonth)} : ${euros(data.previousTotalCents)} · moyenne ${data.averageMonths} mois : ${eurosOrUnknown(data.averageTotalCents)}.`,
      )
      if (!data.includeOneOffs && data.oneOffCents !== 0) {
        lines.push(
          `Dépenses ponctuelles laissées de côté : ${euros(data.oneOffCents)}.`,
        )
      }
      if (data.expectedCents > 0) {
        lines.push(
          `Charges récurrentes encore attendues d'ici la fin du mois (non comptées) : ${euros(data.expectedCents)}.`,
        )
      }
      if (data.categories.length > 0) {
        lines.push(
          '',
          ...data.categories.map((c) => categoryLine(c, data.averageMonths)),
        )
      }
    }
    return lines.join('\n')
  },
})

export const spendingHistoryTool = defineTool({
  name: 'spending_history',
  title: 'Historique des dépenses',
  description:
    'Month-by-month expenses per category over the last N months (ending with `month`), with totals and the average of the complete months. Useful to see trends or to prepare a budget. The last month may be partial.',
  inputSchema: {
    month: monthInput,
    months: z
      .number()
      .int()
      .min(1)
      .max(36)
      .optional()
      .describe('Months shown. Default 12.'),
    category: z
      .string()
      .max(100)
      .optional()
      .describe(
        'Only this category (name or slug), or "uncategorized". Default: every category.',
      ),
    include_one_offs: includeOneOffsInput,
    account: accountInput,
  },
  async run({ api }, args) {
    const [account, category] = await Promise.all([
      args.account ? resolveAccount(api, args.account) : undefined,
      args.category ? resolveCategory(api, args.category) : undefined,
    ])
    const query = {
      month: args.month,
      months: args.months,
      includeOneOffs: args.include_one_offs,
      accountId: account?.id,
      categoryId: category?.id,
      uncategorized: category === null ? true : undefined,
    } satisfies SpendingControllerTrendData['query']
    const data = await api.get<SpendingTrendDto>('/api/spending/trend', query)
    const first = data.months[0]
    const last = data.months[data.months.length - 1]
    const lines = [
      `Dépenses par mois${first && last ? ` de ${frenchMonth(first)} à ${frenchMonth(last)}` : ''}${account ? `, compte ${account.name}` : ''}, ${data.includeOneOffs ? 'ponctuelles comprises' : 'hors dépenses ponctuelles'}. Le dernier mois peut être incomplet.`,
      `Moyenne des mois complets (${data.averageMonths}) : ${eurosOrUnknown(data.averageCents)} par mois.`,
      '',
      table(
        ['Catégorie', ...data.months.map(shortMonth), 'Total'],
        [
          ...data.series.map((s) => [
            s.type === 'uncategorized'
              ? 'Sans catégorie'
              : s.type === 'other'
                ? 'Autres'
                : (s.name ?? s.key),
            ...s.valuesCents.map(euros),
            euros(s.totalCents),
          ]),
          [
            'Total',
            ...data.totalsCents.map(euros),
            euros(data.totalsCents.reduce((sum, v) => sum + v, 0)),
          ],
        ],
      ),
    ]
    return lines.join('\n')
  },
})
