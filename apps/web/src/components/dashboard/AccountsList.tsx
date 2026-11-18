import { Card, CardContent } from '@finances/ui'
import type { DashboardAccountDto, NetWorthDto } from '#/api/types.gen'
import { AccountList } from '#/components/accounts/AccountList'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { DashboardCardHeader } from './DashboardCardHeader'
import { FigureTile } from './FigureTile'

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
        {/* Today's net worth, once, with its date (the month-end one is
            in the review card), then its two parts; the groups below
            don't repeat their totals. */}
        <div className="@container grid gap-2">
          <FigureTile
            label="Patrimoine à ce jour"
            value={formatCents(netWorth.totalCents)}
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
