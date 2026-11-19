import { z } from 'zod'
import type {
  BudgetSuggestionsDto,
  MonthCloseDto,
  MonthCloseStep,
  TransactionListDto,
} from '../api/types.js'
import {
  addMonths,
  euros,
  frenchDate,
  frenchMonth,
  ofMonth,
  parisToday,
  periodNote,
  signedEuros,
} from '../format.js'
import { ACCOUNT_TYPE_LABELS } from './labels.js'
import { MONTH_PATTERN } from './lookup.js'
import { defineTool } from './tool.js'
import { transactionLine } from './transactions.js'

export const STEP_LABELS: Record<MonthCloseStep, string> = {
  imports: 'Relevés importés',
  review_queue: 'Opérations à revoir',
  recurring: 'Abonnements et charges fixes',
  budget: 'Budget',
  savings: 'Épargne',
  investments: 'Valeurs des placements',
  close: 'Clôture',
}

export const monthCloseStatusTool = defineTool({
  name: 'month_close_status',
  title: 'Revue du mois : étapes',
  description:
    'Steps of the guided month-end review ("Revue du mois", default: the previous calendar month) and what is left in each: accounts whose statement is not imported up to the month end or with running-balance gaps, transactions of the month in review, recurring items to confirm and price changes, budget, savings target and goals, investment values missing at the month end, and whether the month is closed. Ticking steps is done in the app; close_months closes the month.',
  inputSchema: {
    month: z
      .string()
      .regex(MONTH_PATTERN)
      .optional()
      .describe('Month YYYY-MM. Default: the previous calendar month.'),
  },
  async run({ api, now }, args) {
    const month = args.month ?? addMonths(parisToday(now()).slice(0, 7), -1)
    const close = await api.get<MonthCloseDto>(`/api/month-close/${month}`)
    const done = new Map(close.steps.map((s) => [s.key, s.done]))
    const mark = (key: MonthCloseStep) =>
      `${done.get(key) ? '✓' : '✗'} ${STEP_LABELS[key]}`
    const lines = [
      `Revue ${ofMonth(close.month)} : ${close.status === 'closed' ? `clôturée le ${frenchDate(close.closedAt)}` : 'ouverte'}${close.status === 'open' && !close.closable ? ' (pas encore clôturable : le mois n’est pas fini)' : ''}.`,
      periodNote(close.period),
      `Étapes faites : ${close.steps.filter((s) => s.done).length}/${close.steps.length}.`,
      '',
      mark('imports'),
    ]
    const late = close.imports.accounts.filter((a) => !a.upToDate)
    for (const a of late) {
      lines.push(
        `  - ${a.name} (${ACCOUNT_TYPE_LABELS[a.type]}) : ${a.lastDate ? `données jusqu'au ${frenchDate(a.lastDate)}, ${a.missingDays} jour(s) manquant(s)` : 'aucune donnée'}`,
      )
    }
    for (const g of close.imports.gaps) {
      lines.push(
        `  - Trou dans le solde de ${g.accountName} entre le ${frenchDate(g.fromDate)} et le ${frenchDate(g.toDate)} : écart ${signedEuros(g.differenceCents)}`,
      )
    }
    lines.push(
      mark('review_queue'),
      ...(close.reviewQueue.count > 0
        ? [
            `  - ${close.reviewQueue.count} opération(s) du mois à revoir (review_queue).`,
          ]
        : []),
      mark('recurring'),
      ...(close.recurring.suggestedCount > 0
        ? [
            `  - ${close.recurring.suggestedCount} abonnement(s) détecté(s) à confirmer ou ignorer dans l'application.`,
          ]
        : []),
      ...close.recurring.chargedAfterEnd.map(
        (c) =>
          `  - ${c.name} : résilié à partir du ${frenchDate(c.endedOn)}, mais prélevé de ${euros(c.amountCents)} le ${frenchDate(c.chargedOn)} (résiliation à vérifier).`,
      ),
      ...close.recurring.priceChanges.map(
        (p) =>
          `  - ${p.name} : ${p.previousAmountCents === null ? 'n/c' : euros(Math.abs(p.previousAmountCents))} → ${euros(Math.abs(p.latestAmountCents))} le ${frenchDate(p.priceChangedOn)}`,
      ),
      mark('budget'),
      close.budget.budgetCount > 0
        ? `  - ${euros(close.budget.spentCents)} dépensés sur ${euros(close.budget.targetCents)} (reste ${signedEuros(close.budget.remainingCents)}), hors budget ${euros(close.budget.unbudgetedCents)}.`
        : '  - Aucun budget pour ce mois.',
      mark('savings'),
      `  - Épargné ${signedEuros(close.savings.netCents)}${close.savings.targetCents !== null ? ` pour un objectif de ${euros(close.savings.targetCents)}` : ''}.`,
      ...close.savings.goals.map(
        (g) =>
          `  - Objectif ${g.name} : ${euros(g.currentCents)} / ${euros(g.targetCents)}${g.reached ? ' (atteint)' : ''}`,
      ),
      mark('investments'),
      ...close.investments.accounts.map(
        (a) =>
          `  - ${a.name} (${ACCOUNT_TYPE_LABELS[a.type]}) : pas de valeur à la fin du mois (dernière ${a.lastDate ? `au ${frenchDate(a.lastDate)}` : 'jamais'}), à mettre à jour dans l'application.`,
      ),
      mark('close'),
    )
    if (close.acknowledged.length > 0) {
      lines.push(
        `Étapes cochées dans l'application : ${close.acknowledged.map((k) => STEP_LABELS[k]).join(', ')}.`,
      )
    }
    if (close.notes) lines.push(`Notes : ${close.notes}`)
    if (close.changes.length > 0) {
      lines.push(
        `${close.changes.length} chiffre(s) du rapport ont changé depuis la clôture.`,
      )
    }
    return lines.join('\n')
  },
})

export const reviewQueueTool = defineTool({
  name: 'review_queue',
  title: 'Opérations à revoir',
  description:
    'Transactions to review (uncategorized or flagged; in the app, the « À revoir » filter of Opérations), newest first, with their id so they can be categorized (categorize_transactions), marked one-off or annotated.',
  inputSchema: {
    month: z
      .string()
      .regex(MONTH_PATTERN)
      .optional()
      .describe('Only this month, YYYY-MM. Default: every month.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Rows, default 50.'),
  },
  async run({ api }, args) {
    const list = await api.get<TransactionListDto>('/api/transactions', {
      needsReview: true,
      month: args.month,
      limit: args.limit ?? 50,
    })
    const scope = args.month ? ` en ${frenchMonth(args.month)}` : ''
    if (list.total === 0) return `Aucune opération à revoir${scope}.`
    return [
      `${list.total} opération(s) à revoir${scope}${list.items.length < list.total ? `, les ${list.items.length} plus récentes` : ''} :`,
      ...list.items.map(transactionLine),
      'Dans l’application : Opérations, filtre « À revoir ».',
    ].join('\n')
  },
})

export const budgetSuggestionsTool = defineTool({
  name: 'budget_suggestions',
  title: 'Suggestions de budget',
  description:
    "Suggested monthly target per expense category for a month: the average spending of the full months before it, one-offs excluded, rounded to the euro, next to the current target. Nothing is saved: pass the chosen amounts to set_budget_targets (with the owner's agreement).",
  inputSchema: {
    month: z
      .string()
      .regex(MONTH_PATTERN)
      .optional()
      .describe(
        'Month the targets are for, YYYY-MM. Default: the current month.',
      ),
    months: z
      .number()
      .int()
      .min(1)
      .max(12)
      .optional()
      .describe('Full months averaged before it, default 3.'),
  },
  async run({ api }, args) {
    const data = await api.send<BudgetSuggestionsDto>(
      'POST',
      '/api/budgets/suggest',
      undefined,
      { month: args.month, months: args.months },
    )
    if (data.items.length === 0) {
      return `Pas assez de mois complets avant ${frenchMonth(data.month)} pour suggérer des cibles.`
    }
    const first = data.months[0]
    const last = data.months[data.months.length - 1]
    return [
      `Cibles suggérées pour ${frenchMonth(data.month)} (moyenne de ${first ? frenchMonth(first) : ''} à ${last ? frenchMonth(last) : ''}, ${data.monthsWithData} mois avec des données, hors ponctuel) :`,
      ...data.items.map(
        (i) =>
          `- ${i.name} (${i.slug}) : ${euros(i.suggestedCents)} (moyenne ${euros(i.averageCents)}) · cible actuelle ${i.currentTargetCents === null ? 'aucune' : euros(i.currentTargetCents)}`,
      ),
    ].join('\n')
  },
})
