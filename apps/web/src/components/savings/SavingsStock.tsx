import { Card, CardContent, CardHeader, CardTitle } from '@finances/ui'
import type { SavingsStockDto } from '#/api/types.gen'
import {
  AccountList,
  AccountListTotal,
} from '#/components/accounts/AccountList'

/**
 * What has been put aside: savings accounts (balance) and investment
 * accounts (value, gain over contributions), each opening its account page.
 * The total and the unrealised gain head the card as figures.
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
        />
      </CardHeader>
      <CardContent>
        <AccountList
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
