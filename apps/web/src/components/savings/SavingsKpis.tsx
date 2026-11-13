import { formatPercent, formatWholeEuros, StatCard } from '@finances/ui'
import type { SavingsOverviewDto } from '#/api/types.gen'
import { formatPoints, savingsRateNote } from '#/components/dashboard/labels'
import { PeriodNote } from '#/components/PeriodNote'
import { formatCents } from '#/lib/money'
import { comparisonLabel, isComparable } from '#/lib/period'

/** Window of the "Moyenne" tile, in full months. */
export const AVERAGE_TILE_MONTHS = 6

/**
 * Headline figures: the month's net savings and rate (the dashboard's
 * figures: the current month when it has data, else the last month with
 * data; vs the same first days of the month before while it is in
 * progress), the 6-month average and the savings stock (savings accounts +
 * investments) with the investments' gain. Whole euros so two tiles fit
 * side by side on a phone.
 */
export function SavingsKpis({ overview }: { overview: SavingsOverviewDto }) {
  const {
    months,
    averages,
    stock,
    projectionAverageCents,
    period,
    current,
    previous,
  } = overview
  const comparable = isComparable(period)
  const vs = comparisonLabel(period, 'vs mois précédent')
  const average = averages.find((a) => a.months === AVERAGE_TILE_MONTHS)

  return (
    <section aria-label="Chiffres clés" className="space-y-2">
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        <StatCard
          label="Épargne du mois"
          value={current.netCents}
          valueFormatter={formatWholeEuros}
          previousValue={comparable ? previous.netCents : undefined}
          deltaDisplay="value"
          comparisonLabel={vs}
          note={comparable ? undefined : 'Pas encore de données'}
          trend={months.map((month) => month.netCents)}
          trendLabel={`Épargne nette par mois, sur ${months.length} mois`}
        />
        <StatCard
          label="Taux d’épargne"
          value={current.savingsRate ?? 0}
          valueFormatter={(ratio) =>
            current.savingsRate === null ? '—' : formatPercent(ratio)
          }
          previousValue={
            !comparable || current.savingsRate === null
              ? undefined
              : (previous.savingsRate ?? undefined)
          }
          deltaDisplay="value"
          deltaFormatter={formatPoints}
          comparisonLabel={vs}
          note={savingsRateNote(current, period) ?? undefined}
        />
        <StatCard
          label={`Moy. ${AVERAGE_TILE_MONTHS} mois`}
          value={average?.netCents ?? 0}
          valueFormatter={(cents) =>
            average?.netCents == null ? '—' : formatWholeEuros(cents)
          }
        />
        <StatCard
          label="Mis de côté"
          value={stock.totalCents}
          valueFormatter={formatWholeEuros}
          previousValue={
            stock.gainCents === null
              ? undefined
              : stock.totalCents - stock.gainCents
          }
          deltaDisplay="value"
          comparisonLabel="de plus-value"
        />
      </div>
      <PeriodNote period={period} className="px-1" />
      <p className="text-muted-foreground px-1 text-xs">
        {average && average.monthCount > 0 ? (
          <>
            Moyenne sur {average.monthCount} mois complet
            {average.monthCount > 1 ? 's' : ''}
            {projectionAverageCents !== null &&
              `, hors ponctuel : ${formatCents(projectionAverageCents)} par mois (base des projections)`}
            .{' '}
          </>
        ) : (
          'Pas encore de mois complet pour la moyenne. '
        )}
        Virements entre vos comptes exclus.
      </p>
    </section>
  )
}
