import {
  BarChart,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  formatMonthLong,
  formatMonthShort,
  formatWholeEuros,
  Label,
  Skeleton,
  Switch,
} from '@finances/ui'
import type { ChartConfig } from '@finances/ui'
import { useId, useState } from 'react'
import type { SavingsMonthDto } from '#/api/types.gen'

export const CHART_HEIGHT = 240

/** Fixed series → token mapping: colours follow the measure, never its rank. */
const NET_CONFIG = {
  net: { label: 'Épargne nette', color: 'var(--chart-savings)' },
} satisfies ChartConfig

const WITH_MOVED_CONFIG = {
  ...NET_CONFIG,
  moved: { label: 'Versé sur l’épargne', color: 'var(--chart-other)' },
} satisfies ChartConfig

/** Shown in the tooltip and the data table, not drawn. */
const ONE_OFF_DETAILS = { oneOff: 'Dont ponctuel' } as const

function range(months: SavingsMonthDto[]): string {
  if (months.length === 0) return ''
  return `de ${formatMonthLong(months[0].month)} à ${formatMonthLong(months[months.length - 1].month)}`
}

/**
 * Net savings per month (negative months go below zero) with the monthly
 * target as a reference line, and optionally what was moved from checking to
 * savings and investment accounts.
 */
export function SavingsChart({
  months,
  target,
}: {
  months: SavingsMonthDto[]
  target: number | null
}) {
  const id = useId()
  const [showMoved, setShowMoved] = useState(false)
  const data = months.map((month) => ({
    month: month.month,
    net: month.netCents,
    ...(showMoved ? { moved: month.movedCents } : {}),
    oneOff: month.oneOffNetCents,
  }))
  const oneOffCount = months.filter(
    (month) => month.oneOffNetCents !== 0,
  ).length

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Épargne par mois</CardTitle>
        <CardDescription>
          Revenus moins dépenses, virements entre vos comptes exclus.
          {target !== null &&
            ` La ligne pointillée marque votre épargne cible (${formatWholeEuros(target)} par mois).`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <BarChart
          data={data}
          index="month"
          indexLabel="Mois"
          config={showMoved ? WITH_MOVED_CONFIG : NET_CONFIG}
          height={CHART_HEIGHT}
          indexFormatter={formatMonthShort}
          tooltipIndexFormatter={formatMonthLong}
          referenceLines={
            target === null
              ? undefined
              : [{ value: target, label: `Cible ${formatWholeEuros(target)}` }]
          }
          details={ONE_OFF_DETAILS}
          label={`Épargne nette par mois${showMoved ? ' et montants versés sur l’épargne' : ''}, ${range(months)}`}
          dataTable="details"
        />
        <div className="flex items-start gap-3">
          <Switch
            id={`${id}-moved`}
            checked={showMoved}
            onCheckedChange={setShowMoved}
          />
          <div className="space-y-0.5">
            <Label htmlFor={`${id}-moved`} className="font-normal">
              Afficher les versements vers l’épargne
            </Label>
            <p className="text-muted-foreground text-xs">
              Virements reçus par vos livrets, plus les virements du compte
              courant classés « Investissement », retraits déduits.
            </p>
          </div>
        </div>
        {oneOffCount > 0 && (
          <p className="text-muted-foreground text-xs">
            {oneOffCount === 1
              ? '1 mois compte'
              : `${oneOffCount} mois comptent`}{' '}
            des revenus ou dépenses ponctuels : touchez un mois ou ouvrez les
            données pour voir leur montant.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function SavingsChartSkeleton() {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Épargne par mois</CardTitle>
        <CardDescription>Chargement…</CardDescription>
      </CardHeader>
      <CardContent>
        <Skeleton
          className="w-full rounded-md"
          style={{ height: CHART_HEIGHT }}
          aria-hidden
        />
      </CardContent>
    </Card>
  )
}
