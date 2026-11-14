import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'
import { NewAccountButton } from '#/components/accounts/AccountEditor'
import { AddInvestmentButton } from '#/components/accounts/AddInvestmentSheet'
import {
  isValuedByHand,
  UpdateValueButton,
} from '#/components/accounts/UpdateValueButton'
import type { DashboardAccountDto, NetWorthDto } from '#/api/types.gen'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { ACCOUNT_TYPE_LABELS } from './labels'

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

function AccountDetails({ account }: { account: DashboardAccountDto }) {
  const kind = [ACCOUNT_TYPE_LABELS[account.type], account.institution]
    .filter(Boolean)
    .join(' · ')
  return (
    // The balance goes under the name when both don't fit side by side.
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
      <div className="min-w-[7rem] flex-1">
        <p className="font-medium break-words">{account.name}</p>
        <p className="text-muted-foreground truncate text-xs">{kind}</p>
      </div>
      <div className="ml-auto text-right whitespace-nowrap">
        <p className="font-medium tabular-nums">
          {account.balanceCents === null
            ? '—'
            : formatCents(account.balanceCents)}
        </p>
        <p
          className={cn(
            'text-xs',
            account.stale
              ? 'text-warning-foreground dark:text-warning font-medium'
              : 'text-muted-foreground',
          )}
        >
          {account.balanceDate === null
            ? 'Solde inconnu'
            : `au ${formatCalendarDate(account.balanceDate)}`}
          {account.stale && ' · à mettre à jour'}
        </p>
      </div>
    </div>
  )
}

/**
 * Accounts and their balances, cash (checking, savings) apart from
 * investments, each group with its subtotal. Cash accounts open their
 * transactions; investment accounts, valued by snapshots, open their detail
 * page (value history, gain). PEA, life insurance and employee savings rows
 * also update their value in place; a value older than a month is flagged.
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
        <Link
          to={ROUTES.netWorth}
          className="bg-muted/50 hover:bg-muted focus-visible:ring-ring flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2.5 outline-none focus-visible:ring-2"
        >
          <span className="min-w-[7rem] flex-1">
            <span className="block text-sm font-medium">Patrimoine net</span>
            <span className="text-muted-foreground block text-xs">
              Évolution et répartition
            </span>
          </span>
          <span className="ml-auto flex items-center gap-1 font-semibold whitespace-nowrap tabular-nums">
            {formatCents(netWorth.totalCents)}
            <ChevronRightIcon
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
          </span>
        </Link>
        {GROUPS.map(({ group, title, total }) => {
          const items = accounts.filter((account) => account.group === group)
          if (items.length === 0) return null
          const headingId = `accounts-${group}`
          return (
            <section key={group} aria-labelledby={headingId}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-b pb-1.5">
                <h3
                  id={headingId}
                  className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
                >
                  {title}
                </h3>
                <p className="text-sm font-semibold whitespace-nowrap tabular-nums">
                  {formatCents(total(netWorth))}
                </p>
              </div>
              <ul className="divide-y">
                {items.map((account) => {
                  const row = cn(
                    'flex min-w-0 flex-1 items-center gap-3 py-2.5 text-sm',
                    'hover:bg-muted/50 focus-visible:ring-ring -mx-2 rounded-md px-2 outline-none focus-visible:ring-2',
                  )
                  const content = (
                    <>
                      <AccountDetails account={account} />
                      <ChevronRightIcon
                        aria-hidden
                        className="text-muted-foreground size-4 shrink-0"
                      />
                    </>
                  )
                  return (
                    <li key={account.id} className="flex items-center gap-1">
                      {group === 'cash' ? (
                        <Link
                          to={ROUTES.transactions}
                          search={{ account: account.id }}
                          title="Voir les opérations"
                          className={row}
                        >
                          {content}
                        </Link>
                      ) : (
                        <Link
                          to={ROUTES.account}
                          params={{ accountId: account.id }}
                          title="Voir la valeur et la plus-value"
                          className={row}
                        >
                          {content}
                        </Link>
                      )}
                      {isValuedByHand(account.type) && (
                        <UpdateValueButton account={account} />
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
        <div className="flex flex-wrap gap-2">
          <AddInvestmentButton size="sm" outline />
          <NewAccountButton label="Ajouter un compte" size="sm" outline />
        </div>
      </CardContent>
    </Card>
  )
}
