import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ItemList,
  ItemListGroup,
  ItemListRow,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRightLeftIcon, ChevronRightIcon } from 'lucide-react'
import type { InvestmentFlowsDto, InvestmentsSummaryDto } from '#/api/types.gen'
import { ACCOUNT_TYPE_ICONS } from '#/components/accounts/labels'
import {
  investmentFlowsQuery,
  investmentsSummaryQuery,
} from '#/components/accounts/queries'
import { MovementList, movementsQuery } from '#/components/accounts/Movements'
import { formatShortMonth } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { ROUTES } from '#/lib/routes'
import { accountLinkSearch } from '#/components/accounts/account-origin'

function signed(cents: number): string {
  return `${cents > 0 ? '+' : ''}${formatCents(cents)}`
}

/** Where the money went (#296): the linked transfers, per account and month. */
function Flows({
  flows,
  summary,
}: {
  flows: InvestmentFlowsDto
  summary: InvestmentsSummaryDto
}) {
  if (flows.accounts.length === 0) {
    return (
      <EmptyState
        variant="inline"
        icon={<ArrowRightLeftIcon />}
        title="Aucun virement lié sur 12 mois"
        description="Liez un virement à son placement sur Opérations (« Vers ») ou avec une règle : son montant investi et cette répartition en découlent."
        actions={
          <Link
            to={ROUTES.transactions}
            search={{ kind: 'transfer' }}
            className="text-primary text-sm font-medium underline-offset-4 hover:underline"
          >
            Voir les virements
          </Link>
        }
      />
    )
  }
  const names = new Map(flows.accounts.map((a) => [a.accountId, a.name]))
  return (
    <ItemList>
      <ItemListGroup title="Sur 12 mois" total={signed(flows.netCents)}>
        {flows.accounts.map((account) => {
          const { icon: Icon, className } = ACCOUNT_TYPE_ICONS[account.type]
          const archived = !summary.accounts.some(
            (row) => row.id === account.accountId,
          )
          const withdrawn =
            account.withdrawalsCents > 0
              ? `dont ${formatCents(account.withdrawalsCents)} retirés`
              : undefined
          return (
            <ItemListRow
              key={account.accountId}
              asChild
              icon={<Icon />}
              iconClassName={className}
              title={account.name}
              subtitle={`${plural(account.count, 'virement', 'virements')}${archived ? ' · archivé' : ''}`}
              value={signed(account.netCents)}
              detail={withdrawn}
              // Phones (#344): the name, then the net (and what was taken
              // out); the count stays on wider rows and the account page.
              compactWhenNarrow
              compactDetail={
                withdrawn && (
                  <span className="text-muted-foreground">{withdrawn}</span>
                )
              }
            >
              <Link
                to={ROUTES.account}
                params={{ accountId: account.accountId }}
                search={accountLinkSearch('savings')}
                title="Voir le détail du compte"
              />
            </ItemListRow>
          )
        })}
      </ItemListGroup>
      {/* Folded: twelve similar months would push the rest down a phone. */}
      <details aria-label="Par mois" className="group space-y-1">
        <summary className="text-muted-foreground hover:text-foreground flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-2 text-sm font-medium">
          <ChevronRightIcon
            className="size-[0.8rem] transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          Par mois ({flows.months.length})
        </summary>
        <ul className="divide-border divide-y px-2">
          {flows.months.map((month) => (
            <li
              key={month.month}
              className="flex min-h-11 flex-wrap items-center gap-x-3 py-1.5 text-sm"
            >
              <span className="min-w-[7rem] flex-1">
                <span className="block">{formatShortMonth(month.month)}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {month.accounts
                    .map((a) => names.get(a.accountId))
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </span>
              <span className="ml-auto whitespace-nowrap tabular-nums">
                {signed(month.netCents)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </ItemList>
  )
}

/** Bank → exchange → Ledger, folded: every movement of the 24 months. */
function RecapMovements() {
  const movements = useQuery(movementsQuery())
  const items = movements.data?.items ?? []
  if (items.length === 0) return null
  return (
    <details aria-label="Mouvements" className="group space-y-1">
      <summary className="text-muted-foreground hover:text-foreground flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-2 text-sm font-medium">
        <ChevronRightIcon
          className="size-[0.8rem] transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        Mouvements entre vos comptes ({items.length})
      </summary>
      <div className="px-2">
        <MovementList movements={items} />
      </div>
    </details>
  )
}

/**
 * « Où va mon épargne » on Épargne (#296, reworked after #344): where the
 * money went over the last 12 months, the transfers linked to each
 * investment, then the movements between the owner's accounts. What is held,
 * paid in and gained is in « Épargne et placements » above, so this card
 * repeats no account list and no totals.
 */
export function InvestmentsRecap() {
  const summary = useQuery(investmentsSummaryQuery)
  const flows = useQuery(investmentFlowsQuery)
  if (!summary.data || summary.data.accounts.length === 0) return null
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-1">
        <CardTitle>Où va mon épargne</CardTitle>
        <CardDescription>
          Les virements vers vos placements, et entre vos comptes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {flows.data && <Flows flows={flows.data} summary={summary.data} />}
        <RecapMovements />
      </CardContent>
    </Card>
  )
}
