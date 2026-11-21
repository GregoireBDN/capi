import { z } from 'zod'
import type {
  InvestmentAccountSummaryDto,
  InvestmentFlowsDto,
  InvestmentMovementsDto,
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
      : `, résultat ${signedEuros(a.gainCents)} (${percent(a.returnRate)})`
  const stale = a.stale ? ' — valeur pas à jour' : ''
  const linked =
    a.linkedTransfersCount > 0 ? ` + ${a.linkedTransfersCount} lié(s)` : ''
  const source =
    a.contributionsSource === 'links'
      ? ` (d'après ${a.linkedTransfersCount} virement(s) lié(s))`
      : a.contributionsSource === 'base'
        ? ` (montant saisi${linked})`
        : a.contributionsSource === 'typed'
          ? ` (saisi sur un relevé${linked})`
          : a.contributionsSource === 'coins'
            ? ' (coût des cryptos détenues)'
            : ''
  const later =
    a.linkedAfterValueCents === 0
      ? ''
      : `, ${signedEuros(a.linkedAfterValueCents)} versés depuis cette valeur`
  return `- ${a.name} (${ACCOUNT_TYPE_LABELS[a.type]}) : ${eurosOrUnknown(a.valueCents)} au ${frenchDate(a.valueDate)}, investi ${eurosOrUnknown(a.contributionsCents)}${source}${gain}${later}${stale}`
}

/**
 * Coins moved between an exchange and the owner's other crypto accounts
 * (#296): per route, how many and what they cost (average cost).
 */
export function cryptoMovementLines(
  movements: InvestmentMovementsDto,
): string[] {
  const routes = new Map<
    string,
    { count: number; costCents: number; unknown: number }
  >()
  let unlinked = 0
  for (const m of movements.items) {
    if (m.source !== 'crypto') continue
    if (m.from === null || m.to === null) {
      unlinked++
      continue
    }
    const key = `${m.from.name} → ${m.to.name}`
    const route = routes.get(key) ?? { count: 0, costCents: 0, unknown: 0 }
    route.count++
    if (m.amountCents === null) route.unknown++
    else route.costCents += m.amountCents
    routes.set(key, route)
  }
  if (routes.size === 0 && unlinked === 0) return []
  return [
    `Cryptos envoyées entre vos comptes du ${frenchDate(movements.from)} au ${frenchDate(movements.to)} (le coût d'achat moyen suit les cryptos et devient l'investi du compte qui les reçoit) :`,
    ...[...routes.entries()].map(
      ([key, r]) =>
        `- ${key} : ${r.count} mouvement(s), coût ${euros(r.costCents)}${r.unknown > 0 ? ` (${r.unknown} au coût inconnu)` : ''}`,
    ),
    ...(unlinked > 0
      ? [
          `- ${unlinked} retrait(s) ou dépôt(s) sans compte lié : à lier dans l'application (page de la plateforme).`,
        ]
      : []),
  ]
}

/** Where the invested money went (#296): linked transfers per account and month. */
export function investmentFlowLines(flows: InvestmentFlowsDto): string[] {
  if (flows.accounts.length === 0) {
    return [
      `Virements liés aux placements du ${frenchDate(flows.from)} au ${frenchDate(flows.to)} : aucun (un virement se lie à son placement dans l'application, « Vers », ou par une règle).`,
    ]
  }
  const names = new Map(flows.accounts.map((a) => [a.accountId, a.name]))
  return [
    `Où est allé l'argent investi du ${frenchDate(flows.from)} au ${frenchDate(flows.to)} : ${signedEuros(flows.netCents)} nets (mis de côté ${euros(flows.depositsCents)}, retiré ${euros(flows.withdrawalsCents)}).`,
    ...flows.accounts.map(
      (a) =>
        `- ${a.name} (${ACCOUNT_TYPE_LABELS[a.type]}) : ${signedEuros(a.netCents)} en ${a.count} virement(s)${a.withdrawalsCents > 0 ? `, dont ${euros(a.withdrawalsCents)} retirés` : ''}`,
    ),
    table(
      ['Mois', 'Net', 'Placements'],
      flows.months.map((m) => [
        shortMonth(m.month),
        signedEuros(m.netCents),
        m.accounts
          .map(
            (a) =>
              `${names.get(a.accountId) ?? '?'} ${signedEuros(a.netCents)}`,
          )
          .join(', '),
      ]),
    ),
  ]
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
    "Savings, in the app's words: « Épargné » (what was saved this month and month by month: income + expenses, transfers excluded) against the monthly « Cible », averages, « Mis de côté » (money moved to savings and investment accounts), « Livrets et placements » (savings accounts and investments: invested, value and gain, the invested amount coming from the transfers linked to the account when it has some), where the invested money went (transfers linked to each investment account, per month), and the savings goals with their progress and projection.",
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
    const [overview, goals, flows, movements] = await Promise.all([
      api.get<SavingsOverviewDto>('/api/savings/overview', {
        months: args.months,
      }),
      api.get<SavingsGoalDto[]>('/api/savings/goals'),
      api.get<InvestmentFlowsDto>('/api/investments/flows', {
        months: args.months,
      }),
      api.get<InvestmentMovementsDto>('/api/investments/movements', {
        months: args.months,
      }),
    ])
    const { stock, averages } = overview
    const lines = [
      `Épargné en ${frenchMonth(overview.period.month)} : ${flowLine(overview.current)}.`,
      periodNote(overview.period),
      `${frenchMonth(overview.previous.month)} sur la même période : ${flowLine(overview.previous)}.`,
      `Mis de côté en ${frenchMonth(overview.period.month)} : ${signedEuros(overview.moved.totalCents)} (livrets ${signedEuros(overview.moved.toSavingsCents)}, placements ${signedEuros(overview.moved.toInvestmentsCents)}).`,
    ]
    if (overview.monthlyTargetCents !== null) {
      lines.push(
        `Cible : ${euros(overview.monthlyTargetCents)} par mois${overview.period.status === 'complete' ? ` (écart ${signedEuros(overview.current.netCents - overview.monthlyTargetCents)})` : ''}.`,
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
            `- ${a.monthCount} mois${a.from && a.to ? ` (${shortMonth(a.from)} à ${shortMonth(a.to)})` : ''} : revenus ${eurosOrUnknown(a.incomeCents)}, dépenses ${eurosOrUnknown(a.expenseCents)}, épargné ${eurosOrUnknown(a.netCents)} (hors exceptionnel ${eurosOrUnknown(a.netExcludingOneOffsCents)}), mis de côté ${eurosOrUnknown(a.movedCents)}, taux ${percent(a.savingsRate)}`,
        ),
      )
    }
    lines.push(
      '',
      `Livrets et placements : ${euros(stock.totalCents)}${stock.gainCents === null ? '' : ` (dont résultat des placements ${signedEuros(stock.gainCents)})`}.`,
      `Livrets : ${euros(stock.cash.totalCents)}`,
      ...stock.cash.accounts.map(
        (a) =>
          `- ${a.name} : ${a.balanceCents === null ? 'solde inconnu' : `${euros(a.balanceCents)} au ${frenchDate(a.balanceDate)}`}`,
      ),
      `Placements : ${euros(stock.investments.totals.valueCents)}, investi ${eurosOrUnknown(stock.investments.totals.contributionsCents)}, résultat ${eurosOrUnknown(stock.investments.totals.gainCents)} (${percent(stock.investments.totals.returnRate)})`,
      ...stock.investments.accounts.map(investmentLine),
      '',
      ...investmentFlowLines(flows),
      ...cryptoMovementLines(movements),
      '',
      table(
        ['Mois', 'Revenus', 'Dépenses', 'Épargné', 'Taux', 'Mis de côté'],
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
    const needs = active
      .filter((g) => !g.reached && g.requiredMonthlyCents !== null)
      .map((g) => g.requiredMonthlyCents ?? 0)
    const need = needs.reduce((a, b) => a + b, 0)
    lines.push(
      '',
      needs.length === 0
        ? 'Objectifs :'
        : `Objectifs : ensemble, ${euros(need)} par mois${overview.projectionAverageCents === null ? '' : ` ; épargné en moyenne ${euros(overview.projectionAverageCents)} (6 mois complets, hors exceptionnel) : marge ${signedEuros(overview.projectionAverageCents - need)}`}.`,
      ...(active.length > 0 ? active.map(goalLine) : ['- aucun']),
    )
    return lines.join('\n')
  },
})
