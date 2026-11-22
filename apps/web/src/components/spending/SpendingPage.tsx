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
  formatWholeEuros,
  SegmentedControl,
  SegmentedControlItem,
  Skeleton,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowDownUpIcon,
  ArrowLeftRightIcon,
  BanknoteIcon,
  ChartPieIcon,
  ChevronRightIcon,
  FileUpIcon,
  PiggyBankIcon,
  ReceiptEuroIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
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
import type {
  SpendingByCategoryDto,
  SpendingKind,
  SpendingTrendSeriesDto,
  TransactionKind,
} from '#/api/types.gen'
import { comparedWithText, comparisonCaption } from './rows'
import type { Comparison } from './rows'
import { AVERAGE_MONTHS, compactSearch, UNCATEGORIZED } from './search'
import type { SpendingSearch } from './search'
import { SpendingDonut } from './SpendingDonut'
import { SpendingFilters } from './SpendingFilters'
import { ComparisonBars, ComparisonBarsSkeleton } from './ComparisonBars'
import {
  KIND_COLOR,
  KIND_LABEL,
  kindOf,
  NOTHING,
  RANKING_TITLE,
  viewOf,
} from './kinds'
import { MonthFlow, PANEL_ID, tabId } from './MonthFlow'
import type { MonthParts } from './MonthFlow'
import { SpendingTrend } from './SpendingTrend'
import type { TrendChip } from './SpendingTrend'
import { scrollAppTo } from '#/components/app-shell/app-scroll'

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

const ADD_ACTIONS: Record<TransactionKind, { label: string; icon: ReactNode }> =
  {
    expense: { label: 'Ajouter une dépense', icon: <ReceiptEuroIcon /> },
    income: { label: 'Ajouter un revenu', icon: <BanknoteIcon /> },
    transfer: { label: 'Ajouter un virement', icon: <ArrowDownUpIcon /> },
  }

/**
 * The page's « ⋮ » (#386): add an operation here, where they are read, the
 * part shown's first (a transfer for Épargne, #410), and Opérations, its
 * sub-page (#393), on the month shown.
 */
function pageActions({
  kind,
  add,
  reviewCount,
  openOperations,
}: {
  kind: SpendingKind
  add: (kind: TransactionKind) => void
  reviewCount: number | null | undefined
  openOperations: () => void
}) {
  const primary: TransactionKind = kind === 'savings' ? 'transfer' : kind
  const order: TransactionKind[] = [
    primary,
    ...(['expense', 'income', 'transfer'] as const).filter(
      (k) => k !== primary,
    ),
  ]
  return [
    ...order.map((k) => ({
      ...ADD_ACTIONS[k],
      primary: k === primary,
      onSelect: () => add(k),
    })),
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
      onSelect: openOperations,
    },
  ]
}

/** What the part's figures leave out or still expect, in one short line. */
function partNotes(data: SpendingByCategoryDto) {
  if (data.kind === 'savings') {
    return 'Virements vers vos livrets et placements, retraits déduits : ni revenu, ni dépense'
  }
  const expense = data.kind === 'expense'
  const parts = ['Virements exclus']
  if (expense && data.expectedCents > 0) {
    parts.push(
      `${formatWholeEuros(data.expectedCents)} d’abonnements et charges fixes encore attendus`,
    )
  }
  return parts.join(' · ')
}

/**
 * Mouvements (#410, the owner's « B. Le mois en tête »): the month's
 * Revenus, Dépenses and Épargne as three tiles that are also the tabs (`?vue=`),
 * with the flow bar of where the income went; below, the part chosen as
 * Dépenses always showed itself: comparisons, donut, ranked list with
 * month-over-month and average comparisons and drill-down to the
 * operations, the trend of the last 12 months. Transfers to savings and
 * investments are Épargne only, never income or expense.
 */
export function SpendingPage({ search, onSearchChange }: SpendingPageProps) {
  const today = currentMonth()
  const includeOneOffs = search.oneOffs === true

  const kind = kindOf(search.vue)
  // Without a month in the URL, the API picks it: the current month when it
  // has data, else the month the data stops in.
  const filters = useMemo<ByCategoryFilters>(
    () => ({
      ...(search.month ? { month: search.month } : {}),
      includeOneOffs,
      averageMonths: AVERAGE_MONTHS,
      ...(search.account ? { accountId: search.account } : {}),
    }),
    [search.month, includeOneOffs, search.account],
  )
  const trendBase = useMemo<TrendFilters>(
    () => ({
      ...(kind === 'expense' ? {} : { kind }),
      ...(search.month ? { month: search.month } : {}),
      months: TREND_MONTHS,
      includeOneOffs,
      ...(search.account ? { accountId: search.account } : {}),
    }),
    [kind, search.month, includeOneOffs, search.account],
  )
  const trendFilters = useMemo<TrendFilters>(() => {
    if (search.trend === UNCATEGORIZED) {
      return { ...trendBase, uncategorized: true }
    }
    if (search.trend) return { ...trendBase, categoryId: search.trend }
    return trendBase
  }, [trendBase, search.trend])

  const accounts = useQuery(accountsQuery)
  // The three parts of the month (the tiles), the one shown in detail.
  const expense = useQuery(spendingByCategoryQuery(filters))
  const income = useQuery(
    spendingByCategoryQuery({ ...filters, kind: 'income' }),
  )
  const savings = useQuery(
    spendingByCategoryQuery({ ...filters, kind: 'savings' }),
  )
  const byCategory =
    kind === 'income' ? income : kind === 'savings' ? savings : expense
  const parts: MonthParts = {
    expense: expense.data,
    income: income.data,
    savings: savings.data,
  }
  // Unfiltered trend for the chips; the same query as the chart's when no
  // row is selected.
  const totals = useQuery(spendingTrendQuery(trendBase))
  const trend = useQuery(spendingTrendQuery(trendFilters))

  // The chips: the categories that weigh most over the months shown, then
  // the one in the URL when it is not among them.
  const trendChips = useMemo<TrendChip[]>(() => {
    const chips: TrendChip[] = []
    const add = (series: SpendingTrendSeriesDto) => {
      const value = series.categoryId ?? series.accountId ?? UNCATEGORIZED
      if (chips.some((chip) => chip.value === value)) return
      chips.push({
        value,
        name: seriesLabel(series, kind),
        categoryId: series.categoryId,
        accountId: series.accountId,
        icon: series.icon,
        color: series.color,
      })
    }
    for (const series of totals.data?.series ?? []) {
      if (series.type !== 'other') add(series)
    }
    const alone = trend.data?.series.at(0)
    if (search.trend && alone && alone.type !== 'other') {
      const value = alone.categoryId ?? alone.accountId ?? UNCATEGORIZED
      if (value === search.trend) add(alone)
    }
    return chips
  }, [totals.data, trend.data, search.trend, kind])

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
  const month = search.month ?? data?.month ?? expense.data?.month ?? today
  const monthLabel = monthName(month)
  const comparison: Comparison = search.cmp === 'avg' ? 'average' : 'previous'
  const caption = data ? comparisonCaption(data, comparison) : ''
  const stopsBefore =
    data?.period.status === 'empty' ? data.period.dataUntil : null

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Mouvements"
        description="Ce qui entre, ce qui sort et ce que vous mettez de côté."
        actions={pageActions({
          kind,
          add: setAdding,
          reviewCount,
          openOperations: () =>
            void navigate({
              to: ROUTES.transactions,
              search: search.month ? { month: search.month } : {},
            }),
        })}
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
        accounts={(accounts.data ?? []).filter(isTransactional)}
      />

      <MonthFlow
        parts={parts}
        selected={kind}
        onSelect={(next) => set({ vue: viewOf(next), trend: undefined })}
      />

      <section
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={tabId(kind)}
        className="space-y-6"
      >
        <h2 className="flex items-center gap-2 px-1 text-lg font-semibold tracking-tight">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ background: KIND_COLOR[kind] }}
          />
          {KIND_LABEL[kind]}
        </h2>

        {byCategory.isError && (
          <Alert variant="destructive">
            <AlertTitle>
              Impossible de charger{' '}
              {kind === 'expense'
                ? 'les dépenses'
                : kind === 'income'
                  ? 'les revenus'
                  : 'l’épargne'}
              .
            </AlertTitle>
            <AlertDescription>
              <Button
                size="sm"
                outline
                onClick={() => void byCategory.refetch()}
              >
                Réessayer
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {byCategory.isPending && (
          <>
            <ComparisonBarsSkeleton />
            <div
              className="grid gap-4 @3xl:grid-cols-2"
              aria-busy="true"
              aria-label="Chargement des mouvements"
            >
              <Skeleton className="h-80 rounded-xl" />
              <Skeleton className="h-80 rounded-xl" />
            </div>
          </>
        )}

        {data && data.categories.length === 0 && (
          <EmptyState
            icon={<ChartPieIcon />}
            title={`${NOTHING[kind]} en ${formatMonth(month).toLowerCase()}`}
            description={
              data.oneOffCents > 0 && !includeOneOffs
                ? `Seules des opérations exceptionnelles (${formatEuros(data.oneOffCents)}) ont eu lieu ce mois-ci.`
                : stopsBefore
                  ? `Vos données s’arrêtent au ${formatShortDay(stopsBefore, today.slice(0, 4))} : importez un relevé plus récent ou changez de mois.`
                  : kind === 'savings'
                    ? 'Aucun virement vers vos livrets et placements ce mois-ci.'
                    : 'Importez un relevé de compte ou changez de mois.'
            }
            actions={
              data.oneOffCents > 0 && !includeOneOffs ? (
                <Button
                  outline
                  variant="secondary"
                  onClick={() => set({ oneOffs: true })}
                >
                  {kind === 'income'
                    ? 'Inclure les revenus exceptionnels'
                    : 'Inclure les dépenses exceptionnelles'}
                </Button>
              ) : kind === 'savings' && !stopsBefore ? undefined : (
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
                      <FileUpIcon aria-hidden />
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
              <ComparisonBars
                data={data}
                accountId={search.account}
                onIncludeOneOffsChange={(on) =>
                  set({ oneOffs: on ? true : undefined })
                }
              />
              <p className="text-muted-foreground text-xs" data-slot="notes">
                {partNotes(data)}
              </p>
              {kind === 'savings' && (
                // What is held and how it grew: the Épargne page (#407).
                <Button asChild variant="secondary" ghost size="sm">
                  <Link to={ROUTES.savings}>
                    <PiggyBankIcon aria-hidden />
                    Ce que vous avez : Épargne
                    <ChevronRightIcon aria-hidden />
                  </Link>
                </Button>
              )}
            </div>

            {/* Side by side, each card keeps its own height: the donut stays in
                view (sticky) beside the longer list instead of being
                stretched to its height (#210). */}
            <div className="grid items-start gap-4 @3xl:grid-cols-2">
              <Section title="Répartition" className="@3xl:sticky @3xl:top-4">
                <SpendingDonut data={data} monthLabel={monthLabel} />
              </Section>
              <Section title={RANKING_TITLE[kind]}>
                {/* The comparison read first: the control across the card
                    (owner's choice), then what it compares with. */}
                <div className="@container mb-2">
                  <div className="flex flex-col gap-1.5">
                    <SegmentedControl
                      aria-label={`Comparer chaque ${kind === 'savings' ? 'compte' : 'catégorie'} avec`}
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
                  kind={kind}
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
                  scrollAppTo({ top: 0, behavior: 'smooth' })
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
      </section>
    </div>
  )
}
