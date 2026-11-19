import { Card, CardContent, CardHeader, CardTitle } from '@finances/ui'
import type { SavingsStockDto } from '#/api/types.gen'
import {
  AccountList,
  AccountListTotal,
} from '#/components/accounts/AccountList'
import { plural } from '#/lib/plural'

/**
 * What has been put aside: savings accounts (balance) and investment
 * accounts (value, gain over contributions), each opening its account page.
 * The total, the unrealised gain and what was paid in head the card as
 * figures; « Où va mon épargne » below says where the money went.
 */
export function SavingsStock({ stock }: { stock: SavingsStockDto }) {
  const { cash, investments } = stock
  if (cash.accounts.length === 0 && investments.accounts.length === 0) {
    return null
  }
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-1">
        <CardTitle>Épargne et placements</CardTitle>
        <AccountListTotal
          totalCents={stock.totalCents}
          gainCents={stock.gainCents}
          paidInCents={investments.totals.contributionsCents}
        />
        {investments.totals.withoutContributionsCount > 0 &&
          investments.totals.contributionsCents !== null && (
            <p className="text-muted-foreground text-xs">
              Versé et plus-value hors{' '}
              {plural(
                investments.totals.withoutContributionsCount,
                'placement',
                'placements',
              )}{' '}
              sans versements connus.
            </p>
          )}
      </CardHeader>
      <CardContent>
        <AccountList
          from="savings"
          primaryAction="investment"
          groups={[
            {
              id: 'cash',
              title: 'Épargne disponible',
              totalCents: cash.totalCents,
              impliedTypes: ['savings'],
              accounts: cash.accounts.map((account) => ({
                ...account,
                valueCents: account.balanceCents,
                valueDate: account.balanceDate,
              })),
            },
            {
              id: 'investments',
              title: 'Placements',
              totalCents: investments.totals.valueCents,
              accounts: investments.accounts,
            },
          ]}
        />
      </CardContent>
    </Card>
  )
}
