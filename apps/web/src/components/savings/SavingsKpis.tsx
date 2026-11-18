import {
  formatMonthShort,
  formatPercent,
  formatWholeEuros,
  StatCard,
} from '@finances/ui'
import type { ReactNode } from 'react'
import type {
  MonthPeriodDto,
  SavingsAverageDto,
  SavingsOverviewDto,
} from '#/api/types.gen'
import { formatPoints, savingsRateNote } from '#/components/dashboard/labels'
import { formatMonth } from '#/lib/calendar'
import { comparisonLabel, isComparable } from '#/lib/period'

/** Window of the "Épargne moyenne" tile, in full months (as the API's). */
export const AVERAGE_TILE_MONTHS = 6

const NO_DATA = 'Pas encore de données'

/** Deltas in whole euros, like the values: `+1 235 €`, `-40 €`. */
function formatSignedWholeEuros(cents: number): string {
  const text = formatWholeEuros(cents)
  return cents > 0 && /[1-9]/.test(text) ? `+${text}` : text
}

/** Keeps the last word on one line ("mois-ci" never splits at its hyphen). */
function keepLastWord(text: string): ReactNode {
  const space = text.lastIndexOf(' ')
  if (space < 0) return text
  return (
    <>
      {text.slice(0, space + 1)}
      <span className="whitespace-nowrap">{text.slice(space + 1)}</span>
    </>
  )
}

/** "vs octobre" for a full month, "vs 1–2 oct." while it is in progress. */
function vsLabel(period: MonthPeriodDto): string {
  const previous = formatMonth(period.previousMonth)
    .toLowerCase()
    .replace(/\s\d{4}$/, '')
  return comparisonLabel(period, `vs ${previous}`)
}

/**
 * What the average covers: "Par mois, de mai à oct. (6 mois complets)", or
 * why there is none yet.
 */
export function averageNote(average: SavingsAverageDto | undefined): string {
  if (!average || average.monthCount === 0 || average.from === null) {
    return 'Pas encore de mois complet'
  }
  const { monthCount, from, to } = average
  const count = `${monthCount} mois complet${monthCount > 1 ? 's' : ''}`
  if (to === null || from === to) {
    return `Par mois, en ${formatMonthShort(from)} (${count})`
  }
  return `Par mois, de ${formatMonthShort(from)} à ${formatMonthShort(to)} (${count})`
}

/**
 * Headline figures: the month's net savings and rate (the dashboard's
 * figures: the current month when it has data, else the last month with
 * data; vs the same first days of the month before while it is in
 * progress), the average monthly savings over the last full months and the
 * savings stock (savings accounts + investments) with the investments' gain.
 * A figure that cannot be computed yet shows a dash and says why. One tile
 * per row on a phone, side by side from a tablet width on.
 */
export function SavingsKpis({ overview }: { overview: SavingsOverviewDto }) {
  const { months, averages, stock, period, current, previous } = overview
  const comparable = isComparable(period)
  const vs = vsLabel(period)
  const average = averages.find((a) => a.months === AVERAGE_TILE_MONTHS)
  const averageCents = average?.netCents ?? null
  const rate = comparable ? current.savingsRate : null
  const noStock =
    stock.cash.accounts.length === 0 && stock.investments.accounts.length === 0

  return (
    <section aria-label="Chiffres clés" className="space-y-2">
      <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2 @2xl:grid-cols-4">
        <StatCard
          label="Épargne du mois"
          value={current.netCents}
          valueFormatter={(cents) =>
            comparable ? formatWholeEuros(cents) : '—'
          }
          previousValue={comparable ? previous.netCents : undefined}
          deltaDisplay="value"
          deltaFormatter={formatSignedWholeEuros}
          comparisonLabel={vs}
          note={comparable ? undefined : NO_DATA}
          trend={comparable ? months.map((month) => month.netCents) : undefined}
          trendLabel={`Épargne nette par mois, sur ${months.length} mois`}
        />
        <StatCard
          label="Taux d’épargne"
          value={rate ?? 0}
          valueFormatter={(ratio) =>
            rate === null ? '—' : formatPercent(ratio)
          }
          previousValue={
            rate === null ? undefined : (previous.savingsRate ?? undefined)
          }
          deltaDisplay="value"
          deltaFormatter={formatPoints}
          comparisonLabel={vs}
          note={keepLastWord(
            comparable ? (savingsRateNote(current, period) ?? '') : NO_DATA,
          )}
        />
        <StatCard
          label="Épargne moyenne"
          value={averageCents ?? 0}
          valueFormatter={(cents) =>
            averageCents === null ? '—' : formatWholeEuros(cents)
          }
          note={averageNote(average)}
        />
        <StatCard
          label="Mis de côté"
          value={stock.totalCents}
          valueFormatter={(cents) => (noStock ? '—' : formatWholeEuros(cents))}
          previousValue={
            stock.gainCents === null
              ? undefined
              : stock.totalCents - stock.gainCents
          }
          deltaDisplay="value"
          deltaFormatter={formatSignedWholeEuros}
          comparisonLabel="de plus-value"
          note={noStock ? 'Aucun livret ni placement' : 'Livrets et placements'}
        />
      </div>
      <p className="text-muted-foreground px-1 text-xs">
        Virements entre vos comptes exclus.
      </p>
    </section>
  )
}
