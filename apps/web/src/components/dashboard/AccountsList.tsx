import { Card, CardContent } from '@finances/ui'
import type { DashboardAccountDto, NetWorthDto } from '#/api/types.gen'
import { AccountList } from '#/components/accounts/AccountList'
import { formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'
import { DashboardCardHeader } from './DashboardCardHeader'
import { FigureTile } from './FigureTile'
import { formatSignedWhole } from './MonthReview'

const GROUPS = [
  {
    group: 'cash',
    title: 'Liquidités',
    total: (netWorth: NetWorthDto) => netWorth.cashCents,
  },
  {
    group: 'investments',
    title: 'Investissements',
    total: (netWorth: NetWorthDto) => netWorth.investmentsCents,
  },
] as const

/**
 * « +1 120 € depuis le 31 oct. »: today's net worth against the last month
 * end, so it reads apart from the review's month-end figure. Null when that
 * end is unknown.
 */
export function sinceMonthEnd(netWorth: NetWorthDto): string | null {
  if (netWorth.previousMonthEndCents === null) return null
  const change = netWorth.totalCents - netWorth.previousMonthEndCents
  return `${formatSignedWhole(change)} depuis le ${formatShortDay(netWorth.previousMonthEnd)}`
}

/**
 * Accounts and their balances, cash (checking, savings) apart from
 * investments, each group with its subtotal. Cash accounts open their
 * transactions; investment accounts, valued by snapshots, open their detail
 * page (value history, gain), where a value is updated; a value older than
 * its update rhythm is flagged « à mettre à jour».
 */
export function AccountsList({
  accounts,
  netWorth,
}: {
  accounts: DashboardAccountDto[]
  netWorth: NetWorthDto
}) {
  return (
    <Card className="min-w-0">
      <DashboardCardHeader
        title="Comptes"
        link={{ label: 'Évolution', to: ROUTES.netWorth }}
      />
      <CardContent className="space-y-4">
        {/* Today's net worth, once, and how it moved since the last month
            end (the month-end figure of the review, #321), then its two
            parts; the groups below don't repeat their totals. */}
        <div className="@container grid gap-2">
          <FigureTile
            label="Patrimoine à ce jour"
            value={formatCents(netWorth.totalCents)}
            notes={[sinceMonthEnd(netWorth)]}
            notesOnPhone
          />
          <div className="grid gap-2 @[36rem]:grid-cols-2">
            {GROUPS.map(({ group, title, total }) => (
              <FigureTile
                key={group}
                label={title}
                value={formatCents(total(netWorth))}
              />
            ))}
          </div>
        </div>
        <AccountList
          from="dashboard"
          primaryAction="account"
          groups={GROUPS.map(({ group, title }) => ({
            id: group,
            title,
            accounts: accounts
              .filter((account) => account.group === group)
              .map((account) => ({
                ...account,
                valueCents: account.balanceCents,
                valueDate: account.balanceDate,
                link:
                  group === 'cash'
                    ? ('transactions' as const)
                    : ('account' as const),
              })),
          }))}
        />
      </CardContent>
    </Card>
  )
}
