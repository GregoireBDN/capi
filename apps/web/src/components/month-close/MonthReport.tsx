import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CategoryIcon,
  cn,
  formatPercent,
  formatWholeEuros,
} from '@finances/ui'
import { CircleHelpIcon, DownloadIcon, TriangleAlertIcon } from 'lucide-react'
import type {
  MonthCloseDto,
  MonthReportDto,
  ReportCategoryDto,
  ReportChangeDto,
} from '#/api/types.gen'
import { ofMonth } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { downloadReportCsv } from './csv'

/** Highlights listed per kind. */
const HIGHLIGHTS = 3

const closedAtFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Paris',
})

const categoryName = (category: { name: string | null }) =>
  category.name ?? 'Sans catégorie'

/**
 * The month's report: the frozen one once the month is closed (with what
 * changed since), else the live figures. Totals, highlights (biggest
 * increases, over-budget categories, one-offs), spending per category and
 * notes; exported as CSV.
 */
export function MonthReport({ review }: { review: MonthCloseDto }) {
  const report = review.closedReport ?? review.report
  const expenses = report.categories.filter(
    (category) => category.kind === 'expense' && category.amountCents > 0,
  )
  const increases = expenses
    .filter((c) => c.amountCents > c.previousAmountCents)
    .sort(
      (a, b) =>
        b.amountCents -
        b.previousAmountCents -
        (a.amountCents - a.previousAmountCents),
    )
    .slice(0, HIGHLIGHTS)
  const overBudget = report.categories
    .filter(
      (c) =>
        c.kind === 'expense' &&
        c.targetCents !== null &&
        c.amountCents > c.targetCents,
    )
    .sort(
      (a, b) =>
        b.amountCents - b.targetCents! - (a.amountCents - a.targetCents!),
    )
    .slice(0, HIGHLIGHTS)
  const incomeShort = report.categories.filter(
    (c) =>
      c.kind === 'income' &&
      c.targetCents !== null &&
      c.amountCents < c.targetCents,
  )

  return (
    <section aria-labelledby="month-report-title" className="min-w-0">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle id="month-report-title">
            Rapport {ofMonth(report.month)} {report.month.slice(0, 4)}
          </CardTitle>
          <CardDescription>
            {review.closedAt
              ? `Figé à la clôture, le ${closedAtFormat.format(new Date(review.closedAt))}`
              : 'Chiffres actuels, figés à la clôture.'}
          </CardDescription>
          <CardAction>
            <Button
              size="sm"
              outline
              variant="secondary"
              iconStart={<DownloadIcon />}
              onClick={() => downloadReportCsv(report)}
            >
              CSV
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-5 text-sm">
          {review.changes.length > 0 && <Changes changes={review.changes} />}

          <Totals report={report} />

          {report.plan && <PlanVsActual report={report} />}

          {incomeShort.length > 0 && (
            <Highlight title="Revenus en dessous du prévu">
              {incomeShort.map((c) => (
                <Row
                  key={`${c.kind}-${c.categoryId}`}
                  category={c}
                  value={
                    c.amountCents <= 0
                      ? 'pas reçu'
                      : `${formatWholeEuros(c.targetCents! - c.amountCents)} de moins`
                  }
                  tone="bad"
                />
              ))}
            </Highlight>
          )}

          {increases.length > 0 && (
            <Highlight title="Plus fortes hausses">
              {increases.map((c) => (
                <Row
                  key={`${c.kind}-${c.categoryId}`}
                  category={c}
                  value={`+${formatWholeEuros(c.amountCents - c.previousAmountCents)}`}
                  tone="bad"
                />
              ))}
            </Highlight>
          )}
          {overBudget.length > 0 && (
            <Highlight title="Au-dessus du budget">
              {overBudget.map((c) => (
                <Row
                  key={`${c.kind}-${c.categoryId}`}
                  category={c}
                  value={`${formatWholeEuros(c.amountCents - c.targetCents!)} de trop`}
                  tone="bad"
                />
              ))}
            </Highlight>
          )}
          {report.oneOffs.length > 0 && (
            <Highlight title="Exceptionnels">
              {report.oneOffs.map((oneOff) => (
                <li
                  key={oneOff.transactionId}
                  className="flex flex-wrap justify-between gap-x-3"
                >
                  <span className="min-w-[7rem] flex-1 break-words">
                    {oneOff.label}{' '}
                    <span className="text-muted-foreground">
                      {formatShortDay(oneOff.date)}
                    </span>
                  </span>
                  <span className="ml-auto font-medium whitespace-nowrap tabular-nums">
                    {formatCents(oneOff.amountCents)}
                  </span>
                </li>
              ))}
            </Highlight>
          )}

          {expenses.length > 0 && <SpendingBars expenses={expenses} />}

          {report.notes && (
            <div className="space-y-1">
              <p className="font-medium">Notes</p>
              <p className="whitespace-pre-line">{report.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function Totals({ report }: { report: MonthReportDto }) {
  const { flow } = report
  const items = [
    { label: 'Revenus', value: formatWholeEuros(flow.incomeCents) },
    { label: 'Dépenses', value: formatWholeEuros(-flow.expenseCents) },
    {
      label: 'Épargné',
      value: formatWholeEuros(flow.netCents),
      detail:
        flow.savingsRate === null ? undefined : formatPercent(flow.savingsRate),
    },
    {
      label: 'Patrimoine fin de mois',
      value:
        report.netWorthCents === null
          ? '—'
          : formatWholeEuros(report.netWorthCents),
    },
  ]
  return (
    <dl className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-muted-foreground text-xs">{item.label}</dt>
          <dd className="text-base font-semibold whitespace-nowrap tabular-nums">
            {item.value}
            {item.detail && (
              <span className="text-muted-foreground text-sm font-normal">
                {' '}
                · {item.detail}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The plan against the month (#315): planned vs received income, planned
 * vs actual savings. Left out of reports frozen before planned income.
 */
function PlanVsActual({ report }: { report: MonthReportDto }) {
  const plan = report.plan!
  const rows = [
    {
      label: 'Revenus',
      planned: plan.plannedIncomeCents,
      actual: plan.receivedIncomeCents,
    },
    ...(plan.plannedSavingsCents === null
      ? []
      : [
          {
            label: 'Épargne',
            planned: plan.plannedSavingsCents,
            actual: plan.actualSavingsCents,
          },
        ]),
  ]
  if (plan.plannedIncomeCents === 0) return null
  return (
    <div className="space-y-1">
      <p className="font-medium">Prévu et réalisé</p>
      <ul className="space-y-1" aria-label="Prévu et réalisé">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex flex-wrap items-baseline justify-between gap-x-3"
          >
            <span className="min-w-[7rem] flex-1">{row.label}</span>
            <span className="ml-auto whitespace-nowrap tabular-nums">
              <span className="font-medium">
                {formatWholeEuros(row.actual)}
              </span>
              <span className="text-muted-foreground">
                {' '}
                / {formatWholeEuros(row.planned)} prévus
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Highlight({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <p className="font-medium">{title}</p>
      <ul className="space-y-1" aria-label={title}>
        {children}
      </ul>
    </div>
  )
}

function Row({
  category,
  value,
  tone,
}: {
  category: ReportCategoryDto
  value: string
  tone: 'bad' | 'good'
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3">
      <span className="flex min-w-[7rem] flex-1 items-center gap-2">
        <ReportCategoryIcon category={category} />
        <span className="min-w-0 break-words">{categoryName(category)}</span>
      </span>
      <span
        className={cn(
          'ml-auto font-medium whitespace-nowrap tabular-nums',
          tone === 'bad' ? 'text-chart-delta-bad' : 'text-chart-delta-good',
        )}
      >
        {value}
      </span>
    </li>
  )
}

/** A category of the report, a question mark for the uncategorized. */
function ReportCategoryIcon({ category }: { category: ReportCategoryDto }) {
  return (
    <CategoryIcon
      icon={category.icon}
      color={category.color}
      fallback={category.categoryId === null ? CircleHelpIcon : undefined}
      size="sm"
    />
  )
}

/** Spending per category, as bars scaled on the largest. */
function SpendingBars({ expenses }: { expenses: ReportCategoryDto[] }) {
  const max = Math.max(...expenses.map((c) => c.amountCents))
  return (
    <div className="space-y-2">
      <p className="font-medium">Dépenses par catégorie</p>
      <ul className="space-y-2" aria-label="Dépenses par catégorie">
        {expenses.map((c) => (
          <li key={c.categoryId ?? 'none'} className="space-y-1">
            <div className="flex flex-wrap justify-between gap-x-3">
              <span className="flex min-w-[7rem] flex-1 items-center gap-2">
                <ReportCategoryIcon category={c} />
                <span className="min-w-0 break-words">{categoryName(c)}</span>
              </span>
              <span className="ml-auto whitespace-nowrap tabular-nums">
                {formatWholeEuros(c.amountCents)}
                {c.targetCents !== null && (
                  <span className="text-muted-foreground">
                    {' '}
                    / {formatWholeEuros(c.targetCents)}
                  </span>
                )}
              </span>
            </div>
            <div
              aria-hidden
              className="bg-muted h-1.5 overflow-hidden rounded-full"
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(c.amountCents / max) * 100}%`,
                  backgroundColor: c.color ?? 'var(--chart-other)',
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

const CHANGE_LABELS: Record<
  Exclude<ReportChangeDto['field'], 'category'>,
  string
> = {
  income: 'Revenus',
  expense: 'Dépenses',
  net: 'Épargné',
  net_worth: 'Patrimoine fin de mois',
}

/** Figures that moved since the close: the report above keeps the old ones. */
function Changes({ changes }: { changes: ReportChangeDto[] }) {
  const show = (cents: number | null) =>
    cents === null ? '—' : formatCents(cents)
  return (
    <Alert variant="warning">
      <TriangleAlertIcon />
      <AlertTitle>Modifié depuis la clôture</AlertTitle>
      <AlertDescription>
        <ul className="w-full space-y-1">
          {changes.map((change) => (
            <li
              key={`${change.field}-${change.kind}-${change.categoryId}`}
              className="flex flex-wrap justify-between gap-x-3"
            >
              <span className="min-w-[7rem] flex-1">
                {change.field === 'category'
                  ? `${categoryName(change)} (${change.kind === 'income' ? 'revenu' : 'dépense'})`
                  : CHANGE_LABELS[change.field]}
              </span>
              <span className="ml-auto whitespace-nowrap tabular-nums">
                {show(change.closedCents)} → {show(change.currentCents)}
              </span>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}
