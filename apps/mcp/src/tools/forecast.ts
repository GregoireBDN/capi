import { z } from 'zod'
import type { ForecastDto, ForecastItemDto } from '../api/types.js'
import { euros, frenchDate, signedEuros } from '../format.js'
import { resolveAccount } from './lookup.js'
import { defineTool, ToolInputError } from './tool.js'

function itemLine(item: ForecastItemDto): string {
  const late =
    item.date !== item.expectedDate
      ? ` (attendu le ${frenchDate(item.expectedDate)})`
      : ''
  const variable = item.amountType === 'variable' ? ', montant variable' : ''
  return `- ${frenchDate(item.date)}${late} · ${item.name} · ${signedEuros(item.amountCents)}${variable}`
}

export const monthEndForecastTool = defineTool({
  name: 'month_end_forecast',
  title: 'Prévision de fin de mois',
  description:
    'Projected balance of the checking accounts at the end of the current month: current balance, confirmed recurring debits and credits still expected, an estimate of day-to-day spending, the lowest point and the first day under a threshold.',
  inputSchema: {
    accounts: z
      .array(z.string().max(100))
      .max(10)
      .optional()
      .describe(
        'Checking or savings account names. Default: every open checking account.',
      ),
    low_balance_threshold_euros: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .optional()
      .describe('Alert threshold in whole euros (may be negative). Default 0.'),
    include_variable: z
      .boolean()
      .optional()
      .describe(
        'Add the average day-to-day spending estimate. Default true; false = recurring items only.',
      ),
  },
  async run({ api }, args) {
    const accounts = args.accounts?.length
      ? await Promise.all(
          args.accounts.map((name) => resolveAccount(api, name)),
        )
      : []
    const notCash = accounts.find(
      (a) => a.type !== 'checking' && a.type !== 'savings',
    )
    if (notCash) {
      throw new ToolInputError(
        `${notCash.name} n'est pas un compte courant ou d'épargne.`,
      )
    }
    const data = await api.get<ForecastDto>('/api/forecast', {
      accountIds: accounts.length
        ? accounts.map((a) => a.id).join(',')
        : undefined,
      threshold:
        args.low_balance_threshold_euros === undefined
          ? undefined
          : args.low_balance_threshold_euros * 100,
      includeVariable: args.include_variable,
    })
    const lines = [
      `Prévision au ${frenchDate(data.monthEnd)} (aujourd'hui ${frenchDate(data.today)}) pour : ${data.accounts.map((a) => a.name).join(', ') || 'aucun compte'}.`,
      `Solde de départ : ${euros(data.startingBalanceCents)} (dernier solde connu au ${frenchDate(data.startingBalanceDate)}).`,
      `Récurrents encore attendus : débits ${euros(data.expectedDebitsCents)}, crédits ${euros(data.expectedCreditsCents)} (${data.recurringItemCount} élément(s) récurrent(s) confirmés suivis).`,
    ]
    if (data.estimate) {
      lines.push(
        `Dépenses courantes estimées : ${euros(data.estimate.totalCents)} sur ${data.estimate.days} jour(s) (${euros(data.estimate.dailyCents)} / jour, moyenne du ${frenchDate(data.estimate.basedOnFrom)} au ${frenchDate(data.estimate.basedOnTo)}).`,
      )
    }
    lines.push(
      `Solde projeté en fin de mois : ${euros(data.endBalanceCents)}.`,
      `Point le plus bas : ${euros(data.lowest.balanceCents)} le ${frenchDate(data.lowest.date)}.`,
      data.belowThreshold
        ? `Passe sous ${euros(data.thresholdCents)} le ${frenchDate(data.belowThreshold.date)} (${euros(data.belowThreshold.balanceCents)}).`
        : `Ne passe pas sous ${euros(data.thresholdCents)}.`,
    )
    if (data.items.length > 0)
      lines.push(
        '',
        'Opérations récurrentes attendues :',
        ...data.items.map(itemLine),
      )
    if (data.recurringItemCount === 0) {
      lines.push(
        '',
        "Aucun récurrent confirmé : confirmez les abonnements détectés dans l'application pour une prévision utile.",
      )
    }
    return lines.join('\n')
  },
})
