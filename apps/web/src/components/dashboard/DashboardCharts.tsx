import {
  AreaChart,
  BarChart,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  formatMonthLong,
  formatMonthShort,
  Skeleton,
} from '@finances/ui'
import type { ChartConfig } from '@finances/ui'
import type { ReactNode } from 'react'
import type { HistoryMonthDto } from '#/api/types.gen'

const CHART_HEIGHT = 240

/** Fixed series → token mapping: colours follow the measure, never its rank. */
const CASH_FLOW_CONFIG = {
  income: { label: 'Revenus', color: 'var(--chart-income)' },
  expenses: { label: 'Dépenses', color: 'var(--chart-expense)' },
  net: { label: 'Épargne nette', color: 'var(--chart-savings)' },
} satisfies ChartConfig

const NET_WORTH_CONFIG = {
  netWorth: { label: 'Patrimoine net', color: 'var(--chart-savings)' },
} satisfies ChartConfig

function range(months: HistoryMonthDto[]): string {
  if (months.length === 0) return ''
  return `de ${formatMonthLong(months[0].month)} à ${formatMonthLong(months[months.length - 1].month)}`
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/**
 * Income, expenses (as positive amounts, side by side with income) and net
 * savings per month. Transfers between own accounts are in none of them.
 */
export function CashFlowChart({ months }: { months: HistoryMonthDto[] }) {
  const data = months.map((month) => ({
    month: month.month,
    income: month.incomeCents,
    expenses: -month.expenseCents,
    net: month.netCents,
  }))
  return (
    <ChartCard
      title="Revenus et dépenses"
      description="Par mois, virements entre vos comptes exclus."
    >
      <BarChart
        data={data}
        index="month"
        indexLabel="Mois"
        config={CASH_FLOW_CONFIG}
        height={CHART_HEIGHT}
        indexFormatter={formatMonthShort}
        tooltipIndexFormatter={formatMonthLong}
        label={`Revenus, dépenses et épargne nette par mois, ${range(months)}`}
        dataTable="details"
      />
    </ChartCard>
  )
}

/** Net worth at each month end, from the first month with a known balance. */
export function NetWorthChart({ months }: { months: HistoryMonthDto[] }) {
  const first = months.findIndex((month) => month.netWorthCents !== null)
  const known = first === -1 ? [] : months.slice(first)
  const data = known.map((month) => ({
    month: month.month,
    netWorth: month.netWorthCents,
  }))
  return (
    <ChartCard
      title="Patrimoine net"
      description="Somme des soldes de vos comptes en fin de mois."
    >
      <AreaChart
        data={data}
        index="month"
        indexLabel="Mois"
        config={NET_WORTH_CONFIG}
        height={CHART_HEIGHT}
        indexFormatter={formatMonthShort}
        tooltipIndexFormatter={formatMonthLong}
        label={`Patrimoine net en fin de mois, ${range(known)}`}
        dataTable="details"
        emptyMessage="Pas encore de solde connu sur la période."
      />
    </ChartCard>
  )
}

/** Placeholder of a chart card while the history loads. */
export function ChartCardSkeleton({ title }: { title: string }) {
  return (
    <ChartCard title={title} description="Chargement…">
      <Skeleton
        className="w-full rounded-md"
        style={{ height: CHART_HEIGHT }}
        aria-hidden
      />
    </ChartCard>
  )
}
