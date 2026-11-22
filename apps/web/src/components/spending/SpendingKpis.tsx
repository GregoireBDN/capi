import { Card, formatEuros, formatSignedPercent, Skeleton } from '@finances/ui'
import type { ReactNode } from 'react'
import type { SpendingByCategoryDto } from '#/api/types.gen'
import { Delta } from './Delta'
import { INCREASE_IS_GOOD } from './kinds'
import { categoryLabel, comparedName } from './labels'
import { comparisonCaption } from './rows'

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
      className="grid grid-cols-1 gap-2 @xl:grid-cols-3"
      aria-busy="true"
      aria-label="Chargement des indicateurs"
    >
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  )
}

/**
 * The part's month at a glance (its total is in the month's tiles above,
 * `MonthFlow`): change from the previous month and from the average, and
 * the row that grew the most (expenses) or moved the most (income,
 * savings).
 */
export function SpendingKpis({ data }: { data: SpendingByCategoryDto }) {
  // While the month is partial, everything is compared on the same first
  // days ("1–3 oct.") rather than on whole months.
  const partial = data.period.status === 'partial'
  const good = INCREASE_IS_GOOD[data.kind]
  const previous = comparedName(data)
  const previousIn = partial ? `au ${previous}` : `en ${previous}`
  const vsPrevious = data.totalCents - data.previousTotalCents
  const vsAverage =
    data.averageTotalCents === null
      ? null
      : data.totalCents - data.averageTotalCents
  const expense = data.kind === 'expense'
  const biggest = data.categories.reduce<
    SpendingByCategoryDto['categories'][number] | null
  >((best, item) => {
    const wanted = expense ? item.deltaCents > 0 : item.deltaCents !== 0
    return wanted &&
      (!best || Math.abs(item.deltaCents) > Math.abs(best.deltaCents))
      ? item
      : best
  }, null)

  return (
    <section aria-label="Indicateurs du mois">
      <div className="grid grid-cols-1 gap-2 @xl:grid-cols-3">
        <ComparisonTile
          label={comparisonCaption(data, 'previous')}
          detail={`${formatEuros(data.previousTotalCents)} ${previousIn}${percentOf(vsPrevious, data.previousTotalCents)}`}
        >
          <Delta cents={vsPrevious} increaseIsGood={good} {...TILE_DELTA} />
        </ComparisonTile>
        <ComparisonTile
          label="Écart avec la moyenne"
          detail={
            data.averageTotalCents === null
              ? 'Pas encore d’historique'
              : `${formatEuros(data.averageTotalCents)} en moyenne sur ${data.averageMonths} mois${partial ? ', mêmes jours' : ''}${percentOf(vsAverage!, data.averageTotalCents)}`
          }
        >
          {vsAverage === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <Delta cents={vsAverage} increaseIsGood={good} {...TILE_DELTA} />
          )}
        </ComparisonTile>
        <ComparisonTile
          label={expense ? 'Plus forte hausse' : 'Plus grand écart'}
          detail={
            biggest ? (
              <Delta cents={biggest.deltaCents} increaseIsGood={good} />
            ) : expense ? (
              'Aucune catégorie en hausse'
            ) : (
              'Rien n’a bougé'
            )
          }
        >
          <span className="block truncate">
            {biggest ? categoryLabel(biggest, data.kind) : 'Aucune'}
          </span>
        </ComparisonTile>
      </div>
    </section>
  )
}
