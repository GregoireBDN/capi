import {
  Card,
  formatEuros,
  formatSignedPercent,
  Skeleton,
  StatCard,
} from '@finances/ui'
import type { ReactNode } from 'react'
import type { SpendingByCategoryDto } from '#/api/types.gen'
import { Delta } from './Delta'
import { categoryLabel, monthName } from './labels'

/** KPI tile whose headline is a comparison rather than an amount. */
function ComparisonTile({
  label,
  children,
  detail,
}: {
  label: string
  children: ReactNode
  detail: ReactNode
}) {
  return (
    <Card
      size="sm"
      className="@container min-w-0 gap-2"
      data-slot="spending-kpi"
    >
      <p className="text-muted-foreground px-3 text-sm leading-tight">
        {label}
      </p>
      {/* Sized on the tile (container units): amounts never break. */}
      <div className="min-w-0 px-3 text-[clamp(0.75rem,12cqi,1.25rem)] leading-tight font-semibold">
        {children}
      </div>
      <p className="text-muted-foreground px-3 text-xs">{detail}</p>
    </Card>
  )
}

/**
 * Headline deltas: sized on the tile with their arrow and gap (em), never
 * broken, so "-123 456,78 €" fits two tiles abreast on a 360px phone.
 */
const TILE_DELTA = {
  className: 'gap-[0.25em] text-[clamp(0.55rem,10cqi,1.25rem)]',
  iconClassName: 'size-[0.8em]',
} as const

/** `+12,5 %` of `previous`, or nothing when there is no base to compare. */
function percentOf(delta: number, previous: number | null): string {
  return previous && previous > 0
    ? ` (${formatSignedPercent(delta / previous)})`
    : ''
}

export function SpendingKpisSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 @2xl:grid-cols-4"
      aria-busy="true"
      aria-label="Chargement des indicateurs"
    >
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  )
}

/**
 * Month at a glance: total spent (with its trend), change vs the previous
 * month and vs the average, and the category that grew the most.
 */
export function SpendingKpis({
  data,
  trend,
}: {
  data: SpendingByCategoryDto
  /** Monthly totals ending with the shown month, for the sparkline. */
  trend?: readonly number[]
}) {
  const previous = monthName(data.previousMonth, data.month)
  const vsPrevious = data.totalCents - data.previousTotalCents
  const vsAverage =
    data.averageTotalCents === null
      ? null
      : data.totalCents - data.averageTotalCents
  const biggest = data.categories.reduce<
    SpendingByCategoryDto['categories'][number] | null
  >(
    (best, item) =>
      item.deltaCents > 0 && (!best || item.deltaCents > best.deltaCents)
        ? item
        : best,
    null,
  )

  return (
    <section aria-label="Indicateurs du mois">
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 @2xl:grid-cols-4">
        <StatCard
          label="Dépensé"
          value={data.totalCents}
          trend={trend}
          trendLabel={
            trend ? `Dépenses des ${trend.length} derniers mois` : undefined
          }
        />
        <ComparisonTile
          label={`vs ${previous}`}
          detail={`${formatEuros(data.previousTotalCents)} en ${previous}${percentOf(vsPrevious, data.previousTotalCents)}`}
        >
          <Delta cents={vsPrevious} {...TILE_DELTA} />
        </ComparisonTile>
        <ComparisonTile
          label="vs moyenne"
          detail={
            data.averageTotalCents === null
              ? 'Pas encore d’historique'
              : `${formatEuros(data.averageTotalCents)} en moyenne sur ${data.averageMonths} mois${percentOf(vsAverage!, data.averageTotalCents)}`
          }
        >
          {vsAverage === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <Delta cents={vsAverage} {...TILE_DELTA} />
          )}
        </ComparisonTile>
        <ComparisonTile
          label="Plus forte hausse"
          detail={
            biggest ? (
              <Delta cents={biggest.deltaCents} />
            ) : (
              `Aucune catégorie en hausse vs ${previous}`
            )
          }
        >
          <span className="block truncate">
            {biggest ? categoryLabel(biggest) : 'Aucune'}
          </span>
        </ComparisonTile>
      </div>
    </section>
  )
}
