import { Card, cn } from '@capi/ui'
import { Link } from '@tanstack/react-router'
import {
  CalendarCheckIcon,
  ChevronRightIcon,
  LandmarkIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type { MonthReviewDto, NetWorthDto } from '#/api/types.gen'
import { formatSignedWholeEuros, formatWholeEuros } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'
import { SeeLink } from './DashboardCardHeader'
import { formatMonthName } from './DashboardTodos'
import { ForecastRow } from './ForecastCard'
import { GlanceRow } from './GlanceRow'
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

function paceText(pace: Pace, day: number, days: number) {
  switch (pace.state) {
    case 'under':
      return {
        text: `${formatWholeEuros(-pace.aheadCents)} sous le rythme`,
        className: 'text-chart-delta-good',
      }
    case 'on':
      return { text: 'Dans le rythme', className: 'text-chart-delta-good' }
    case 'ahead':
      return {
        text: `${formatWholeEuros(pace.aheadCents)} au-dessus du rythme`,
        className: 'text-warning-foreground dark:text-warning',
      }
    case 'over':
      return {
        text: `Jour ${day} sur ${days}`,
        className: 'text-chart-delta-bad',
      }
  }
}

/**
 * The dashboard's main card (#405, the owner's direction « A. À faire,
 * puis un chiffre »): what is left to spend this month in large, against an
 * even pace read up to the day the data goes to, how far the data goes
 * (in the warning tone once it is stale), then the end of the month and
 * today's net worth as two rows opening their pages.
 */
export function GlanceCard({
  review,
  netWorth,
  today,
  dataUntil,
  stale,
}: {
  /** The current month's review. */
  review: MonthReviewDto
  netWorth: NetWorthDto
  today: string
  /** The latest bank data (`GET /coverage`). */
  dataUntil: string | null
  stale: boolean
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
  const tone = paceText(pace, day, days)
  const year = today.slice(0, 4)
  const change =
    netWorth.previousMonthEndCents === null
      ? null
      : netWorth.totalCents - netWorth.previousMonthEndCents

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
            <span className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
              {pace.over ? 'Budget dépassé' : 'Reste à dépenser'} en {month}
              <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
            </span>
            <span className="flex flex-wrap items-end justify-between gap-x-4">
              <span
                data-testid="left-to-spend"
                className={cn(
                  'text-[2rem] leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums',
                  pace.over && 'text-chart-delta-bad',
                )}
              >
                {formatWholeEuros(Math.abs(pace.leftCents))}
              </span>
              <span className={cn('pb-1 text-xs font-medium', tone.className)}>
                {tone.text}
              </span>
            </span>
            <PaceBar
              spentCents={budget.spentCents}
              targetCents={budget.targetCents}
              paceCents={pace.paceCents}
            />
            <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground tabular-nums">
                {formatWholeEuros(budget.spentCents)} sur{' '}
                {formatWholeEuros(budget.targetCents)}
                {budget.unbudgetedCents > 0 &&
                  ` · ${formatWholeEuros(budget.unbudgetedCents)} hors budget`}
              </span>
              <DataNote dataUntil={dataUntil} stale={stale} year={year} />
            </span>
          </Link>
        )}
        {budget.budgetCount === 0 && (
          <DataNote dataUntil={dataUntil} stale={stale} year={year} />
        )}
      </section>
      <div className="space-y-0.5 pt-1.5">
        <ForecastRow />
        <GlanceRow
          icon={<LandmarkIcon />}
          tone="primary"
          title="Patrimoine"
          value={formatWholeEuros(netWorth.totalCents)}
          detail={
            change === null
              ? undefined
              : `${formatSignedWholeEuros(change)} depuis le ${formatShortDay(netWorth.previousMonthEnd, year)}`
          }
        >
          {/* The accounts and the two parts of the net worth are on
              Comptes (#405). */}
          <Link to={ROUTES.accounts} />
        </GlanceRow>
      </div>
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

/** « À jour au 19 nov. », or in the warning tone « Chiffres au 11 nov. ». */
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
      className={cn(
        'flex items-center gap-1.5 text-xs',
        stale
          ? 'text-warning-foreground dark:text-warning font-medium'
          : 'text-muted-foreground',
      )}
    >
      {stale ? (
        <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" />
      ) : (
        <CalendarCheckIcon aria-hidden className="size-3.5 shrink-0" />
      )}
      {stale ? 'Chiffres au ' : 'À jour au '}
      {formatShortDay(dataUntil, year)}
    </span>
  )
}
