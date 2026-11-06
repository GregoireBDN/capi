import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  formatEuros,
  Skeleton,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChartPieIcon } from 'lucide-react'
import { useMemo } from 'react'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { currentMonth, formatMonth } from '#/lib/calendar'
import { accountsQuery, categoriesQuery, isTransactional } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { CategoryRanking } from './CategoryRanking'
import { monthName } from './labels'
import { spendingByCategoryQuery, spendingTrendQuery } from './queries'
import type { ByCategoryFilters, TrendFilters } from './queries'
import { compactSearch, DEFAULT_AVERAGE_PERIOD, UNCATEGORIZED } from './search'
import type { SpendingSearch } from './search'
import { SpendingDonut } from './SpendingDonut'
import { SpendingFilters } from './SpendingFilters'
import { SpendingKpis, SpendingKpisSkeleton } from './SpendingKpis'
import { SpendingTrend } from './SpendingTrend'
import type { TrendCategoryOption } from './SpendingTrend'

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
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
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
  const month = search.month ?? today
  const includeOneOffs = search.oneOffs === true

  const filters = useMemo<ByCategoryFilters>(
    () => ({
      month,
      includeOneOffs,
      averageMonths: search.avg ?? DEFAULT_AVERAGE_PERIOD,
      ...(search.account ? { accountId: search.account } : {}),
    }),
    [month, includeOneOffs, search.avg, search.account],
  )
  const trendBase = useMemo<TrendFilters>(
    () => ({
      month,
      months: TREND_MONTHS,
      includeOneOffs,
      ...(search.account ? { accountId: search.account } : {}),
    }),
    [month, includeOneOffs, search.account],
  )
  const trendFilters = useMemo<TrendFilters>(() => {
    if (search.trend === UNCATEGORIZED) {
      return { ...trendBase, uncategorized: true }
    }
    if (search.trend) return { ...trendBase, categoryId: search.trend }
    return trendBase
  }, [trendBase, search.trend])

  const accounts = useQuery(accountsQuery)
  const categories = useQuery(categoriesQuery)
  const byCategory = useQuery(spendingByCategoryQuery(filters))
  // Unfiltered trend for the KPI sparkline; the same query as the chart's
  // when no category is selected.
  const totals = useQuery(spendingTrendQuery(trendBase))
  const trend = useQuery(spendingTrendQuery(trendFilters))

  const trendCategories = useMemo<TrendCategoryOption[]>(() => {
    const options = new Map<string, string>()
    for (const category of categories.data ?? []) {
      if (category.kind === 'expense') options.set(category.id, category.name)
    }
    for (const item of byCategory.data?.categories ?? []) {
      if (item.categoryId && item.name) options.set(item.categoryId, item.name)
    }
    return [...options]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }, [categories.data, byCategory.data])

  const set = (patch: Partial<SpendingSearch>) => {
    onSearchChange(compactSearch({ ...search, ...patch }))
  }

  const data = byCategory.data
  const monthLabel = monthName(month)
  const previousLabel = data ? monthName(data.previousMonth, data.month) : ''

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Dépenses"
        description="Où part votre argent, catégorie par catégorie."
      />

      <SpendingFilters
        search={search}
        onSearchChange={onSearchChange}
        month={month}
        today={today}
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
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChartPieIcon />
            </EmptyMedia>
            <EmptyTitle>
              Aucune dépense en {formatMonth(month).toLowerCase()}
            </EmptyTitle>
            <EmptyDescription>
              {data.oneOffCents > 0 && !includeOneOffs
                ? `Seules des dépenses ponctuelles (${formatEuros(data.oneOffCents)}) ont été faites ce mois-ci.`
                : 'Importez un relevé de compte ou changez de mois.'}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {data.oneOffCents > 0 && !includeOneOffs ? (
              <Button
                outline
                variant="secondary"
                onClick={() => set({ oneOffs: true })}
              >
                Inclure les dépenses ponctuelles
              </Button>
            ) : (
              <Button asChild outline variant="secondary">
                <Link to={ROUTES.import}>Importer un relevé</Link>
              </Button>
            )}
          </EmptyContent>
        </Empty>
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
            </p>
          </div>

          <div className="grid gap-4 @3xl:grid-cols-2">
            <Section title="Répartition">
              <SpendingDonut data={data} monthLabel={monthLabel} />
            </Section>
            <Section title="Par catégorie">
              <CategoryRanking
                categories={data.categories}
                month={month}
                previousLabel={previousLabel}
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
              categories={trendCategories}
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
