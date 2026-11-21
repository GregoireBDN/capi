import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarClockIcon, TriangleAlertIcon } from 'lucide-react'
import { forecastQuery } from '#/components/forecast/queries'
import { useForecastThreshold } from '#/components/forecast/threshold'
import { formatWholeEuros } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'
import { GlanceRow } from './GlanceRow'

/**
 * « Fin de mois » in the dashboard's main card (#262, #405): the projected
 * end-of-month balance of the checking accounts (saved threshold, day-to-day
 * spending estimated), then its low point or, in the warning tone, the day
 * it goes under the threshold, and « indicatif » when the data is old (no
 * alarm then, `belowThreshold` is null). Opens the forecast page. Nothing
 * while loading or on error: the dashboard does not depend on it.
 */
export function ForecastRow() {
  const [thresholdCents] = useForecastThreshold()
  const { data } = useQuery(
    forecastQuery({ thresholdCents, includeVariable: true }),
  )
  if (!data || data.accounts.length === 0) return null
  const below = data.belowThreshold
  const year = data.today.slice(0, 4)

  return (
    <GlanceRow
      icon={below ? <TriangleAlertIcon /> : <CalendarClockIcon />}
      tone={below ? 'warning' : 'muted'}
      highlight={below !== null}
      title="Fin de mois"
      value={formatWholeEuros(data.endBalanceCents)}
      detail={
        below ? (
          <span className="text-warning-foreground dark:text-warning font-medium">
            Sous {formatWholeEuros(data.thresholdCents)} le{' '}
            {formatShortDay(below.date, year)}
          </span>
        ) : (
          <>
            Point bas {formatWholeEuros(data.lowest.balanceCents)}
            {/* Old data: indicative, and the day of the low point with it. */}
            {data.stale
              ? ' · indicatif'
              : ` le ${formatShortDay(data.lowest.date, year)}`}
          </>
        )
      }
    >
      <Link to={ROUTES.forecast} />
    </GlanceRow>
  )
}
