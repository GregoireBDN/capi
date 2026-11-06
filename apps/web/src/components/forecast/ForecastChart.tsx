import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  formatDay,
  LineChart,
} from '@finances/ui'
import type { ChartConfig } from '@finances/ui'
import type { ForecastDto } from '#/api/types.gen'
import { formatDay as formatLongDay } from '#/lib/calendar'
import { formatCents } from '#/lib/money'

const CONFIG = {
  balance: { label: 'Solde prévu', color: 'var(--chart-savings)' },
} satisfies ChartConfig

/**
 * End-of-day projected balance from today (marked by a vertical line) to the
 * end of the month, with the low-balance threshold as a reference line.
 */
export function ForecastChart({ forecast }: { forecast: ForecastDto }) {
  const { points, today, thresholdCents } = forecast
  const data = points.map((point) => ({
    date: point.date,
    balance: point.balanceCents,
  }))
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Projection jour par jour</CardTitle>
        <CardDescription>
          Solde prévu en fin de journée, seuil à {formatCents(thresholdCents)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LineChart
          data={data}
          index="date"
          indexLabel="Jour"
          config={CONFIG}
          height={240}
          indexFormatter={formatDay}
          tooltipIndexFormatter={formatLongDay}
          referenceLines={[{ value: thresholdCents, label: 'Seuil' }]}
          indexReferenceLines={[{ value: today, label: 'Aujourd’hui' }]}
          label={`Solde prévu par jour, du ${formatLongDay(today)} au ${formatLongDay(forecast.monthEnd)}`}
          dataTable="details"
        />
      </CardContent>
    </Card>
  )
}
