import { z } from 'zod'
import type {
  BudgetHistoryCellDto,
  BudgetHistoryDto,
  BudgetLineDto,
  BudgetMonthDto,
  EnvelopeDto,
  EnvelopesDto,
} from '../api/types.js'
import {
  euros,
  frenchDate,
  frenchMonth,
  percent,
  periodNote,
  shortMonth,
  table,
} from '../format.js'
import { BUDGET_STATUS_LABELS } from './labels.js'
import { MONTH_PATTERN } from './lookup.js'
import { defineTool } from './tool.js'

function budgetLine(line: BudgetLineDto): string {
  const oneOffs =
    line.spentExcludingOneOffsCents !== line.spentCents
      ? ` (hors ponctuel ${euros(line.spentExcludingOneOffsCents)})`
      : ''
  const tracked = line.tracked ? ' · suivi pendant le mois' : ''
  const note = line.note ? ` · note : ${line.note}` : ''
  return `- ${line.name} : ${euros(line.spentCents)}${oneOffs} sur ${euros(line.targetCents)} (${percent(line.percentUsed / 100)}), reste ${euros(line.remainingCents)} — ${BUDGET_STATUS_LABELS[line.status]}${tracked}${note}`
}

function envelopeLine(e: EnvelopeDto): string {
  const manual =
    e.manualCents !== 0 ? ` dont saisies manuelles ${euros(e.manualCents)}` : ''
  const pace = e.aheadOfPace ? 'en avance sur le rythme' : 'dans le rythme'
  return `- ${e.name} : ${euros(e.spentCents)}${manual} sur ${euros(e.targetCents)}, reste ${euros(e.remainingCents)} · rythme régulier à ce jour ${euros(e.paceCents)} (${pace}) — ${BUDGET_STATUS_LABELS[e.status]}`
}

export const budgetStatusTool = defineTool({
  name: 'budget_status',
  title: 'Budget du mois',
  description:
    'Budget of one month: spent vs target per budgeted category (positive cents, refunds deducted), totals, and the biggest spending without a budget. For the current month it also lists the envelopes tracked during the month with the even pace (target × day / days in the month).',
  inputSchema: {
    month: z
      .string()
      .regex(MONTH_PATTERN)
      .optional()
      .describe(
        'Calendar month YYYY-MM. Default: the current month when it has data, else the month the data stops in.',
      ),
  },
  async run({ api }, args) {
    const [budget, envelopes] = await Promise.all([
      api.get<BudgetMonthDto>('/api/budgets', { month: args.month }),
      api.get<EnvelopesDto>('/api/budgets/envelopes'),
    ])
    const { totals, unbudgeted } = budget
    const lines = [
      `Budget de ${frenchMonth(budget.month)}.`,
      periodNote(budget.period),
    ]
    if (totals.budgetCount === 0) {
      lines.push('Aucun budget défini pour ce mois.')
    } else {
      lines.push(
        `Total : ${euros(totals.spentCents)} sur ${euros(totals.targetCents)} (${percent(totals.percentUsed / 100)}), reste ${euros(totals.remainingCents)} · ${totals.overCount} dépassé(s), ${totals.warningCount} proche(s) de la cible.`,
        '',
        ...budget.items.map(budgetLine),
      )
    }
    if (unbudgeted.totalCents !== 0) {
      lines.push(
        '',
        `Dépenses hors budget : ${euros(unbudgeted.totalCents)} sur ${unbudgeted.categoryCount} catégorie(s), dont :`,
        ...unbudgeted.top.map(
          (c) => `- ${c.name ?? 'Sans catégorie'} : ${euros(c.spentCents)}`,
        ),
      )
    }
    if (envelopes.month === budget.month && envelopes.items.length > 0) {
      lines.push(
        '',
        `Enveloppes suivies au ${frenchDate(envelopes.today)} (jour ${envelopes.dayOfMonth}/${envelopes.daysInMonth}) :`,
        ...envelopes.items.map(envelopeLine),
      )
    }
    return lines.join('\n')
  },
})

function historyCell(cell: BudgetHistoryCellDto | undefined): string {
  if (!cell) return ''
  return cell.targetCents === null
    ? euros(cell.spentCents)
    : `${euros(cell.spentCents)} / ${euros(cell.targetCents)}`
}

export const budgetHistoryTool = defineTool({
  name: 'budget_history',
  title: 'Historique du budget',
  description:
    'Spent vs target per budgeted category, month by month over the last N months (ending with `month`): how targets held over time. Cells read "spent / target"; a lone amount means no target that month.',
  inputSchema: {
    month: z
      .string()
      .regex(MONTH_PATTERN)
      .optional()
      .describe(
        'Last month of the window, YYYY-MM. Default: the current month.',
      ),
    months: z
      .number()
      .int()
      .min(1)
      .max(24)
      .optional()
      .describe('Months shown. Default 6.'),
  },
  async run({ api }, args) {
    const data = await api.get<BudgetHistoryDto>('/api/budgets/history', {
      month: args.month,
      months: args.months,
    })
    if (data.categories.length === 0) return 'Aucun budget sur cette période.'
    const first = data.months[0]
    const last = data.months[data.months.length - 1]
    return [
      `Budget de ${first ? frenchMonth(first) : ''} à ${last ? frenchMonth(last) : ''} (dépensé / cible). Le mois en cours peut être incomplet.`,
      '',
      table(
        ['Catégorie', ...data.months.map(shortMonth)],
        [
          ...data.categories.map((c) => [
            c.name,
            ...data.months.map((m) =>
              historyCell(c.months.find((cell) => cell.month === m)),
            ),
          ]),
          [
            'Total',
            ...data.months.map((m) =>
              historyCell(data.totals.find((t) => t.month === m)),
            ),
          ],
        ],
      ),
    ].join('\n')
  },
})
