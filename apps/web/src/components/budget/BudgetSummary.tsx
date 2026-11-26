import { AnswerFigure, cn, ProgressMeter } from '@capi/ui'
import { TargetIcon } from 'lucide-react'
import type { BudgetMonthDto } from '#/api/types.gen'
import { formatWholeEuros } from '#/lib/money'
import { formatBudgetAmount } from './amount'

/** Share of a target from which a budget is flagged (same rule as the API). */
export const WARNING_THRESHOLD = 0.8

function Count({
  count,
  label,
  tone,
}: {
  count: number
  label: string
  tone: 'bad' | 'warning'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-medium',
        tone === 'bad'
          ? 'text-chart-delta-bad bg-[color-mix(in_srgb,var(--chart-delta-bad)_14%,transparent)]'
          : 'text-warning-foreground dark:text-warning bg-[color-mix(in_srgb,var(--warning)_22%,transparent)]',
      )}
    >
      <b className="tabular-nums">{count}</b> {label}
    </span>
  )
}

/**
 * Budget's big figure (#434, the owner's « A. Le chiffre réponse »): what
 * is left to spend this month (or the overrun), the budget's own share
 * against its targets (what envelopes paid is theirs, #430), and how many
 * lines are over or near their target. What lies outside the budget is
 * the « Hors budget » card's; what was spent per category, Mouvements'.
 */
export function BudgetSummary({ data }: { data: BudgetMonthDto }) {
  const { totals } = data
  const over = totals.remainingCents < 0
  const near = !over && totals.percentUsed >= WARNING_THRESHOLD * 100
  return (
    <AnswerFigure
      data-slot="budget-answer"
      icon={<TargetIcon />}
      label={over ? 'Dépassement' : 'Reste à dépenser'}
      value={formatWholeEuros(Math.abs(totals.remainingCents))}
      tone={over ? 'bad' : near ? 'warning' : 'good'}
    >
      <ProgressMeter
        label="Total"
        // The envelopes' part is theirs (#430): the budget's own share.
        value={totals.spentCents - totals.envelopePaidCents}
        target={totals.targetCents}
        valueFormatter={formatBudgetAmount}
        warningThreshold={WARNING_THRESHOLD}
        hideStatus
      />
      {(totals.overCount > 0 || totals.warningCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {totals.overCount > 0 && (
            <Count
              count={totals.overCount}
              label={totals.overCount > 1 ? 'dépassés' : 'dépassé'}
              tone="bad"
            />
          )}
          {totals.warningCount > 0 && (
            <Count
              count={totals.warningCount}
              label="à surveiller"
              tone="warning"
            />
          )}
        </div>
      )}
    </AnswerFigure>
  )
}
