import type {
  AccountEnvelopesDto,
  DashboardAccountDto,
  DashboardOverviewDto,
  EnvelopeSummaryDto,
} from '../api/types.js'
import {
  euros,
  eurosOrUnknown,
  frenchDate,
  frenchMonth,
  signedEuros,
} from '../format.js'
import { ACCOUNT_TYPE_LABELS } from './labels.js'
import { defineTool } from './tool.js'

/** Bank accounts (`BANK_ACCOUNT_TYPES`): the « libre » total is theirs. */
const BANK_TYPES: DashboardAccountDto['type'][] = ['checking', 'savings']

/** « dont 450 € dans des enveloppes · 1 230 € libre » (#522), as the API counts it. */
function envelopesPart(split: AccountEnvelopesDto | undefined): string {
  if (split === undefined) return ''
  const held = `dont ${euros(split.allocatedCents)} dans des enveloppes`
  if (split.shortfallCents > 0) {
    return ` · ${held} · il manque ${euros(split.shortfallCents)} pour couvrir les enveloppes`
  }
  return split.freeCents === null
    ? ` · ${held}`
    : ` · ${held} · ${euros(split.freeCents)} libre`
}

function accountLine(
  account: DashboardAccountDto,
  split?: AccountEnvelopesDto,
): string {
  const parts = [ACCOUNT_TYPE_LABELS[account.type], account.institution]
    .filter(Boolean)
    .join(', ')
  const balance =
    account.balanceCents === null
      ? 'solde inconnu'
      : `${euros(account.balanceCents)} au ${frenchDate(account.balanceDate)}`
  const stale = account.stale ? ' — pas à jour' : ''
  return `- ${account.name} (${parts}) : ${balance}${envelopesPart(split)}${stale}`
}

export const accountsOverviewTool = defineTool({
  name: 'accounts_overview',
  title: 'Comptes et patrimoine',
  description:
    'Net worth (total, cash, investments) with its change since the last month end, and every open account with its latest balance and date. Flags accounts that are not up to date. Gives « libre » (balance − envelopes). Call it first to learn the account names other tools accept.',
  inputSchema: {},
  async run({ api }) {
    const [overview, envelopes] = await Promise.all([
      api.get<DashboardOverviewDto>('/api/dashboard/overview'),
      api.get<EnvelopeSummaryDto[]>('/api/envelopes', {
        includeArchived: true,
      }),
    ])
    const { netWorth, accounts } = overview
    // One request per account holding envelopes, so « libre » is the API's.
    const holding = new Set(
      envelopes.flatMap((e) =>
        e.accounts.filter((a) => a.amountCents !== 0).map((a) => a.accountId),
      ),
    )
    const splits = new Map(
      await Promise.all(
        accounts
          .filter((a) => holding.has(a.id))
          .map(
            async (a) =>
              [
                a.id,
                await api.get<AccountEnvelopesDto>(
                  `/api/accounts/${encodeURIComponent(a.id)}/envelopes`,
                ),
              ] as const,
          ),
      ),
    )
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
        ...inGroup.map((a) => accountLine(a, splits.get(a.id))),
      )
    }
    if (splits.size > 0) {
      const free = accounts
        .filter((a) => BANK_TYPES.includes(a.type) && a.balanceCents !== null)
        .reduce(
          (sum, a) =>
            sum + (splits.get(a.id)?.freeCents ?? a.balanceCents ?? 0),
          0,
        )
      lines.push(
        '',
        `Libre sur les comptes bancaires (soldes moins enveloppes, déjà comptées dans le patrimoine) : ${euros(free)}.`,
      )
    }
    if (accounts.length === 0) lines.push('', 'Aucun compte ouvert.')
    return lines.join('\n')
  },
})
