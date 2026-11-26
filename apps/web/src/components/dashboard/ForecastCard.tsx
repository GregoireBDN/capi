import { cn } from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { forecastQuery } from '#/components/forecast/queries'
import { useForecastThreshold } from '#/components/forecast/threshold'
import { formatWholeEuros } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'

interface Step {
  key: string
  label: string
  cents: number
  dot: string
  value?: string
  large?: boolean
}

/**
 * « Fin de mois » (#262, #405; #495, the owner's « B. Trajet »): the
 * balance of the bank accounts as a path of three stops (today or the day
 * the data goes to, the low point, the month end), then what is still to
 * pay and to receive. The low point in the warning tone once under the
 * saved threshold; « indicatif » when the data is old (no alarm then,
 * `belowThreshold` is null). The whole block opens the forecast page.
 * Nothing while loading or on error: the dashboard does not depend on it.
 */
export function ForecastPath({
  accountIds,
}: {
  /** The accounts projected (#495); all the bank accounts by default. */
  accountIds?: string[] | null
} = {}) {
  const [thresholdCents] = useForecastThreshold()
  const { data } = useQuery(
    forecastQuery({
      thresholdCents,
      includeVariable: true,
      ...(accountIds ? { accountIds } : {}),
    }),
  )
  if (!data || data.accounts.length === 0) return null
  const year = data.today.slice(0, 4)
  const below = data.belowThreshold
  const start = data.startingBalanceCents
  const end = data.endBalanceCents
  const startDate = data.startingBalanceDate
  const steps: Step[] = [
    {
      key: 'start',
      label:
        startDate === null || startDate >= data.today
          ? 'Aujourd’hui'
          : `Au ${formatShortDay(startDate, year)}`,
      cents: start,
      dot: 'bg-primary',
    },
  ]
  // The low point only when it is a stop of its own, under both ends.
  if (data.lowest.balanceCents < Math.min(start, end)) {
    steps.push({
      key: 'low',
      label: `Point bas · ${formatShortDay(data.lowest.date, year)}`,
      cents: data.lowest.balanceCents,
      dot: below ? 'bg-chart-over' : 'bg-warning',
      value: below ? 'text-chart-delta-bad' : undefined,
    })
  }
  steps.push({
    key: 'end',
    label: `Fin · ${formatShortDay(data.monthEnd, year)}`,
    cents: end,
    dot: end >= start ? 'bg-chart-income' : 'bg-chart-expense',
    large: true,
  })
  const toPay = data.expectedDebitsCents + (data.estimate?.totalCents ?? 0)
  const toReceive = data.expectedCreditsCents

  return (
    <Link
      to={ROUTES.forecast}
      aria-label={`Fin de mois : ${formatWholeEuros(end)}`}
      className={cn(
        'focus-visible:ring-ring block rounded-lg px-2 pt-1.5 pb-2 outline-none focus-visible:ring-2',
        below ? 'bg-warning/15' : 'hover:bg-muted/60',
      )}
    >
      <span className="flex min-h-9 items-center gap-2 text-sm">
        {below ? (
          <TriangleAlertIcon
            aria-hidden
            className="text-warning-foreground dark:text-warning size-[18px] shrink-0"
          />
        ) : (
          <CalendarClockIcon
            aria-hidden
            className="text-primary size-[18px] shrink-0"
          />
        )}
        <span className="flex-1 font-semibold">Fin de mois</span>
        {data.stale && (
          <span className="text-muted-foreground text-xs">indicatif</span>
        )}
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </span>
      <span
        className={cn(
          'relative grid pt-2.5 pb-2',
          steps.length === 3 ? 'grid-cols-3' : 'grid-cols-2',
        )}
      >
        {/* The line between the first and the last stop's dots. */}
        <span
          aria-hidden
          className={cn(
            'bg-muted absolute top-[1.05rem] h-1 rounded-full',
            steps.length === 3
              ? 'right-[16.6%] left-[16.6%]'
              : 'right-1/4 left-1/4',
          )}
        />
        {steps.map((step) => (
          <span
            key={step.key}
            data-testid={`forecast-${step.key}`}
            className="relative flex min-w-0 flex-col items-center gap-0.5 text-center"
          >
            <span
              aria-hidden
              className={cn('ring-card size-3.5 rounded-full ring-4', step.dot)}
            />
            <span
              className={cn(
                'mt-1 font-bold whitespace-nowrap tabular-nums',
                step.large ? 'text-lg leading-tight' : 'text-sm',
                step.value,
              )}
            >
              {formatWholeEuros(step.cents)}
            </span>
            <span className="text-muted-foreground text-[0.65rem] break-normal">
              {step.label}
            </span>
          </span>
        ))}
      </span>
      {below && (
        <span className="text-warning-foreground dark:text-warning block pb-1 text-center text-xs font-medium">
          Sous {formatWholeEuros(data.thresholdCents)} le{' '}
          {formatShortDay(below.date, year)}
        </span>
      )}
      {(toPay < 0 || toReceive > 0) && (
        <span className="flex flex-wrap justify-center gap-1.5">
          {toPay < 0 && (
            <Chip
              tone="bad"
              icon={<ArrowUpRightIcon />}
              label={formatWholeEuros(-toPay)}
              srLabel="à payer"
            />
          )}
          {toReceive > 0 && (
            <Chip
              tone="good"
              icon={<ArrowDownLeftIcon />}
              label={formatWholeEuros(toReceive)}
              srLabel="à recevoir"
            />
          )}
        </span>
      )}
    </Link>
  )
}

/** What is still to pay or to receive: an arrow and an amount, no words (the owner's « B. Trajet »). */
function Chip({
  tone,
  icon,
  label,
  srLabel,
}: {
  tone: 'good' | 'bad'
  icon: ReactNode
  label: string
  /** What the arrow says, for screen readers. */
  srLabel: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums [&_svg]:size-3.5',
        tone === 'good'
          ? 'bg-chart-income/15 text-chart-delta-good'
          : 'bg-chart-expense/15 text-chart-delta-bad',
      )}
    >
      {icon}
      {label}
      <span className="sr-only"> {srLabel}</span>
    </span>
  )
}
