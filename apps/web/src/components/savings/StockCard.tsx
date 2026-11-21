import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  formatWholeEuros,
} from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'
import type { SavingsStockDto } from '#/api/types.gen'
import { AccountList } from '#/components/accounts/AccountList'
import type { AccountListItem } from '#/components/accounts/AccountList'
import { ROUTES } from '#/lib/routes'
import {
  FigureRow,
  INVESTMENTS_COLOR,
  SAVINGS_COLOR,
  signedWholeEuros,
  SplitBar,
} from './figures'

/** Accounts listed on Épargne; the others are one tap away on Comptes. */
export const STOCK_ACCOUNTS_SHOWN = 3

/**
 * « Livrets et placements » (#407): what is held, once: the total, the
 * investments' result, the split between savings accounts and investments
 * as one bar, the largest accounts, then « Voir les n comptes ».
 */
export function StockCard({ stock }: { stock: SavingsStockDto }) {
  const { cash, investments } = stock
  const accounts: AccountListItem[] = [
    ...cash.accounts.map((account) => ({
      ...account,
      valueCents: account.balanceCents,
      valueDate: account.balanceDate,
    })),
    ...investments.accounts,
  ].sort((a, b) => (b.valueCents ?? 0) - (a.valueCents ?? 0))
  if (accounts.length === 0) return null
  const investmentsCents = investments.totals.valueCents
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Livrets et placements</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-0.5">
          <p className="text-3xl font-semibold tracking-tight whitespace-nowrap tabular-nums">
            {formatWholeEuros(stock.totalCents)}
          </p>
          {stock.gainCents !== null && (
            <p
              className={cn(
                'text-sm font-medium tabular-nums',
                stock.gainCents >= 0
                  ? 'text-chart-delta-good'
                  : 'text-chart-delta-bad',
              )}
            >
              {signedWholeEuros(stock.gainCents)}{' '}
              <span className="text-muted-foreground font-normal">
                de résultat
              </span>
            </p>
          )}
        </div>
        <div className="space-y-2">
          <SplitBar
            className="h-3"
            max={stock.totalCents}
            parts={[
              { cents: cash.totalCents, color: SAVINGS_COLOR },
              { cents: investmentsCents, color: INVESTMENTS_COLOR },
            ]}
          />
          <FigureRow
            label="Livrets"
            value={formatWholeEuros(cash.totalCents)}
            dot={SAVINGS_COLOR}
          />
          <FigureRow
            label="Placements"
            value={formatWholeEuros(investmentsCents)}
            dot={INVESTMENTS_COLOR}
          />
        </div>
        <div className="space-y-1 border-t pt-2">
          <AccountList
            from="savings"
            primaryAction="investment"
            groups={[
              {
                id: 'largest',
                accounts: accounts.slice(0, STOCK_ACCOUNTS_SHOWN),
              },
            ]}
          />
          {accounts.length > STOCK_ACCOUNTS_SHOWN && (
            <Link
              to={ROUTES.accounts}
              className="text-primary hover:bg-muted/60 focus-visible:ring-ring flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 text-sm font-medium outline-none focus-visible:ring-2"
            >
              Voir les {accounts.length} comptes
              <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
