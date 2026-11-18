import { useQuery } from '@tanstack/react-query'
import { forecastQuery } from '#/components/forecast/queries'
import { useForecastThreshold } from '#/components/forecast/threshold'
import { formatShortDay } from '#/components/subscriptions/format'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { FigureTile } from './FigureTile'

/**
 * The end of this month, as two tiles at the top of « Ce mois-ci » (#262):
 * the projected end-of-month balance of the checking accounts (saved
 * threshold, day-to-day spending estimated) and its low point, or the date
 * it goes under the threshold. Both open the full forecast. Nothing while
 * loading or on error: the dashboard does not depend on it.
 */
export function ForecastTiles() {
  const [thresholdCents] = useForecastThreshold()
  const { data } = useQuery(
    forecastQuery({ thresholdCents, includeVariable: true }),
  )
  if (!data || data.accounts.length === 0) return null
  const below = data.belowThreshold
  const link = { to: ROUTES.forecast }

  return (
    <div
      className="@container grid gap-2 @[36rem]:grid-cols-2"
      aria-label="Fin de mois"
      role="group"
    >
      <FigureTile
        label={`Solde prévu au ${formatShortDay(data.monthEnd)}${data.stale ? ' (indicatif)' : ''}`}
        value={formatCents(data.endBalanceCents)}
        notes={[
          data.stale &&
            data.knownUntil &&
            `relevés au ${formatShortDay(data.knownUntil)}`,
        ]}
        link={link}
      />
      {below ? (
        <FigureTile
          label={`Sous ${formatCents(data.thresholdCents)}`}
          value={formatShortDay(below.date)}
          tone="warning"
          link={link}
        />
      ) : (
        <FigureTile
          // The date in the label: notes are left out on a phone.
          label={`Point bas le ${formatShortDay(data.lowest.date)}`}
          value={formatCents(data.lowest.balanceCents)}
          link={link}
        />
      )}
    </div>
  )
}
