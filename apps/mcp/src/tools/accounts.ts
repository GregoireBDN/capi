import type { DashboardAccountDto, DashboardOverviewDto } from '../api/types.js'
import {
  euros,
  eurosOrUnknown,
  frenchDate,
  frenchMonth,
  signedEuros,
} from '../format.js'
import { ACCOUNT_TYPE_LABELS } from './labels.js'
import { defineTool } from './tool.js'

function accountLine(account: DashboardAccountDto): string {
  const parts = [ACCOUNT_TYPE_LABELS[account.type], account.institution]
    .filter(Boolean)
    .join(', ')
  const balance =
    account.balanceCents === null
      ? 'solde inconnu'
      : `${euros(account.balanceCents)} au ${frenchDate(account.balanceDate)}`
  const stale = account.stale ? ' — pas à jour' : ''
  return `- ${account.name} (${parts}) : ${balance}${stale}`
}

export const accountsOverviewTool = defineTool({
  name: 'accounts_overview',
  title: 'Comptes et patrimoine',
  description:
    'Net worth (total, cash, investments) with its change since the last month end, and every open account with its latest balance and date. Flags accounts that are not up to date. Call it first to learn the account names other tools accept.',
  inputSchema: {},
  async run({ api }) {
    const overview = await api.get<DashboardOverviewDto>(
      '/api/dashboard/overview',
    )
    const { netWorth, accounts } = overview
    const lines = [
      `Patrimoine net : ${euros(netWorth.totalCents)} (liquidités ${euros(netWorth.cashCents)}, placements ${euros(netWorth.investmentsCents)}).`,
    ]
    if (netWorth.previousMonthEndCents !== null) {
      lines.push(
        `Fin ${frenchMonth(netWorth.previousMonthEnd)} (${frenchDate(netWorth.previousMonthEnd)}) : ${euros(netWorth.previousMonthEndCents)}, soit ${signedEuros(netWorth.totalCents - netWorth.previousMonthEndCents)} depuis.`,
      )
    }
    if (netWorth.unknownBalanceCount > 0) {
      lines.push(
        `${netWorth.unknownBalanceCount} compte(s) sans solde connu, exclus du total.`,
      )
    }
    for (const [group, title] of [
      ['cash', 'Liquidités'],
      ['investments', 'Placements'],
    ] as const) {
      const inGroup = accounts.filter((a) => a.group === group)
      if (inGroup.length === 0) continue
      const total = inGroup.reduce((sum, a) => sum + (a.balanceCents ?? 0), 0)
      lines.push(
        '',
        `${title} (${eurosOrUnknown(total)}) :`,
        ...inGroup.map(accountLine),
      )
    }
    if (accounts.length === 0) lines.push('', 'Aucun compte ouvert.')
    return lines.join('\n')
  },
})
