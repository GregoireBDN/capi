import { formatPercent, formatWholeEuros, StatCard } from '@finances/ui'
import type { SavingsOverviewDto } from '#/api/types.gen'
import { formatPoints } from '#/components/dashboard/labels'
import { formatCents } from '#/lib/money'

/** Window of the "Moyenne" tile, in full months. */
export const AVERAGE_TILE_MONTHS = 6

/**
 * Headline figures: this month's net savings and rate (vs last month, the
 * dashboard's figures), the 6-month average and the savings stock (savings
 * accounts + investments) with the investments' gain. Whole euros so two
 * tiles fit side by side on a phone.
 */
export function SavingsKpis({ overview }: { overview: SavingsOverviewDto }) {
  const { months, averages, stock, projectionAverageCents } = overview
  const current = months.at(-1)!
  const previous = months.at(-2)
  const average = averages.find((a) => a.months === AVERAGE_TILE_MONTHS)

  return (
    <section aria-label="Chiffres clés" className="space-y-2">
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        <StatCard
          label="Épargne du mois"
          value={current.netCents}
          valueFormatter={formatWholeEuros}
          previousValue={previous?.netCents}
          deltaDisplay="value"
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
            current.savingsRate === null
              ? undefined
              : (previous?.savingsRate ?? undefined)
          }
          deltaDisplay="value"
          deltaFormatter={formatPoints}
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
