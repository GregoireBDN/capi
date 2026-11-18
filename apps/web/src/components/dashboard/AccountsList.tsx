import { Card, CardContent } from '@finances/ui'
import type { DashboardAccountDto, NetWorthDto } from '#/api/types.gen'
import { AccountList } from '#/components/accounts/AccountList'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { DashboardCardHeader } from './DashboardCardHeader'

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
        {/* Today's net worth, once, with its date; the month-end one is in
            the review card. */}
        <div>
          <p className="text-muted-foreground text-xs">Patrimoine à ce jour</p>
          <p className="text-2xl font-semibold whitespace-nowrap tabular-nums">
            {formatCents(netWorth.totalCents)}
          </p>
        </div>
        <AccountList
          primaryAction="account"
          groups={GROUPS.map(({ group, title, total }) => ({
            id: group,
            title,
            totalCents: total(netWorth),
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
