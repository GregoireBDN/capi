import { z } from 'zod'
import type {
  InvestmentAccountSummaryDto,
  MonthFlowDto,
  SavingsGoalDto,
  SavingsOverviewDto,
} from '../api/types.js'
import {
  euros,
  eurosOrUnknown,
  frenchDate,
  frenchMonth,
  percent,
  periodNote,
  shortMonth,
  signedEuros,
  table,
} from '../format.js'
import { ACCOUNT_TYPE_LABELS } from './labels.js'
import { defineTool } from './tool.js'

export function flowLine(flow: MonthFlowDto): string {
  return `revenus ${euros(flow.incomeCents)}, dépenses ${euros(flow.expenseCents)}, épargné ${signedEuros(flow.netCents)} (taux d'épargne ${percent(flow.savingsRate)})`
}

function investmentLine(a: InvestmentAccountSummaryDto): string {
  const gain =
    a.gainCents === null
      ? ''
      : `, plus-value ${signedEuros(a.gainCents)} (${percent(a.returnRate)})`
  const stale = a.stale ? ' — valeur pas à jour' : ''
  return `- ${a.name} (${ACCOUNT_TYPE_LABELS[a.type]}) : ${eurosOrUnknown(a.valueCents)} au ${frenchDate(a.valueDate)}, versé ${eurosOrUnknown(a.contributionsCents)}${gain}${stale}`
}

function goalLine(goal: SavingsGoalDto): string {
  const parts = [
    `${euros(goal.currentCents)} sur ${euros(goal.targetCents)} (${percent(goal.progressRatio)})`,
  ]
  if (goal.reached) {
    parts.push('atteint')
  } else {
    parts.push(`reste ${euros(goal.remainingCents)}`)
    if (goal.targetDate) {
      parts.push(
        goal.targetDatePassed
          ? `échéance dépassée (${frenchDate(goal.targetDate)})`
          : `échéance ${frenchDate(goal.targetDate)}`,
      )
    }
    if (goal.requiredMonthlyCents !== null) {
      parts.push(`${euros(goal.requiredMonthlyCents)} / mois nécessaires`)
    }
    const p = goal.projection
    if (p.reachable && p.projectedDate) {
      parts.push(
        `atteint vers ${frenchMonth(p.projectedDate)} au rythme moyen de ${eurosOrUnknown(p.averageMonthlyCents)} / mois${p.onTrack === null ? '' : p.onTrack ? ' (dans les temps)' : ' (en retard)'}`,
      )
    } else {
      parts.push("pas atteignable au rythme d'épargne actuel")
    }
  }
  return `- ${goal.name} : ${parts.join(' · ')}`
}

export const savingsTool = defineTool({
  name: 'savings_and_goals',
  title: 'Épargne et objectifs',
  description:
    'Savings: what was saved this month and month by month (income + expenses, transfers excluded), averages, money moved to savings and investment accounts, the savings stock (savings accounts and investments with gains), and the savings goals with their progress and projection.',
  inputSchema: {
    months: z
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe(
        'Calendar months in the month-by-month table, ending with the current one. Default 12.',
      ),
  },
  async run({ api }, args) {
    const [overview, goals] = await Promise.all([
      api.get<SavingsOverviewDto>('/api/savings/overview', {
        months: args.months,
      }),
      api.get<SavingsGoalDto[]>('/api/savings/goals'),
    ])
    const { stock, averages } = overview
    const lines = [
      `Épargne de ${frenchMonth(overview.period.month)} : ${flowLine(overview.current)}.`,
      periodNote(overview.period),
      `${frenchMonth(overview.previous.month)} sur la même période : ${flowLine(overview.previous)}.`,
    ]
    if (overview.monthlyTargetCents !== null) {
      lines.push(
        `Objectif d'épargne mensuel : ${euros(overview.monthlyTargetCents)}.`,
      )
    }
    // 3, 6 and 12 months: with a short history they cover the same months.
    const windows = averages.filter(
      (a, i) =>
        a.monthCount > 0 &&
        averages.findIndex((b) => b.from === a.from && b.to === a.to) === i,
    )
    if (windows.length > 0) {
      lines.push(
        '',
        'Moyennes par mois (mois complets) :',
        ...windows.map(
          (a) =>
            `- ${a.monthCount} mois${a.from && a.to ? ` (${shortMonth(a.from)} à ${shortMonth(a.to)})` : ''} : revenus ${eurosOrUnknown(a.incomeCents)}, dépenses ${eurosOrUnknown(a.expenseCents)}, épargné ${eurosOrUnknown(a.netCents)} (hors ponctuel ${eurosOrUnknown(a.netExcludingOneOffsCents)}), versé sur l'épargne et les placements ${eurosOrUnknown(a.movedCents)}, taux ${percent(a.savingsRate)}`,
        ),
      )
    }
    lines.push(
      '',
      `Épargne totale : ${euros(stock.totalCents)}${stock.gainCents === null ? '' : ` (dont plus-values ${signedEuros(stock.gainCents)})`}.`,
      `Livrets et comptes d'épargne : ${euros(stock.cash.totalCents)}`,
      ...stock.cash.accounts.map(
        (a) =>
          `- ${a.name} : ${a.balanceCents === null ? 'solde inconnu' : `${euros(a.balanceCents)} au ${frenchDate(a.balanceDate)}`}`,
      ),
      `Placements : ${euros(stock.investments.totals.valueCents)}, versé ${eurosOrUnknown(stock.investments.totals.contributionsCents)}, plus-value ${eurosOrUnknown(stock.investments.totals.gainCents)} (${percent(stock.investments.totals.returnRate)})`,
      ...stock.investments.accounts.map(investmentLine),
      '',
      table(
        [
          'Mois',
          'Revenus',
          'Dépenses',
          'Épargné',
          'Taux',
          'Versé épargne/placements',
        ],
        overview.months.map((m) => [
          `${shortMonth(m.month)}${m.complete ? '' : ' (en cours)'}`,
          euros(m.incomeCents),
          euros(m.expenseCents),
          signedEuros(m.netCents),
          percent(m.savingsRate),
          euros(m.movedCents),
        ]),
      ),
    )
    const active = goals.filter((g) => !g.archived)
    lines.push(
      '',
      'Objectifs :',
      ...(active.length > 0 ? active.map(goalLine) : ['- aucun']),
    )
    return lines.join('\n')
  },
})
