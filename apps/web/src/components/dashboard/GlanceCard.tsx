import { Card, cn } from '@capi/ui'
import { Link } from '@tanstack/react-router'
import {
  CheckIcon,
  ChevronRightIcon,
  GaugeIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type { MonthReviewDto } from '#/api/types.gen'
import { formatWholeEuros } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'
import { SeeLink } from './DashboardCardHeader'
import { formatMonthName } from './DashboardTodos'
import { ForecastPath } from './ForecastCard'
import { budgetPace, daysInMonth } from './glance'
import type { Pace } from './glance'

/**
 * The day the month's spending is read to: the last day its bank data
 * covers while it is partial (like for like: the pace of the days known),
 * none while it is empty, else today.
 */
export function readDay(review: MonthReviewDto, today: string): number {
  const { period } = review
  if (period.status === 'partial' && period.throughDay !== null) {
    return period.throughDay
  }
  if (period.status === 'empty') return 0
  return Number(today.slice(8, 10))
}

/** How the spending holds against the pace, as a pill: a word, no sentence. */
function PacePill({ pace }: { pace: Pace }) {
  const { label, className, Icon } =
    pace.state === 'over'
      ? {
          label: 'Dépassé',
          className: 'bg-chart-delta-bad/10 text-chart-delta-bad',
          Icon: TriangleAlertIcon,
        }
      : pace.state === 'ahead'
        ? {
            label: 'Rythme rapide',
            className:
              'bg-warning/20 text-warning-foreground dark:text-warning',
            Icon: GaugeIcon,
          }
        : {
            label: 'Bon rythme',
            className: 'bg-chart-delta-good/10 text-chart-delta-good',
            Icon: CheckIcon,
          }
  return (
    <span
      data-testid="pace"
      className={cn(
        'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {label}
    </span>
  )
}

/**
 * The dashboard's main card (#405, the owner's direction « A. À faire,
 * puis un chiffre »): what is left to spend this month in large, against an
 * even pace read up to the day the data goes to, how far the data goes
 * (in the warning tone once it is stale), then the end of the month as a
 * row opening the forecast.
 */
export function GlanceCard({
  review,
  today,
  dataUntil,
  stale,
  rows = ['forecast'],
}: {
  /** The current month's review. */
  review: MonthReviewDto
  today: string
  /** The latest bank data (`GET /coverage`). */
  dataUntil: string | null
  stale: boolean
  /** The rows under the figure (#495): « Fin de mois » by default. */
  rows?: readonly 'forecast'[]
}) {
  const { budget } = review
  const month = formatMonthName(review.month)
  const days = daysInMonth(review.month)
  const day = readDay(review, today)
  const pace = budgetPace({
    targetCents: budget.targetCents,
    spentCents: budget.spentCents,
    day,
    daysInMonth: days,
  })
  // The days still to come after the last one known, and what is left
  // for each of them (none once spent past the target or on the last day).
  const daysLeft = days - day
  const perDay =
    !pace.over && daysLeft > 0
      ? Math.floor(pace.leftCents / daysLeft / 100) * 100
      : null
  const year = today.slice(0, 4)

  return (
    <Card className="min-w-0 gap-2 px-2 pt-3 pb-2">
      <section aria-label="Reste à dépenser" className="space-y-2 px-2 pb-1">
        {budget.budgetCount === 0 ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              Pas de budget pour {month}.
            </p>
            <SeeLink label="Fixer un budget" to={ROUTES.budget} />
          </div>
        ) : (
          // The whole figure opens Budget, where each category stands.
          <Link
            to={ROUTES.budget}
            className="hover:bg-muted/40 focus-visible:ring-ring -mx-2 block space-y-2 rounded-lg px-2 py-1 outline-none focus-visible:ring-2"
          >
            <span className="text-muted-foreground flex min-h-6 items-center justify-between gap-3 text-xs">
              <span>
                {pace.over ? 'Dépassé' : 'Reste'} · {month}
              </span>
              <span className="flex items-center gap-2">
                <DataNote dataUntil={dataUntil} stale={stale} year={year} />
                <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
              </span>
            </span>
            {/* « B. Deux chiffres » (#495): what is left in large, what
                that leaves per day for the days still to come beside it. */}
            <span className="flex items-end gap-4">
              <span
                data-testid="left-to-spend"
                className={cn(
                  'text-[2rem] leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums',
                  pace.over && 'text-chart-delta-bad',
                )}
              >
                {formatWholeEuros(Math.abs(pace.leftCents))}
              </span>
              {perDay !== null && (
                <span
                  data-testid="per-day"
                  className="border-l pb-1 pl-4 leading-tight"
                >
                  <span className="block text-lg font-semibold whitespace-nowrap tabular-nums">
                    {formatWholeEuros(perDay)}
                  </span>
                  <span className="text-muted-foreground block text-xs whitespace-nowrap">
                    par jour · {daysLeft} j
                  </span>
                </span>
              )}
            </span>
            <PaceBar
              spentCents={budget.spentCents}
              targetCents={budget.targetCents}
              paceCents={pace.paceCents}
            />
            <span className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                sur {formatWholeEuros(budget.targetCents)}
              </span>
              <PacePill pace={pace} />
            </span>
          </Link>
        )}
        {budget.budgetCount === 0 && (
          <span className="text-muted-foreground flex text-xs">
            <DataNote dataUntil={dataUntil} stale={stale} year={year} />
          </span>
        )}
      </section>
      {rows.includes('forecast') && (
        <div className="space-y-0.5 border-t pt-1.5">
          <ForecastPath />
        </div>
      )}
    </Card>
  )
}

/** Spent against the target, with the even pace as a mark. */
function PaceBar({
  spentCents,
  targetCents,
  paceCents,
}: {
  spentCents: number
  targetCents: number
  paceCents: number
}) {
  const ratio = targetCents > 0 ? spentCents / targetCents : 0
  const over = ratio > 1
  const ahead = !over && spentCents > paceCents && ratio >= 0.8
  return (
    // Spans: it sits inside the link to Budget.
    <span
      role="meter"
      aria-label="Budget du mois"
      aria-valuemin={0}
      aria-valuemax={targetCents}
      aria-valuenow={spentCents}
      aria-valuetext={`${formatWholeEuros(spentCents)} dépensés sur ${formatWholeEuros(targetCents)}, rythme du mois : ${formatWholeEuros(paceCents)}`}
      className="bg-muted relative block h-3 rounded-full"
    >
      <span
        className={cn(
          'absolute inset-y-0 left-0 rounded-full',
          over ? 'bg-chart-over' : ahead ? 'bg-chart-warning' : 'bg-primary',
        )}
        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
      />
      <span
        aria-hidden
        className="bg-foreground absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded"
        style={{
          left: `${targetCents > 0 ? Math.min(paceCents / targetCents, 1) * 100 : 0}%`,
        }}
      />
    </span>
  )
}

/**
 * How far the figures go, beside the title: « au 19 nov. », or as a
 * warning chip once the data is stale.
 */
function DataNote({
  dataUntil,
  stale,
  year,
}: {
  dataUntil: string | null
  stale: boolean
  year: string
}) {
  if (dataUntil === null) return null
  return (
    <span
      data-testid="data-until"
      className={cn(
        'flex items-center gap-1 whitespace-nowrap',
        stale &&
          'bg-warning/15 text-warning-foreground dark:text-warning rounded-full px-2 py-0.5 font-medium',
      )}
    >
      {stale && <TriangleAlertIcon aria-hidden className="size-3 shrink-0" />}
      <span className="sr-only">{stale ? 'Chiffres' : 'À jour'}</span> au{' '}
      {formatShortDay(dataUntil, year)}
    </span>
  )
}
