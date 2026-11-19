import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  formatSignedPercent,
  formatWholeEuros,
  ItemList,
  ItemListGroup,
  ItemListRow,
  StatCard,
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

const signedWholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})
const formatSignedWholeEuros = (cents: number) =>
  signedWholeEuros.format(cents / 100)

function signed(cents: number): string {
  return `${cents > 0 ? '+' : ''}${formatCents(cents)}`
}

/** Gain coloured by its sign, with its simple return. */
function Gain({
  gainCents,
  returnRate,
}: {
  gainCents: number | null
  returnRate: number | null
}) {
  if (gainCents === null) {
    return <span className="text-muted-foreground">versé inconnu</span>
  }
  return (
    <span
      className={cn(
        gainCents > 0 && 'text-chart-delta-good',
        gainCents < 0 && 'text-chart-delta-bad',
        gainCents === 0 && 'text-muted-foreground',
      )}
    >
      {signed(gainCents)}
      {returnRate !== null && ` · ${formatSignedPercent(returnRate)}`}
    </span>
  )
}

/** Versé, valeur, plus-value: in total, then per investment account. */
function Totals({ summary }: { summary: InvestmentsSummaryDto }) {
  const { totals } = summary
  const dash = () => '—'
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 @lg:grid-cols-3">
        <StatCard
          label="Versé"
          value={totals.contributionsCents ?? 0}
          valueFormatter={
            totals.contributionsCents === null ? dash : formatWholeEuros
          }
        />
        <StatCard
          label="Valeur"
          value={totals.valueCents}
          valueFormatter={formatWholeEuros}
        />
        <StatCard
          label="Plus-value"
          value={totals.gainCents ?? 0}
          valueFormatter={
            totals.gainCents === null ? dash : formatSignedWholeEuros
          }
          note={
            totals.returnRate === null
              ? undefined
              : formatSignedPercent(totals.returnRate)
          }
        />
      </div>
      {totals.withoutContributionsCount > 0 && (
        <p className="text-muted-foreground px-1 text-xs">
          Versé et plus-value hors{' '}
          {plural(totals.withoutContributionsCount, 'placement', 'placements')}{' '}
          sans versements connus.
        </p>
      )}
    </div>
  )
}

function accountSubtitle(
  row: InvestmentsSummaryDto['accounts'][number],
): string {
  if (row.contributionsCents === null) return 'Versements inconnus'
  const paid = `Versé ${formatCents(row.contributionsCents)}`
  return row.contributionsSource === 'links'
    ? `${paid} · ${plural(row.linkedTransfersCount, 'virement', 'virements')}`
    : paid
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
        description="Liez un virement à son placement sur Opérations (« Vers ») ou avec une règle : ses versements et cette répartition en découlent."
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
      <ItemListGroup
        title="Où est allé l’argent, sur 12 mois"
        total={signed(flows.netCents)}
      >
        {flows.accounts.map((account) => {
          const { icon: Icon, className } = ACCOUNT_TYPE_ICONS[account.type]
          const archived = !summary.accounts.some(
            (row) => row.id === account.accountId,
          )
          return (
            <ItemListRow
              key={account.accountId}
              asChild
              icon={<Icon />}
              iconClassName={className}
              title={account.name}
              subtitle={`${plural(account.count, 'virement', 'virements')}${archived ? ' · archivé' : ''}`}
              value={signed(account.netCents)}
              detail={
                account.withdrawalsCents > 0
                  ? `dont ${formatCents(account.withdrawalsCents)} retirés`
                  : undefined
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
 * The investments recap of Épargne (#296): what was paid in, what it is
 * worth and the gain, in total and per account, then where the money went
 * over the last 12 months (the transfers linked to each investment).
 */
export function InvestmentsRecap() {
  const summary = useQuery(investmentsSummaryQuery)
  const flows = useQuery(investmentFlowsQuery)
  if (!summary.data || summary.data.accounts.length === 0) return null
  return (
    <Card className="min-w-0">
      <CardHeader className="gap-1">
        <CardTitle>Investissements</CardTitle>
        <CardDescription>
          Ce que vous avez versé, ce que ça vaut aujourd’hui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Totals summary={summary.data} />
        <ItemList>
          <ItemListGroup title="Par placement">
            {summary.data.accounts.map((row) => {
              const { icon: Icon, className } = ACCOUNT_TYPE_ICONS[row.type]
              return (
                <ItemListRow
                  key={row.id}
                  asChild
                  icon={<Icon />}
                  iconClassName={className}
                  title={row.name}
                  subtitle={accountSubtitle(row)}
                  value={
                    row.valueCents === null ? '—' : formatCents(row.valueCents)
                  }
                  detail={
                    <Gain
                      gainCents={row.gainCents}
                      returnRate={row.returnRate}
                    />
                  }
                >
                  <Link
                    to={ROUTES.account}
                    params={{ accountId: row.id }}
                    search={accountLinkSearch('savings')}
                    title="Voir le détail du compte"
                  />
                </ItemListRow>
              )
            })}
          </ItemListGroup>
        </ItemList>
        {flows.data && <Flows flows={flows.data} summary={summary.data} />}
        <RecapMovements />
      </CardContent>
    </Card>
  )
}
