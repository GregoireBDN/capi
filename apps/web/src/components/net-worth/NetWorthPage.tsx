import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyState,
  EmptyTitle,
  formatMonthLong,
  formatPercent,
  formatWholeEuros,
  LineChart,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
} from '@finances/ui'
import type { ChartConfig } from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LandmarkIcon,
  LineChartIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type {
  DashboardAccountDto,
  HistoryMonthDto,
  MonthPeriodDto,
} from '#/api/types.gen'
import { PageHeader } from '#/components/app-shell/PageHeader'
import {
  dashboardHistoryQuery,
  dashboardOverviewQuery,
} from '#/components/dashboard/queries'
import { formatSignedWhole } from '#/components/dashboard/MonthReview'
import { currentMonth } from '#/lib/calendar'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'
import { accountLinkSearch } from '#/components/accounts/account-origin'
import { DIVIDED_LIST, ROW_BUTTON } from '#/lib/row-list'
import {
  breakdownByType,
  NET_WORTH_HISTORY_MONTHS,
  NET_WORTH_PERIOD_LABELS,
  NET_WORTH_PERIODS,
  netWorthDeltas,
  netWorthSeries,
  typeShare,
} from './net-worth'
import type {
  NetWorthDelta,
  NetWorthPeriod,
  NetWorthPoint,
  TypeBreakdown,
} from './net-worth'

const CHART_HEIGHT = 240

const CONFIG = {
  netWorthCents: { label: 'Patrimoine net', color: 'var(--chart-savings)' },
} satisfies ChartConfig

const shortMonthYear = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** `2026-10` → "oct. 2026". */
function formatShortMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return shortMonthYear.format(new Date(Date.UTC(year, monthNumber - 1, 1)))
}

const DELTA_LABELS: Record<NetWorthDelta['key'], string> = {
  month: 'Sur 1 mois',
  year: 'Sur 12 mois',
  yearStart: 'Depuis janvier',
}

/**
 * What the selected point is: today's figure for the month in progress
 * ("Aujourd’hui"), else the month end ("Fin octobre 2026").
 */
function pointTitle(month: string, isCurrent: boolean): string {
  return isCurrent ? 'Aujourd’hui' : `Fin ${formatMonthLong(month)}`
}

const LINK_ROW =
  'hover:bg-muted/50 focus-visible:ring-ring -mx-2 min-h-11 rounded-md px-2 outline-none focus-visible:ring-2'

/** Opens an account: its transactions (cash) or its value page (investments). */
function AccountLink({
  accountId,
  account,
  className: rowClassName,
  divided = false,
  children,
}: Pick<TypeBreakdown['accounts'][number], 'accountId' | 'account'> & {
  className: string
  /** A row of a list split by rules: square, filling the space between them. */
  divided?: boolean
  children: ReactNode
}) {
  const className = divided ? cn('px-2', rowClassName) : rowClassName
  if (!account) return <div className={className}>{children}</div>
  const linkClassName = cn(divided ? ROW_BUTTON : LINK_ROW, className)
  return account.group === 'cash' ? (
    <Link
      to={ROUTES.transactions}
      search={{ account: accountId }}
      title="Voir les opérations"
      className={linkClassName}
    >
      {children}
    </Link>
  ) : (
    <Link
      to={ROUTES.account}
      params={{ accountId }}
      search={accountLinkSearch('net-worth')}
      title="Voir la valeur et la plus-value"
      className={linkClassName}
    >
      {children}
    </Link>
  )
}

function Chevron() {
  return (
    <ChevronRightIcon
      aria-hidden
      className="text-muted-foreground size-4 shrink-0 self-center"
    />
  )
}

function AccountRow({
  accountId,
  account,
  balanceCents,
}: TypeBreakdown['accounts'][number]) {
  return (
    <AccountLink
      accountId={accountId}
      account={account}
      divided
      className="flex min-w-0 flex-1 items-center gap-x-2 py-2 text-sm"
    >
      {/* The amount goes under the name when both don't fit; the chevron
          stays at the end of the row. */}
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3">
        <span className="min-w-[7rem] flex-1 break-words">
          {account?.name ?? 'Compte'}
        </span>
        <span className="ml-auto whitespace-nowrap tabular-nums">
          {formatWholeEuros(balanceCents)}
        </span>
      </span>
      {account && <Chevron />}
    </AccountLink>
  )
}

/** A type's name, its share and its total, on one line (wraps on a phone). */
function TypeTotal({
  type,
  share,
  accountName,
}: {
  type: TypeBreakdown
  share: number
  /** The type's only account, when its name says more than the type. */
  accountName?: string
}) {
  return (
    <>
      <div className="min-w-[7rem] flex-1">
        <h3 className="text-sm font-medium">{type.label}</h3>
        {accountName && (
          <p className="text-muted-foreground text-xs break-words">
            {accountName}
          </p>
        )}
      </div>
      <span className="ml-auto text-sm whitespace-nowrap tabular-nums">
        <span className="text-muted-foreground">{formatPercent(share)}</span>{' '}
        <span className="font-semibold">
          {formatWholeEuros(type.totalCents)}
        </span>
      </span>
    </>
  )
}

/**
 * Net worth at the selected month end by account type, each type with its
 * share and its accounts (links to their pages); the types add up to the
 * total shown at the bottom. A type with a single account is that account:
 * one row that opens it, rather than the type and then the same account.
 */
function Breakdown({
  point,
  title,
  accounts,
}: {
  point: HistoryMonthDto & { netWorthCents: number }
  title: string
  accounts: DashboardAccountDto[]
}) {
  const types = breakdownByType(point, accounts)
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Répartition</CardTitle>
        <CardDescription>{title}, par type de compte.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-4">
          {types.map((type) => {
            const share = typeShare(types, type)
            const only = type.accounts.length === 1 ? type.accounts[0] : null
            const onlyName = only?.account?.name
            return (
              <li key={type.type} aria-label={type.label}>
                {only ? (
                  <AccountLink
                    accountId={only.accountId}
                    account={only.account}
                    className="flex items-center gap-x-2 py-1"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3">
                      <TypeTotal
                        type={type}
                        share={share}
                        accountName={
                          onlyName && onlyName !== type.label
                            ? onlyName
                            : undefined
                        }
                      />
                    </div>
                    {only.account && <Chevron />}
                  </AccountLink>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3">
                    <TypeTotal type={type} share={share} />
                  </div>
                )}
                <div
                  aria-hidden
                  className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full"
                >
                  <div
                    className="bg-chart-savings h-full rounded-full"
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
                {!only && (
                  <ul className={cn('mt-1', DIVIDED_LIST)}>
                    {type.accounts.map((item) => (
                      <li key={item.accountId} className="flex">
                        <AccountRow {...item} />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 border-t pt-3">
          <p className="text-sm font-medium">Total</p>
          <p className="font-semibold whitespace-nowrap tabular-nums">
            {formatWholeEuros(point.netWorthCents)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function Deltas({ deltas }: { deltas: NetWorthDelta[] }) {
  return (
    <dl className="grid gap-x-4 gap-y-3 @lg:grid-cols-3">
      {deltas.map((delta) => (
        <div
          key={delta.key}
          className="flex items-center justify-between gap-x-3 @lg:flex-col @lg:items-start @lg:justify-start"
        >
          <dt className="min-w-0">
            <span className="block text-sm">{DELTA_LABELS[delta.key]}</span>
            <span className="text-muted-foreground block text-xs whitespace-nowrap">
              vs fin {formatShortMonth(delta.since)}
            </span>
          </dt>
          <dd
            className={cn(
              'font-medium whitespace-nowrap tabular-nums',
              delta.cents !== null &&
                delta.cents > 0 &&
                'text-chart-delta-good',
              delta.cents !== null && delta.cents < 0 && 'text-chart-delta-bad',
            )}
          >
            {delta.cents === null ? (
              <span className="text-muted-foreground text-sm font-normal">
                Pas de donnée
              </span>
            ) : (
              formatSignedWhole(delta.cents)
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The net worth chart with its selected point: the value at that month end
 * (or today for the month in progress), its changes over 1 month, 12 months
 * and since January, the period switch and the chart (tap a month to select
 * it; the chevrons step month by month).
 */
function HistoryCard({
  series,
  months,
  selected,
  onSelect,
  period,
  onPeriodChange,
  coverage,
}: {
  series: NetWorthPoint[]
  months: HistoryMonthDto[]
  selected: NetWorthPoint
  onSelect: (month: string) => void
  period: NetWorthPeriod
  onPeriodChange: (period: NetWorthPeriod) => void
  coverage: MonthPeriodDto
}) {
  const position = series.findIndex((point) => point.month === selected.month)
  const isCurrent = selected.month === currentMonth()
  const first = series[0].month
  const last = series[series.length - 1].month

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center gap-1">
        <Button
          variant="secondary"
          ghost
          iconOnly
          aria-label="Mois précédent"
          disabled={position <= 0}
          onClick={() => onSelect(series[position - 1].month)}
        >
          <ChevronLeftIcon />
        </Button>
        <div role="status" className="min-w-0 flex-1 text-center">
          <CardTitle className="text-muted-foreground text-sm font-normal">
            {pointTitle(selected.month, isCurrent)}
          </CardTitle>
          <p className="text-[clamp(1.2rem,8cqi,1.8rem)] font-semibold whitespace-nowrap tabular-nums">
            {formatWholeEuros(selected.netWorthCents)}
          </p>
        </div>
        <Button
          variant="secondary"
          ghost
          iconOnly
          aria-label="Mois suivant"
          disabled={position >= series.length - 1}
          onClick={() => onSelect(series[position + 1].month)}
        >
          <ChevronRightIcon />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Deltas deltas={netWorthDeltas(months, selected.month)} />
        {coverage.dataUntil !== null && (
          <p className="text-muted-foreground text-xs">
            Données jusqu’au {formatShortDay(coverage.dataUntil)}
          </p>
        )}
        {/* Three labels on a 320px phone: sized on the row's width. */}
        <div className="@container">
          <SegmentedControl
            fullWidth
            aria-label="Période du graphique"
            value={period}
            onValueChange={onPeriodChange}
          >
            {NET_WORTH_PERIODS.map((item) => (
              <SegmentedControlItem
                key={item}
                value={item}
                className="px-1.5 text-[min(0.875rem,7cqi)]"
              >
                {NET_WORTH_PERIOD_LABELS[item]}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
        {series.length < 2 ? (
          <EmptyState
            variant="inline"
            icon={<LineChartIcon />}
            title="Un seul mois connu pour l’instant"
            description="La courbe apparaîtra avec un deuxième mois : importez un autre relevé ou mettez à jour la valeur de vos placements."
            actions={
              <Button asChild size="sm" outline variant="secondary">
                <Link to={ROUTES.import}>Importer un relevé</Link>
              </Button>
            }
          />
        ) : (
          <LineChart
            data={series}
            index="month"
            indexLabel="Mois"
            indexScale="time"
            config={CONFIG}
            height={CHART_HEIGHT}
            valueFormatter={formatWholeEuros}
            tooltipIndexFormatter={formatMonthLong}
            label={`Patrimoine net en fin de mois, de ${formatMonthLong(first)} à ${formatMonthLong(last)}`}
            dataTable="details"
            selectedIndex={selected.month}
            onSelectIndex={onSelect}
          />
        )}
      </CardContent>
    </Card>
  )
}

function PageSkeleton() {
  return (
    <div
      className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
      aria-busy="true"
      aria-label="Chargement"
    >
      <Skeleton className="h-[30rem] rounded-xl" />
      <Skeleton className="h-80 rounded-xl" />
    </div>
  )
}

interface NetWorthPageProps {
  period: NetWorthPeriod
  onPeriodChange: (period: NetWorthPeriod) => void
}

/**
 * Net worth over time: a chart of the month-end net worth (6 months, 12
 * months or all, up to five years) where any month end can be selected, its
 * changes, and its breakdown by account type with a link to each account.
 * The series stops at the month the data stops in, so a month not imported
 * yet never shows as a flat point.
 */
export function NetWorthPage({ period, onPeriodChange }: NetWorthPageProps) {
  const overview = useQuery(dashboardOverviewQuery())
  const history = useQuery(dashboardHistoryQuery(NET_WORTH_HISTORY_MONTHS))
  const [selectedMonth, setSelectedMonth] = useState<string>()

  const months = history.data?.months
  const coverage = overview.data?.period
  const series =
    months && coverage ? netWorthSeries(months, coverage.month, period) : []
  const selected =
    series.find((point) => point.month === selectedMonth) ?? series.at(-1)

  const failed =
    (overview.isError && !overview.data) || (history.isError && !history.data)

  return (
    <div className="@container space-y-6">
      <div className="space-y-2">
        <Link
          to={ROUTES.dashboard}
          className="text-muted-foreground hover:text-foreground relative inline-flex items-center gap-1 text-sm pointer-coarse:touch-hitbox"
        >
          <ArrowLeftIcon aria-hidden className="size-4" />
          Tableau de bord
        </Link>
        <PageHeader
          title="Patrimoine net"
          description="La somme de vos comptes, mois par mois."
        />
      </div>

      {failed ? (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger le patrimoine.</AlertTitle>
          <AlertDescription>
            <Button
              outline
              variant="secondary"
              size="sm"
              onClick={() => {
                void overview.refetch()
                void history.refetch()
              }}
            >
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      ) : !overview.data || !months || !coverage ? (
        <PageSkeleton />
      ) : !selected ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LandmarkIcon />
            </EmptyMedia>
            <EmptyTitle>Pas encore de solde connu</EmptyTitle>
            <EmptyDescription>
              Importez un relevé ou saisissez la valeur de vos placements :
              l’évolution de votre patrimoine s’affichera ici.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to={ROUTES.import}>Importer un relevé</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid items-start gap-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <HistoryCard
            series={series}
            months={months}
            selected={selected}
            onSelect={setSelectedMonth}
            period={period}
            onPeriodChange={onPeriodChange}
            coverage={coverage}
          />
          <Breakdown
            point={selected}
            title={pointTitle(
              selected.month,
              selected.month === currentMonth(),
            )}
            accounts={overview.data.accounts}
          />
        </div>
      )}
    </div>
  )
}
