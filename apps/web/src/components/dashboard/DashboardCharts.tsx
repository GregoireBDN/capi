import {
  BarChart,
  Card,
  CardContent,
  formatMonthLong,
  formatMonthShort,
  Skeleton,
} from '@finances/ui'
import type { ChartConfig } from '@finances/ui'
import type { ReactNode } from 'react'
import type { HistoryMonthDto } from '#/api/types.gen'
import { DashboardCardHeader } from './DashboardCardHeader'

const CHART_HEIGHT = 240

/** Fixed series → token mapping: colours follow the measure, never its rank. */
const CASH_FLOW_CONFIG = {
  income: { label: 'Revenus', color: 'var(--chart-income)' },
  expenses: { label: 'Dépenses', color: 'var(--chart-expense)' },
  net: { label: 'Épargne nette', color: 'var(--chart-savings)' },
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
      <DashboardCardHeader title={title} status={description} />
      <CardContent className="mb-0">{children}</CardContent>
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

/** Placeholder of a chart card while the history loads. */
export function ChartCardSkeleton() {
  return (
    <ChartCard title="Revenus et dépenses" description="Chargement…">
      <Skeleton
        className="w-full rounded-md"
        style={{ height: CHART_HEIGHT }}
        aria-hidden
      />
    </ChartCard>
  )
}
