import { z } from 'zod'
import type { RecurringItemDto, RecurringSummaryDto } from '../api/types.js'
import {
  addDays,
  euros,
  frenchDate,
  parisToday,
  signedEuros,
} from '../format.js'
import { CADENCE_LABELS } from './labels.js'
import { defineTool } from './tool.js'

function itemKind(item: RecurringItemDto): string {
  const kinds = [
    item.isSubscription ? 'abonnement' : null,
    item.isFixedCost ? 'charge fixe' : null,
    item.amountType === 'variable' ? 'montant variable' : null,
  ].filter(Boolean)
  return [CADENCE_LABELS[item.cadence], ...kinds].join(', ')
}

function itemLine(item: RecurringItemDto): string {
  const parts = [
    `${euros(item.typicalAmountCents)} (${itemKind(item)})`,
    `${euros(item.monthlyEquivalentCents)} / mois, ${euros(item.yearlyCostCents)} / an`,
    item.nextExpectedDate
      ? `prochain ${frenchDate(item.nextExpectedDate)}`
      : null,
    item.categoryName,
    item.accountName,
  ].filter(Boolean)
  const priceChange =
    item.priceChangeCents !== null && item.priceChangeCents !== 0
      ? ` [prix ${signedEuros(item.priceChangeCents)} le ${frenchDate(item.priceChangedOn)}]`
      : ''
  const suggested =
    item.status === 'suggested' ? ' [détecté, non confirmé]' : ''
  const ending =
    item.endedOn && !item.ended
      ? ` [résilié, plus de prélèvement à partir du ${frenchDate(item.endedOn)}]`
      : ''
  return `- ${item.name} : ${parts.join(' · ')}${priceChange}${suggested}${ending}`
}

/** A cancelled item (`ended`): its end date and any charge after it. */
function endedLine(item: RecurringItemDto): string {
  const charged = item.chargedAfterEnd
    ? ` · prélevé après la résiliation le ${frenchDate(item.chargedAfterEnd)}, à vérifier`
    : ''
  return `- ${item.name} : résilié, fin le ${frenchDate(item.endedOn)} · dernier prélèvement ${frenchDate(item.lastSeenDate)} · ${euros(item.yearlyCostCents)} / an avant la fin${charged}`
}

export const subscriptionsTool = defineTool({
  name: 'subscriptions',
  title: 'Abonnements et prélèvements à venir',
  description:
    'Recurring debits (subscriptions and fixed costs) with their monthly and yearly cost, recurring income, and the debits expected in the next days. Items detected but not confirmed by the owner are flagged; dismissed and inactive ones are left out. Subscriptions cancelled by the owner are listed apart with their end date (and flagged when charged after it); one cancelled from a future date still counts until then.',
  inputSchema: {
    upcoming_days: z
      .number()
      .int()
      .min(1)
      .max(92)
      .optional()
      .describe(
        'Window for the upcoming debits, in days from today. Default 31.',
      ),
  },
  async run({ api, now }, args) {
    const [summary, items] = await Promise.all([
      api.get<RecurringSummaryDto>('/api/recurring/summary'),
      api.get<RecurringItemDto[]>('/api/recurring'),
    ])
    const live = items.filter(
      (i) => i.active && i.status !== 'dismissed' && !i.ended,
    )
    const ended = items
      .filter((i) => i.status === 'confirmed' && i.ended)
      .sort((a, b) => (b.endedOn ?? '').localeCompare(a.endedOn ?? ''))
    const byCost = (a: RecurringItemDto, b: RecurringItemDto) =>
      b.monthlyEquivalentCents - a.monthlyEquivalentCents
    const debits = live.filter((i) => i.direction === 'debit').sort(byCost)
    const credits = live.filter((i) => i.direction === 'credit').sort(byCost)
    const { debits: d } = summary

    const lines = [
      `Prélèvements récurrents confirmés : ${d.count}, ${euros(d.monthlyCents)} / mois (${euros(d.yearlyCents)} / an).`,
      `- dont abonnements : ${d.subscriptions.count}, ${euros(d.subscriptions.monthlyCents)} / mois`,
      `- dont charges fixes : ${d.fixed.count}, ${euros(d.fixed.monthlyCents)} / mois ; montants variables : ${d.variable.count}, ${euros(d.variable.monthlyCents)} / mois`,
      `Revenus récurrents confirmés : ${summary.credits.count}, ${euros(summary.credits.monthlyCents)} / mois.`,
    ]
    if (summary.suggestedCount > 0) {
      lines.push(
        `${summary.suggestedCount} élément(s) détecté(s) à confirmer dans l'application.`,
      )
    }

    const today = parisToday(now())
    const end = addDays(today, args.upcoming_days ?? 31)
    const upcoming = debits
      .filter(
        (i) =>
          i.nextExpectedDate &&
          i.nextExpectedDate >= today &&
          i.nextExpectedDate <= end &&
          (i.endedOn === null || i.nextExpectedDate < i.endedOn),
      )
      .sort((a, b) =>
        (a.nextExpectedDate ?? '').localeCompare(b.nextExpectedDate ?? ''),
      )
    lines.push(
      '',
      `Prélèvements attendus du ${frenchDate(today)} au ${frenchDate(end)} :`,
    )
    lines.push(
      ...(upcoming.length > 0
        ? upcoming.map(
            (i) =>
              `- ${frenchDate(i.nextExpectedDate)} · ${i.name} · ${euros(i.typicalAmountCents)}${i.amountType === 'variable' ? ' (variable)' : ''} · ${i.accountName}${i.status === 'suggested' ? ' [non confirmé]' : ''}`,
          )
        : ['- aucun']),
    )
    if (debits.length > 0)
      lines.push('', 'Dépenses récurrentes :', ...debits.map(itemLine))
    if (credits.length > 0)
      lines.push('', 'Revenus récurrents :', ...credits.map(itemLine))
    if (ended.length > 0)
      lines.push(
        '',
        'Abonnements résiliés (hors totaux) :',
        ...ended.map(endedLine),
      )
    return lines.join('\n')
  },
})
