import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  CalendarClockIcon,
  ChevronRightIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { forecastQuery } from '#/components/forecast/queries'
import { useForecastThreshold } from '#/components/forecast/threshold'
import { formatShortDay } from '#/components/subscriptions/format'
import { formatShortDay as formatDay } from '#/lib/period'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'

/**
 * The end of this month, in the current month's review (#262, #321): one row with
 * a chevron, plainly the way to the forecast page. The projected
 * end-of-month balance of the checking accounts (saved threshold,
 * day-to-day spending estimated), then its low point or the date it goes
 * under the threshold, and whether it is only indicative. Nothing while
 * loading or on error: the dashboard does not depend on it.
 */
export function ForecastRow() {
  const [thresholdCents] = useForecastThreshold()
  const { data } = useQuery(
    forecastQuery({ thresholdCents, includeVariable: true }),
  )
  if (!data || data.accounts.length === 0) return null
  const below = data.belowThreshold

  return (
    <Link
      to={ROUTES.forecast}
      className="bg-muted/50 hover:bg-muted focus-visible:ring-ring flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm outline-none focus-visible:ring-2"
    >
      {below ? (
        <TriangleAlertIcon
          aria-hidden
          className="text-warning-foreground dark:text-warning hidden size-4 shrink-0 @[36rem]:block"
        />
      ) : (
        <CalendarClockIcon
          aria-hidden
          className="text-muted-foreground hidden size-4 shrink-0 @[36rem]:block"
        />
      )}
      <span className="min-w-0 flex-1">
        {/* Compact on a phone: the figure on the label's line, the low
            point under it; the icon and how far the data goes from 36rem. */}
        <span className="flex flex-wrap items-baseline justify-between gap-x-3 @[36rem]:justify-start">
          <span>
            Fin de mois<span className="hidden @[36rem]:inline"> prévue</span>
          </span>
          <span className="font-semibold whitespace-nowrap tabular-nums">
            {formatCents(data.endBalanceCents)}
          </span>
        </span>
        <span className="text-muted-foreground block text-xs">
          {below ? (
            <span className="text-warning-foreground dark:text-warning font-medium">
              Sous {formatCents(data.thresholdCents)} le{' '}
              {formatShortDay(below.date)}
            </span>
          ) : (
            <>
              Point bas{' '}
              <span className="whitespace-nowrap">
                {formatCents(data.lowest.balanceCents)}
              </span>{' '}
              <span className="whitespace-nowrap">
                le {formatDay(data.lowest.date)}
              </span>
            </>
          )}
          {data.stale && data.knownUntil && (
            <span className="hidden @[36rem]:inline">
              {` · indicatif, relevés au ${formatShortDay(data.knownUntil)}`}
            </span>
          )}
        </span>
      </span>
      <ChevronRightIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
    </Link>
  )
}
