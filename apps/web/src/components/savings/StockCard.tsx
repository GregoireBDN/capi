import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  formatSignedPercent,
  formatWholeEuros,
} from '@capi/ui'
import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { SavingsStockDto } from '#/api/types.gen'
import { AccountList } from '#/components/accounts/AccountList'
import type { AccountListItem } from '#/components/accounts/AccountList'
import { accountLinkSearch } from '#/components/accounts/account-origin'
import { ACCOUNT_TYPE_ICONS } from '#/components/accounts/labels'
import { ACCOUNT_TYPE_LABELS } from '#/components/dashboard/labels'
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
 * as one bar, the largest accounts, then « Voir les n comptes ». On a
 * computer (`wide`, « A. Rangée de chiffres »): the total and the result in
 * the header, the split as one thin bar with its legend in one line, then
 * every account, one row each.
 */
export function StockCard({
  stock,
  wide = false,
}: {
  stock: SavingsStockDto
  wide?: boolean
}) {
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
  const result = stock.gainCents !== null && (
    <span
      className={cn(
        'font-medium tabular-nums',
        stock.gainCents >= 0 ? 'text-chart-delta-good' : 'text-chart-delta-bad',
      )}
    >
      {signedWholeEuros(stock.gainCents)}{' '}
      <span className="text-muted-foreground font-normal">de résultat</span>
    </span>
  )
  const split = (
    <SplitBar
      className={wide ? 'h-2' : 'h-3'}
      max={stock.totalCents}
      parts={[
        { cents: cash.totalCents, color: SAVINGS_COLOR },
        { cents: investmentsCents, color: INVESTMENTS_COLOR },
      ]}
    />
  )
  const shown = wide ? accounts : accounts.slice(0, STOCK_ACCOUNTS_SHOWN)
  return (
    <Card className="min-w-0">
      <CardHeader
        className={cn(
          wide && 'flex flex-wrap items-baseline justify-between gap-x-4',
        )}
      >
        <CardTitle>Livrets et placements</CardTitle>
        {wide && (
          <span className="flex items-baseline gap-3 text-sm">
            <span className="text-xl font-semibold whitespace-nowrap tabular-nums">
              {formatWholeEuros(stock.totalCents)}
            </span>
            {result}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {wide ? (
          <div className="space-y-1.5">
            {split}
            <div className="text-muted-foreground flex flex-wrap gap-x-6 text-xs">
              <Legend color={SAVINGS_COLOR} label="Livrets">
                {formatWholeEuros(cash.totalCents)}
              </Legend>
              <Legend color={INVESTMENTS_COLOR} label="Placements">
                {formatWholeEuros(investmentsCents)}
              </Legend>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-0.5">
              <p className="text-3xl font-semibold tracking-tight whitespace-nowrap tabular-nums">
                {formatWholeEuros(stock.totalCents)}
              </p>
              {result && <p className="text-sm">{result}</p>}
            </div>
            <div className="space-y-2">
              {split}
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
          </>
        )}
        <div className="space-y-1 pt-2">
          {wide && <AccountsTable accounts={accounts} />}
          {/* On a computer only its add buttons, which go to « ⋮ ». */}
          <AccountList
            from="savings"
            primaryAction="investment"
            groups={wide ? [] : [{ id: 'accounts', accounts: shown }]}
          />
          {accounts.length > shown.length && (
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

function Legend({
  color,
  label,
  children,
}: {
  color: string
  label: string
  children: ReactNode
}) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className={cn('size-2 rounded-full', color)} />
      {label}
      <span className="text-foreground font-medium tabular-nums">
        {children}
      </span>
    </span>
  )
}

/** The columns of an account's row on a computer, and of their headings. */
const ACCOUNT_COLUMNS = 'grid-cols-[minmax(0,1fr)_8rem_6.5rem_4.5rem]'

/**
 * Every account in one compact row each (a computer, #407): its badge and
 * name, its type, its value in whole euros, its result in %. The row opens
 * the account page.
 */
function AccountsTable({ accounts }: { accounts: AccountListItem[] }) {
  return (
    <div className="text-sm">
      <div
        aria-hidden
        className={cn(
          'text-muted-foreground grid gap-x-4 px-2 pb-1.5 text-xs',
          ACCOUNT_COLUMNS,
        )}
      >
        <span>Compte</span>
        <span>Type</span>
        <span className="text-right">Valeur</span>
        <span className="text-right">Résultat</span>
      </div>
      <ul className="space-y-1">
        {accounts.map((account) => {
          const { icon: Icon, className } = ACCOUNT_TYPE_ICONS[account.type]
          const rate = account.returnRate ?? null
          return (
            <li key={account.id}>
              <Link
                to={ROUTES.account}
                params={{ accountId: account.id }}
                search={accountLinkSearch('savings')}
                className={cn(
                  'hover:bg-muted/60 focus-visible:ring-ring grid min-h-11 items-center gap-x-4 rounded-lg px-2 outline-none focus-visible:ring-2',
                  ACCOUNT_COLUMNS,
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5',
                      className,
                    )}
                  >
                    <Icon />
                  </span>
                  <span className="truncate font-medium">{account.name}</span>
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {ACCOUNT_TYPE_LABELS[account.type]}
                </span>
                <span className="text-right whitespace-nowrap tabular-nums">
                  {account.valueCents === null
                    ? '—'
                    : formatWholeEuros(account.valueCents)}
                </span>
                <span
                  className={cn(
                    'text-right text-xs whitespace-nowrap tabular-nums',
                    rate === null
                      ? 'text-muted-foreground'
                      : rate >= 0
                        ? 'text-chart-delta-good'
                        : 'text-chart-delta-bad',
                  )}
                >
                  {rate === null ? '—' : formatSignedPercent(rate)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
