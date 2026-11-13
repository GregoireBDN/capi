import { formatPercent, formatWholeEuros, StatCard } from '@finances/ui'
import { LandmarkIcon } from 'lucide-react'
import type { DashboardOverviewDto, HistoryMonthDto } from '#/api/types.gen'
import { PeriodNote } from '#/components/PeriodNote'
import { formatCents } from '#/lib/money'
import { comparisonLabel, isComparable } from '#/lib/period'
import { formatPoints, savingsRateNote } from './labels'

interface KpiTilesProps {
  overview: DashboardOverviewDto
  /** Monthly history, oldest first, for the sparklines (absent while loading). */
  history?: HistoryMonthDto[]
}

/** A sparkline needs two points; months before any data are left out. */
function trendOf(values: (number | null)[] | undefined): number[] | undefined {
  const known = values?.filter((value): value is number => value !== null)
  return known && known.length > 1 ? known : undefined
}

/**
 * Headline figures: net worth (vs the end of last month), then the month's
 * income, expenses, savings and savings rate (vs the month before, over the
 * same first days while the month is in progress; not compared at all
 * while it has no data). Expenses are shown as positive amounts where a
 * rise is unfavourable; transfers are never part of any of them. The month
 * tiles use short labels (the month switcher names the month) and whole
 * euros so two fit side by side on a phone with the app's large root font.
 */
export function KpiTiles({ overview, history }: KpiTilesProps) {
  const { netWorth, period, current, previous } = overview
  const comparable = isComparable(period)
  const vs = comparisonLabel(period, 'vs mois précédent')
  const noData = comparable ? undefined : 'Pas encore de données'
  // Nothing imported since the end of last month: an unchanged net worth
  // says nothing, so it is not shown as a 0 € change.
  const staleNetWorth =
    netWorth.previousMonthEndCents === netWorth.totalCents &&
    (period.dataUntil === null || period.dataUntil <= netWorth.previousMonthEnd)

  return (
    <section aria-label="Chiffres clés" className="space-y-2">
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        <StatCard
          className="col-span-2 @2xl:col-span-4"
          label="Patrimoine net"
          icon={<LandmarkIcon />}
          value={netWorth.totalCents}
          previousValue={
            staleNetWorth
              ? undefined
              : (netWorth.previousMonthEndCents ?? undefined)
          }
          deltaDisplay="value"
          comparisonLabel="depuis la fin du mois dernier"
          note={
            staleNetWorth
              ? 'Rien d’importé depuis la fin du mois dernier'
              : undefined
          }
          trend={trendOf(history?.map((month) => month.netWorthCents))}
          trendLabel="Patrimoine net en fin de mois, sur 12 mois"
        />
        <StatCard
          label="Revenus"
          value={current.incomeCents}
          valueFormatter={formatWholeEuros}
          previousValue={comparable ? previous.incomeCents : undefined}
          comparisonLabel={vs}
          note={noData}
          trend={trendOf(history?.map((month) => month.incomeCents))}
          trendLabel="Revenus par mois, sur 12 mois"
        />
        <StatCard
          label="Dépenses"
          value={-current.expenseCents}
          valueFormatter={formatWholeEuros}
          previousValue={comparable ? -previous.expenseCents : undefined}
          comparisonLabel={vs}
          note={noData}
          increaseIsGood={false}
          trend={trendOf(history?.map((month) => -month.expenseCents))}
          trendLabel="Dépenses par mois, sur 12 mois"
        />
        <StatCard
          label="Épargne"
          value={current.netCents}
          valueFormatter={formatWholeEuros}
          previousValue={comparable ? previous.netCents : undefined}
          deltaDisplay="value"
          comparisonLabel={vs}
          note={noData}
          trend={trendOf(history?.map((month) => month.netCents))}
          trendLabel="Épargne nette par mois, sur 12 mois"
        />
        <StatCard
          label="% épargné"
          value={current.savingsRate ?? 0}
          valueFormatter={(ratio) =>
            current.savingsRate === null ? '—' : formatPercent(ratio)
          }
          previousValue={
            !comparable ||
            current.savingsRate === null ||
            previous.savingsRate === null
              ? undefined
              : previous.savingsRate
          }
          deltaDisplay="value"
          deltaFormatter={formatPoints}
          comparisonLabel={vs}
          note={savingsRateNote(current, period) ?? noData}
        />
      </div>
      <PeriodNote period={period} className="px-1" />
      <OneOffNote overview={overview} />
    </section>
  )
}

/** Says how much of the month's figures comes from one-off transactions. */
function OneOffNote({ overview }: { overview: DashboardOverviewDto }) {
  const { oneOffIncomeCents, oneOffExpenseCents } = overview.current
  const parts = [
    oneOffIncomeCents !== 0 && `revenus ${formatCents(oneOffIncomeCents)}`,
    oneOffExpenseCents !== 0 && `dépenses ${formatCents(-oneOffExpenseCents)}`,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return (
    <p className="text-muted-foreground px-1 text-xs">
      Dont ponctuel ce mois-ci : {parts.join(', ')}.
    </p>
  )
}
