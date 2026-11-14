import { z } from 'zod'
import type { MonthReviewDto, ReviewCategoryDto } from '../api/types.js'
import {
  euros,
  eurosOrUnknown,
  frenchDate,
  frenchMonth,
  periodNote,
  signedEuros,
} from '../format.js'
import { ACCOUNT_TYPE_LABELS } from './labels.js'
import { MONTH_PATTERN } from './lookup.js'
import { flowLine } from './savings.js'
import { defineTool } from './tool.js'

function gapLine(c: ReviewCategoryDto): string {
  return `- ${c.name} : ${euros(c.spentCents)} pour ${euros(c.targetCents)} (${signedEuros(c.gapCents)})`
}

export const monthReviewTool = defineTool({
  name: 'month_review',
  title: 'Bilan du mois',
  description:
    'Month-end review (default: the previous calendar month): whether every account is up to date for it, net worth at the month end and its change split into what was saved and the rest (market moves, value updates), income/expenses, and spending against the budget with the categories furthest above and below their target.',
  inputSchema: {
    month: z
      .string()
      .regex(MONTH_PATTERN)
      .optional()
      .describe(
        'Month to review, YYYY-MM. Default: the previous calendar month.',
      ),
  },
  async run({ api }, args) {
    const review = await api.get<MonthReviewDto>('/api/dashboard/review', {
      month: args.month,
    })
    const { netWorth, budget } = review
    const lines = [
      `Bilan de ${frenchMonth(review.month)} : ${review.closed ? 'tous les comptes sont à jour' : 'des données manquent encore'}.`,
      periodNote(review.period),
    ]
    if (review.missing.length > 0) {
      lines.push(
        'Comptes pas à jour à la fin du mois :',
        ...review.missing.map(
          (a) =>
            `- ${a.name} (${ACCOUNT_TYPE_LABELS[a.type]}) : ${a.lastDate ? `données jusqu'au ${frenchDate(a.lastDate)}` : 'aucune donnée'}`,
        ),
      )
    }
    lines.push(
      '',
      `Patrimoine au ${frenchDate(netWorth.date)} : ${eurosOrUnknown(netWorth.endCents)} (au ${frenchDate(netWorth.previousDate)} : ${eurosOrUnknown(netWorth.previousEndCents)}).`,
    )
    if (netWorth.changeCents !== null) {
      lines.push(
        `Variation : ${signedEuros(netWorth.changeCents)}, dont épargné ${signedEuros(netWorth.savedCents)} et reste (marchés, mises à jour de valeur) ${netWorth.otherCents === null ? 'n/c' : signedEuros(netWorth.otherCents)}.`,
      )
    }
    lines.push(`Flux du mois : ${flowLine(review.flow)}.`)
    if (
      review.flow.oneOffExpenseCents !== 0 ||
      review.flow.oneOffIncomeCents !== 0
    ) {
      lines.push(
        `Dont ponctuel : revenus ${euros(review.flow.oneOffIncomeCents)}, dépenses ${euros(review.flow.oneOffExpenseCents)}.`,
      )
    }
    lines.push('')
    if (budget.budgetCount === 0) {
      lines.push('Aucun budget défini pour ce mois.')
    } else {
      lines.push(
        `Budget : ${euros(budget.spentCents)} dépensés sur ${euros(budget.targetCents)} (reste ${signedEuros(budget.remainingCents)}), hors budget ${euros(budget.unbudgetedCents)}.`,
      )
      if (budget.over.length > 0)
        lines.push('Au-dessus de la cible :', ...budget.over.map(gapLine))
      if (budget.under.length > 0)
        lines.push('Sous la cible :', ...budget.under.map(gapLine))
    }
    return lines.join('\n')
  },
})
