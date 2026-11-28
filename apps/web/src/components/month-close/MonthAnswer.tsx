import {
  Button,
  CategoryIcon,
  cn,
  formatPercent,
  formatWholeEuros,
} from '@capi/ui'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleHelpIcon,
  LockIcon,
  PiggyBankIcon,
  TargetIcon,
  WalletIcon,
} from 'lucide-react'
import type { MonthReportDto, ReportCategoryDto } from '#/api/types.gen'

/** Categories listed under the answer. */
const TOP_CATEGORIES = 5

const categoryName = (category: { name: string | null }) =>
  category.name ?? 'Sans catégorie'

/** What a month's report says at a glance (#541). */
export function answerFigures(report: MonthReportDto) {
  const expenses = report.categories.filter((c) => c.kind === 'expense')
  const budgeted = expenses.filter((c) => c.targetCents !== null)
  return {
    previousExpenseCents: expenses.reduce(
      (sum, c) => sum + c.previousAmountCents,
      0,
    ),
    budget:
      budgeted.length === 0
        ? null
        : {
            spentCents: budgeted.reduce((sum, c) => sum + c.amountCents, 0),
            targetCents: budgeted.reduce((sum, c) => sum + c.targetCents!, 0),
          },
    plannedIncomeCents:
      report.plan && report.plan.plannedIncomeCents > 0
        ? report.plan.plannedIncomeCents
        : null,
  }
}

/** An amount up or down against the month before, green when it is good. */
function Delta({ cents, good }: { cents: number; good: boolean }) {
  if (cents === 0) return null
  const Arrow = cents < 0 ? ArrowDownIcon : ArrowUpIcon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums',
        good
          ? 'bg-chart-delta-good/10 text-chart-delta-good'
          : 'bg-chart-delta-bad/10 text-chart-delta-bad',
      )}
    >
      <Arrow aria-hidden className="size-[0.7rem]" />
      <span className="sr-only">
        {cents < 0 ? 'en baisse de ' : 'en hausse de '}
      </span>
      {formatWholeEuros(Math.abs(cents))}
    </span>
  )
}

function Bar({
  label,
  cents,
  max,
  color,
  extra,
  mark,
}: {
  label: string
  cents: number
  max: number
  color: string
  extra?: React.ReactNode
  /** A notch on the bar (planned income). */
  mark?: number | null
}) {
  const share = (value: number) =>
    `${max <= 0 ? 0 : Math.min(100, (value / max) * 100)}%`
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto flex items-center gap-2">
          {extra}
          <span className="font-semibold whitespace-nowrap tabular-nums">
            {formatWholeEuros(cents)}
          </span>
        </span>
      </div>
      <div aria-hidden className="bg-glass-fill relative h-3 rounded-full">
        <div
          className="h-full rounded-full"
          style={{ width: share(cents), backgroundColor: color }}
        />
        {mark != null && (
          <div
            className="bg-foreground absolute -inset-y-0.5 w-[2px] rounded-full"
            style={{ left: share(mark) }}
          />
        )}
      </div>
    </div>
  )
}

/**
 * The month's answer (#541): what was saved, income against expenses (the
 * expenses against the month before), the budget. Read from the report, so
 * a closed month shows its frozen figures.
 */
export function MonthAnswer({
  report,
  closed,
}: {
  report: MonthReportDto
  closed: boolean
}) {
  const { flow } = report
  const expenseCents = -flow.expenseCents
  const { previousExpenseCents, budget, plannedIncomeCents } =
    answerFigures(report)
  const max = Math.max(flow.incomeCents, expenseCents, plannedIncomeCents ?? 0)
  const saved = flow.netCents
  const target = report.savingsTargetCents
  return (
    <section
      aria-label="Le mois en bref"
      className="glass-card rounded-card space-y-4 p-4"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-12 shrink-0 place-items-center rounded-full text-white',
            saved >= 0 ? 'bg-chart-delta-good' : 'bg-chart-delta-bad',
          )}
        >
          <PiggyBankIcon aria-hidden className="size-[1rem]" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-3xl leading-none font-bold whitespace-nowrap tabular-nums',
              saved >= 0 ? 'text-chart-delta-good' : 'text-chart-delta-bad',
            )}
          >
            {saved > 0 && '+'}
            {formatWholeEuros(saved)}
          </p>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-sm">
            <span>
              {saved >= 0 ? 'épargnés' : 'dépensés en plus'}
              {flow.savingsRate !== null &&
                saved > 0 &&
                ` · ${formatPercent(flow.savingsRate)}`}
            </span>
            {target !== null && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 whitespace-nowrap',
                  saved >= target && 'text-chart-delta-good',
                )}
              >
                <TargetIcon aria-hidden className="size-[0.75rem]" />
                <span className="sr-only">objectif </span>
                {formatWholeEuros(target)}
              </span>
            )}
          </p>
        </div>
        {closed && (
          <span className="bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1 self-start rounded-full px-2.5 py-1 text-xs font-semibold">
            <LockIcon aria-hidden className="size-[0.65rem]" />
            Clôturé
          </span>
        )}
      </div>

      <Bar
        label="Revenus"
        cents={flow.incomeCents}
        max={max}
        color="var(--chart-delta-good)"
        mark={plannedIncomeCents}
      />
      <Bar
        label="Dépenses"
        cents={expenseCents}
        max={max}
        color="var(--chart-delta-bad)"
        extra={
          <Delta
            cents={expenseCents - previousExpenseCents}
            good={expenseCents <= previousExpenseCents}
          />
        }
      />

      {budget && (
        <div className="flex items-center gap-3">
          <WalletIcon
            aria-label="Budget"
            className="text-muted-foreground size-[0.9rem] shrink-0"
          />
          <div aria-hidden className="bg-glass-fill h-2 flex-1 rounded-full">
            <div
              className={cn(
                'h-full rounded-full',
                budget.spentCents > budget.targetCents
                  ? 'bg-chart-delta-bad'
                  : 'bg-primary',
              )}
              style={{
                width: `${Math.min(100, (budget.spentCents / Math.max(budget.targetCents, 1)) * 100)}%`,
              }}
            />
          </div>
          <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
            {formatWholeEuros(budget.spentCents)} /{' '}
            {formatWholeEuros(budget.targetCents)}
          </span>
        </div>
      )}
    </section>
  )
}

/**
 * The largest expense categories, each against the month before (and over
 * its target in red); « Tout voir » opens the whole report.
 */
export function TopCategories({
  report,
  onShowAll,
}: {
  report: MonthReportDto
  onShowAll: () => void
}) {
  const expenses = report.categories
    .filter((c) => c.kind === 'expense' && c.amountCents > 0)
    .sort((a, b) => b.amountCents - a.amountCents)
  if (expenses.length === 0) return null
  return (
    <section
      aria-label="Plus grosses dépenses"
      className="glass-card rounded-card space-y-1 p-2"
    >
      <ul className="space-y-1">
        {expenses.slice(0, TOP_CATEGORIES).map((category) => (
          <CategoryRow
            key={category.categoryId ?? 'none'}
            category={category}
          />
        ))}
      </ul>
      <Button
        variant="secondary"
        ghost
        size="sm"
        className="w-full"
        onClick={onShowAll}
      >
        Tout voir
      </Button>
    </section>
  )
}

function CategoryRow({ category }: { category: ReportCategoryDto }) {
  const over =
    category.targetCents !== null && category.amountCents > category.targetCents
  return (
    <li className="flex min-h-12 items-center gap-3 px-2 py-1">
      <CategoryIcon
        icon={category.icon}
        color={category.color}
        fallback={category.categoryId === null ? CircleHelpIcon : undefined}
      />
      <span className="min-w-0 flex-1 text-sm break-normal">
        {categoryName(category)}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span
          className={cn(
            'text-sm font-semibold whitespace-nowrap tabular-nums',
            over && 'text-chart-delta-bad',
          )}
        >
          {formatWholeEuros(category.amountCents)}
        </span>
        <Delta
          cents={category.amountCents - category.previousAmountCents}
          good={category.amountCents <= category.previousAmountCents}
        />
      </span>
    </li>
  )
}
