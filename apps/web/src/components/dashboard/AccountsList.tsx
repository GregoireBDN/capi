import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ItemListGroup,
  ItemListRow,
} from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { ChartLineIcon } from 'lucide-react'
import type { DashboardAccountDto, NetWorthDto } from '#/api/types.gen'
import { AccountList } from '#/components/accounts/AccountList'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'

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
      <CardHeader>
        <CardTitle>Comptes</CardTitle>
        <CardDescription>
          Solde de chaque compte à sa dernière date connue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ItemListGroup>
          <ItemListRow
            asChild
            icon={<ChartLineIcon />}
            iconClassName="bg-chart-savings/15 text-chart-savings"
            title="Patrimoine net"
            subtitle="Évolution et répartition"
            value={formatCents(netWorth.totalCents)}
            className="bg-muted/50 hover:bg-muted focus-visible:bg-muted"
          >
            <Link to={ROUTES.netWorth} />
          </ItemListRow>
        </ItemListGroup>
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
