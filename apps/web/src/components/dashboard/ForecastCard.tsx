import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRightIcon, TriangleAlertIcon } from 'lucide-react'
import { forecastQuery } from '#/components/forecast/queries'
import { useForecastThreshold } from '#/components/forecast/threshold'
import { formatShortDay } from '#/components/subscriptions/format'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'

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
      <CardHeader>
        <CardTitle>Fin de mois</CardTitle>
        <CardDescription>
          Solde prévu au {formatShortDay(data.monthEnd)}
          {data.stale && data.knownUntil
            ? ` · indicatif, relevés au ${formatShortDay(data.knownUntil)}`
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-2xl font-semibold tabular-nums">
          {formatCents(data.endBalanceCents)}
        </p>
        {below ? (
          <p className="text-warning-foreground dark:text-warning flex items-start gap-1.5 text-sm">
            <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            Sous {formatCents(data.thresholdCents)} le{' '}
            {formatShortDay(below.date)}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Point bas {formatCents(data.lowest.balanceCents)} le{' '}
            {formatShortDay(data.lowest.date)}
          </p>
        )}
        <Link
          to={ROUTES.forecast}
          className="text-foreground relative inline-flex items-center gap-1 text-sm font-medium pointer-coarse:touch-hitbox underline-offset-4 hover:underline"
        >
          Voir la prévision
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </CardContent>
    </Card>
  )
}
