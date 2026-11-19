import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CategoryIcon,
  cn,
  formatMonthLong,
  formatMonthShort,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@finances/ui'
import { CircleAlertIcon } from 'lucide-react'
import type { BudgetHistoryDto, BudgetStatus } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { formatBudgetAmount } from './amount'

/** Dense cells: no cents on whole euros, exact otherwise. */
const euros = formatBudgetAmount

function Cell({
  spentCents,
  targetCents,
  status,
  label,
}: {
  spentCents: number
  targetCents: number | null
  status: BudgetStatus | null
  label: string
}) {
  const over = status === 'over'
  return (
    <TableCell
      className={cn(
        'text-right align-top tabular-nums',
        over && 'bg-chart-over/10 text-chart-delta-bad',
      )}
      title={`${label} : ${formatCents(spentCents)}${
        targetCents === null
          ? ', sans budget'
          : ` sur ${formatCents(targetCents)}`
      }`}
    >
      <span className="inline-flex items-center gap-1 font-medium">
        {over && <CircleAlertIcon aria-hidden className="size-3.5" />}
        {euros(spentCents)}
        {over && <span className="sr-only"> (dépassement)</span>}
      </span>
      <span
        className={cn(
          'block text-xs',
          over ? 'text-chart-delta-bad/80' : 'text-muted-foreground',
        )}
      >
        {targetCents === null ? '—' : `/ ${euros(targetCents)}`}
      </span>
    </TableCell>
  )
}

/** "Réel vs cible": spent and target per category and month, over in red. */
export function BudgetHistory({ history }: { history: BudgetHistoryDto }) {
  if (history.categories.length === 0) return null
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Réel vs cible</CardTitle>
        <CardDescription>
          Dépensé / objectif des {history.months.length} derniers mois.
        </CardDescription>
      </CardHeader>
      <CardContent className="group/history">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-card sticky left-0 z-10">
                Catégorie
              </TableHead>
              {history.months.map((month) => (
                <TableHead key={month} className="text-right">
                  <abbr title={formatMonthLong(month)} className="no-underline">
                    {formatMonthShort(month)}
                  </abbr>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.categories.map((category) => (
              <TableRow key={category.categoryId}>
                <TableHead
                  scope="row"
                  className="bg-card sticky left-0 z-10 max-w-28 font-normal @2xl:max-w-48"
                >
                  <span className="flex items-center gap-2">
                    <CategoryIcon
                      icon={category.icon}
                      color={category.color}
                      size="sm"
                    />
                    <span className="truncate">{category.name}</span>
                  </span>
                </TableHead>
                {category.months.map((cell) => (
                  <Cell
                    key={cell.month}
                    label={`${category.name}, ${formatMonthLong(cell.month)}`}
                    spentCents={cell.spentCents}
                    targetCents={cell.targetCents}
                    status={cell.status}
                  />
                ))}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableHead scope="row" className="bg-muted sticky left-0 z-10">
                Total
              </TableHead>
              {history.totals.map((total) => (
                <Cell
                  key={total.month}
                  label={`Total, ${formatMonthLong(total.month)}`}
                  spentCents={total.spentCents}
                  targetCents={
                    total.targetCents === 0 ? null : total.targetCents
                  }
                  status={total.status}
                />
              ))}
            </TableRow>
          </TableFooter>
        </Table>
        {/* Shown only while the table is wider than the card. */}
        <p className="text-muted-foreground mt-2 hidden text-xs group-has-data-scrollable/history:block">
          Faites glisser le tableau pour voir tous les mois.
        </p>
      </CardContent>
    </Card>
  )
}
