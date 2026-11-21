import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  formatEuros,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeftRightIcon,
  BanknoteIcon,
  ChartPieIcon,
  ReceiptEuroIcon,
  UploadIcon,
  ArrowDownUpIcon,
} from 'lucide-react'
import { NearestMonthButton } from '#/components/month/NearestMonthButton'
import { useMemo, useState } from 'react'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { currentMonth, formatMonth } from '#/lib/calendar'
import { formatShortDay } from '#/lib/period'
import { accountsQuery, isTransactional } from '#/lib/queries'
import { plural } from '#/lib/plural'
import { useKnownReviewCount } from '#/lib/review-count'
import { ROUTES } from '#/lib/routes'
import { CategoryRanking } from './CategoryRanking'
import { monthName, seriesLabel } from './labels'
import { spendingByCategoryQuery, spendingTrendQuery } from './queries'
import type { ByCategoryFilters, TrendFilters } from './queries'
import type { SpendingTrendSeriesDto, TransactionKind } from '#/api/types.gen'
import { comparedWithText, comparisonCaption } from './rows'
import type { Comparison } from './rows'
import { compactSearch, DEFAULT_AVERAGE_PERIOD, UNCATEGORIZED } from './search'
import type { SpendingSearch } from './search'
import { SpendingDonut } from './SpendingDonut'
import { SpendingFilters } from './SpendingFilters'
import { SpendingKpis, SpendingKpisSkeleton } from './SpendingKpis'
import { SpendingTrend } from './SpendingTrend'
import type { TrendChip } from './SpendingTrend'

/**
 * Comparison segments: both labels fit a 320px phone, sized on the row
 * (the `@container` around the control).
 */
const FIT = 'px-2 text-[min(0.875rem,6.2cqi)]'

/** Months shown by the trend, ending with the selected month. */
export const TREND_MONTHS = 12

interface SpendingPageProps {
  /** Filters from the URL search params. */
  search: SpendingSearch
  /** Writes the filters back to the URL. */
  onSearchChange: (next: SpendingSearch) => void
}

function Section({
  title,
  action,
  className,
  children,
}: {
  title: string
  /** Control beside the title (wraps under it on a narrow card). */
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <Card size="sm" className={cn('min-w-0', className)}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/**
 * Where the money goes: the month's spending by category (donut, ranked
 * list with month-over-month and average comparisons, drill-down to the
 * transactions) and the trend of the last 12 months.
 */
export function SpendingPage({ search, onSearchChange }: SpendingPageProps) {
  const today = currentMonth()
  const includeOneOffs = search.oneOffs === true

  // Without a month in the URL, the API picks it: the current month when it
  // has data, else the month the data stops in.
  const filters = useMemo<ByCategoryFilters>(
    () => ({
      ...(search.month ? { month: search.month } : {}),
      includeOneOffs,
      averageMonths: search.avg ?? DEFAULT_AVERAGE_PERIOD,
      ...(search.account ? { accountId: search.account } : {}),
    }),
    [search.month, includeOneOffs, search.avg, search.account],
  )
  const trendBase = useMemo<TrendFilters>(
    () => ({
      ...(search.month ? { month: search.month } : {}),
      months: TREND_MONTHS,
      includeOneOffs,
      ...(search.account ? { accountId: search.account } : {}),
    }),
    [search.month, includeOneOffs, search.account],
  )
  const trendFilters = useMemo<TrendFilters>(() => {
    if (search.trend === UNCATEGORIZED) {
      return { ...trendBase, uncategorized: true }
    }
    if (search.trend) return { ...trendBase, categoryId: search.trend }
    return trendBase
  }, [trendBase, search.trend])

  const accounts = useQuery(accountsQuery)
  const byCategory = useQuery(spendingByCategoryQuery(filters))
  // Unfiltered trend for the KPI sparkline; the same query as the chart's
  // when no category is selected.
  const totals = useQuery(spendingTrendQuery(trendBase))
  const trend = useQuery(spendingTrendQuery(trendFilters))

  // The chips: the categories that weigh most over the months shown, then
  // the one in the URL when it is not among them.
  const trendChips = useMemo<TrendChip[]>(() => {
    const chips: TrendChip[] = []
    const add = (series: SpendingTrendSeriesDto) => {
      const value = series.categoryId ?? UNCATEGORIZED
      if (chips.some((chip) => chip.value === value)) return
      chips.push({
        value,
        name: seriesLabel(series),
        categoryId: series.categoryId,
        icon: series.icon,
        color: series.color,
      })
    }
    for (const series of totals.data?.series ?? []) {
      if (series.type !== 'other') add(series)
    }
    const alone = trend.data?.series.at(0)
    if (search.trend && alone && alone.type !== 'other') {
      const value = alone.categoryId ?? UNCATEGORIZED
      if (value === search.trend) add(alone)
    }
    return chips
  }, [totals.data, trend.data, search.trend])

  // The kind is chosen before adding (#398).
  const [adding, setAdding] = useState<TransactionKind | null>(null)
  const navigate = useNavigate()
  // The transactions to review, on « Voir les opérations » and its « ⋮ »
  // (#393): the menu is the way to Opérations from here.
  const reviewCount = useKnownReviewCount()

  const set = (patch: Partial<SpendingSearch>) => {
    onSearchChange(compactSearch({ ...search, ...patch }))
  }

  const data = byCategory.data
  const month = search.month ?? data?.month ?? today
  const monthLabel = monthName(month)
  const comparison: Comparison = search.cmp === 'avg' ? 'average' : 'previous'
  const caption = data ? comparisonCaption(data, comparison) : ''
  const stopsBefore =
    data?.period.status === 'empty' ? data.period.dataUntil : null

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Dépenses"
        description="Où part votre argent, catégorie par catégorie."
        // The page's « ⋮ » (#386): add an expense here, where they are read,
        // and Opérations, its sub-page (#393), on the month shown.
        actions={[
          {
            label: 'Ajouter une dépense',
            icon: <ReceiptEuroIcon />,
            primary: true,
            onSelect: () => setAdding('expense'),
          },
          {
            label: 'Ajouter un revenu',
            icon: <BanknoteIcon />,
            onSelect: () => setAdding('income'),
          },
          {
            label: 'Ajouter un virement',
            icon: <ArrowDownUpIcon />,
            onSelect: () => setAdding('transfer'),
          },
          {
            label: 'Voir les opérations',
            icon: <ArrowLeftRightIcon />,
            count: reviewCount
              ? {
                  value: reviewCount,
                  label: plural(
                    reviewCount,
                    'opération à revoir',
                    'opérations à revoir',
                  ),
                }
              : null,
            onSelect: () =>
              void navigate({
                to: ROUTES.transactions,
                search: search.month ? { month: search.month } : {},
              }),
          },
        ]}
      />
      <ManualTransactionSheet
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null)
        }}
        initialKind={adding ?? 'expense'}
      />

      <SpendingFilters
        search={search}
        onSearchChange={onSearchChange}
        month={month}
        defaultMonth={data?.period.defaultMonth ?? today}
        period={data?.period}
        accounts={(accounts.data ?? []).filter(isTransactional)}
      />

      {byCategory.isError && (
        <Alert variant="destructive">
          <AlertTitle>Impossible de charger les dépenses.</AlertTitle>
          <AlertDescription>
            <Button size="sm" outline onClick={() => void byCategory.refetch()}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {byCategory.isPending && (
        <>
          <SpendingKpisSkeleton />
          <div
            className="grid gap-4 @3xl:grid-cols-2"
            aria-busy="true"
            aria-label="Chargement des dépenses"
          >
            <Skeleton className="h-80 rounded-xl" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
        </>
      )}

      {data && data.categories.length === 0 && (
        <EmptyState
          icon={<ChartPieIcon />}
          title={`Aucune dépense en ${formatMonth(month).toLowerCase()}`}
          description={
            data.oneOffCents > 0 && !includeOneOffs
              ? `Seules des dépenses ponctuelles (${formatEuros(data.oneOffCents)}) ont été faites ce mois-ci.`
              : stopsBefore
                ? `Vos données s’arrêtent au ${formatShortDay(stopsBefore, today.slice(0, 4))} : importez un relevé plus récent ou changez de mois.`
                : 'Importez un relevé de compte ou changez de mois.'
          }
          actions={
            data.oneOffCents > 0 && !includeOneOffs ? (
              <Button
                outline
                variant="secondary"
                onClick={() => set({ oneOffs: true })}
              >
                Inclure les dépenses ponctuelles
              </Button>
            ) : (
              <>
                <NearestMonthButton
                  month={month}
                  onMonthChange={(target) =>
                    set({
                      month:
                        target === data.period.defaultMonth
                          ? undefined
                          : target,
                    })
                  }
                />
                <Button asChild outline variant="secondary">
                  <Link to={ROUTES.import}>
                    <UploadIcon aria-hidden />
                    Importer un relevé
                  </Link>
                </Button>
              </>
            )
          }
        />
      )}

      {data && data.categories.length > 0 && (
        <>
          <div className="space-y-1.5">
            <SpendingKpis data={data} trend={totals.data?.totalsCents} />
            <p className="text-muted-foreground text-xs">
              Virements entre vos comptes exclus.{' '}
              {data.oneOffCents > 0 &&
                (includeOneOffs
                  ? `Dont ${formatEuros(data.oneOffCents)} de dépenses ponctuelles.`
                  : `Dépenses ponctuelles exclues : ${formatEuros(data.oneOffCents)}.`)}
              {data.expectedCents > 0 &&
                ` Abonnements et charges fixes attendus d’ici la fin du mois : ${formatEuros(data.expectedCents)}, non comptés.`}
            </p>
          </div>

          {/* Side by side, each card keeps its own height: the donut stays in
              view (sticky) beside the longer category list instead of being
              stretched to its height (#210). */}
          <div className="grid items-start gap-4 @3xl:grid-cols-2">
            <Section title="Répartition" className="@3xl:sticky @3xl:top-4">
              <SpendingDonut data={data} monthLabel={monthLabel} />
            </Section>
            <Section title="Par catégorie">
              {/* The comparison read first: the control across the card
                  (owner's choice), then what it compares with. */}
              <div className="@container mb-2">
                <div className="flex flex-col gap-1.5">
                  <SegmentedControl
                    aria-label="Comparer chaque catégorie avec"
                    fullWidth
                    value={comparison}
                    onValueChange={(next) =>
                      set({ cmp: next === 'average' ? 'avg' : undefined })
                    }
                  >
                    <SegmentedControlItem value="previous" className={FIT}>
                      Mois précédent
                    </SegmentedControlItem>
                    <SegmentedControlItem
                      value="average"
                      className={FIT}
                      disabled={data.averageMonths === 0}
                    >
                      Moyenne
                    </SegmentedControlItem>
                  </SegmentedControl>
                  <p
                    data-slot="comparison-caption"
                    className="text-muted-foreground text-xs"
                  >
                    {caption}
                  </p>
                </div>
              </div>
              <CategoryRanking
                categories={data.categories}
                month={month}
                comparison={comparison}
                comparedWith={comparedWithText(data, comparison)}
                accountId={search.account}
              />
            </Section>
          </div>
        </>
      )}

      {!byCategory.isError && (
        <Section title={`Tendance sur ${TREND_MONTHS} mois`}>
          {trend.isError ? (
            <p className="text-muted-foreground text-sm">
              Impossible de charger la tendance.{' '}
              <Button
                size="sm"
                variant="secondary"
                ghost
                onClick={() => void trend.refetch()}
              >
                Réessayer
              </Button>
            </p>
          ) : trend.data ? (
            <SpendingTrend
              data={trend.data}
              selected={search.trend}
              onSelectedChange={(next) => set({ trend: next })}
              chips={trendChips}
              month={month}
              onOpenMonth={(target) => {
                set({
                  month:
                    target === (data?.period.defaultMonth ?? today)
                      ? undefined
                      : target,
                })
                // The month's figures are at the top of the page.
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            />
          ) : (
            <Skeleton
              className="h-[260px] rounded-lg"
              aria-busy="true"
              aria-label="Chargement de la tendance"
            />
          )}
        </Section>
      )}
    </div>
  )
}
