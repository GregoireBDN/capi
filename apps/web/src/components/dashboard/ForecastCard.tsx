import { Card, CardContent } from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlertIcon } from 'lucide-react'
import { forecastQuery } from '#/components/forecast/queries'
import { useForecastThreshold } from '#/components/forecast/threshold'
import { formatShortDay } from '#/components/subscriptions/format'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { DashboardCardHeader } from './DashboardCardHeader'

/**
 * "Fin de mois": projected end-of-month balance of the checking accounts
 * (saved threshold, day-to-day spending estimated) with its low point or the
 * low-balance warning, linking to the full forecast. Hidden while loading or
 * on error: the dashboard does not depend on it.
 */
export function ForecastCard() {
  const [thresholdCents] = useForecastThreshold()
  const { data } = useQuery(
    forecastQuery({ thresholdCents, includeVariable: true }),
  )
  if (!data || data.accounts.length === 0) return null
  const below = data.belowThreshold

  return (
    <Card size="sm">
      <DashboardCardHeader
        title="Fin de mois"
        link={{ label: 'Prévision', to: ROUTES.forecast }}
      />
      {/* The figure, then its low point: beside it in a wide card. */}
      <CardContent className="flex flex-wrap items-end gap-x-10 gap-y-1">
        <div>
          <p className="text-muted-foreground text-sm">
            Solde prévu au {formatShortDay(data.monthEnd)}
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatCents(data.endBalanceCents)}
          </p>
        </div>
        <div className="space-y-0.5 pb-1">
          {below ? (
            <p className="text-warning-foreground dark:text-warning flex items-start gap-1.5 text-sm">
              <TriangleAlertIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0"
              />
              Sous {formatCents(data.thresholdCents)} le{' '}
              {formatShortDay(below.date)}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Point bas {formatCents(data.lowest.balanceCents)} le{' '}
              {formatShortDay(data.lowest.date)}
            </p>
          )}
          {data.stale && data.knownUntil && (
            <p className="text-muted-foreground text-xs">
              Indicatif : relevés au {formatShortDay(data.knownUntil)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
