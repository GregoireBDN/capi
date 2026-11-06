import {
  AreaChart,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@finances/ui'
import type { ChartConfig } from '@finances/ui'
import type { SnapshotDto } from '#/api/types.gen'
import { formatCalendarDate } from '#/lib/money'
import { formatAxisDate } from './labels'

const investmentConfig = {
  value: { label: 'Valeur', color: 'var(--chart-1)' },
  contributions: { label: 'Versements nets', color: 'var(--chart-2)' },
} satisfies ChartConfig

const valueConfig = {
  value: { label: 'Valeur', color: 'var(--chart-1)' },
} satisfies ChartConfig

const cashConfig = {
  value: { label: 'Solde relevé', color: 'var(--chart-1)' },
} satisfies ChartConfig

/**
 * Value over time, with the net contributions underneath for investment
 * accounts: the gap between the two is the gain. One point per snapshot,
 * spaced evenly (statements are not on a regular rhythm).
 */
export function ValueChart({
  snapshots,
  withContributions,
}: {
  snapshots: SnapshotDto[]
  withContributions: boolean
}) {
  const showContributions =
    withContributions && snapshots.some((s) => s.contributionsCents !== null)
  const data = snapshots.map((snapshot) => ({
    date: snapshot.date,
    value: snapshot.valueCents,
    ...(showContributions && { contributions: snapshot.contributionsCents }),
  }))

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Historique</CardTitle>
        <CardDescription>
          {showContributions
            ? 'Valeur et versements nets à chaque relevé.'
            : withContributions
              ? 'Valeur à chaque relevé.'
              : 'Soldes de relevés enregistrés.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {snapshots.length < 2 ? (
          <p className="text-muted-foreground text-sm">
            Il faut au moins deux valeurs pour tracer l’évolution.
          </p>
        ) : (
          <AreaChart
            data={data}
            index="date"
            config={
              showContributions
                ? investmentConfig
                : withContributions
                  ? valueConfig
                  : cashConfig
            }
            indexFormatter={formatAxisDate}
            tooltipIndexFormatter={formatCalendarDate}
            indexLabel="Date"
            label={
              showContributions
                ? 'Valeur et versements nets du compte à chaque relevé'
                : 'Valeur du compte à chaque relevé'
            }
            height={220}
          />
        )}
      </CardContent>
    </Card>
  )
}
