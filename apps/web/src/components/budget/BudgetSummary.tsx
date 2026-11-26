import { Card, CardContent, ProgressMeter } from '@capi/ui'
import type { BudgetMonthDto } from '#/api/types.gen'
import { formatCents, formatWholeEuros } from '#/lib/money'
import { formatBudgetAmount } from './amount'
import { plural } from '#/lib/plural'

/** Share of a target from which a budget is flagged (same rule as the API). */
export const WARNING_THRESHOLD = 0.8

function Stat({
  label,
  value,
  detail,
  bad = false,
}: {
  label: string
  value: string
  detail?: string
  bad?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={
          bad
            ? 'text-chart-delta-bad truncate font-semibold tabular-nums'
            : 'truncate font-semibold tabular-nums'
        }
      >
        {value}
      </dd>
      {detail && (
        <dd className="text-muted-foreground truncate text-xs">{detail}</dd>
      )}
    </div>
  )
}

/** Month at a glance: total spent vs budgeted, remaining, overruns. */
export function BudgetSummary({ data }: { data: BudgetMonthDto }) {
  const { totals, unbudgeted } = data
  const over = totals.remainingCents < 0
  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        {totals.envelopePaidCents > 0 && (
          <p className="text-sm">
            <span className="text-muted-foreground">Dépensé </span>
            <span className="font-semibold tabular-nums">
              {formatWholeEuros(totals.spentCents)}
            </span>
            <span className="text-muted-foreground block text-xs">
              {formatWholeEuros(totals.spentCents - totals.envelopePaidCents)}{' '}
              sur un budget de {formatWholeEuros(totals.targetCents)} ·{' '}
              {formatWholeEuros(totals.envelopePaidCents)} par une enveloppe
            </span>
          </p>
        )}
        <ProgressMeter
          label="Total"
          // The envelopes' part is theirs (#430): the budget's own share.
          value={totals.spentCents - totals.envelopePaidCents}
          target={totals.targetCents}
          valueFormatter={formatBudgetAmount}
          warningThreshold={WARNING_THRESHOLD}
          hideStatus
        />
        <dl className="grid grid-cols-2 gap-3 @lg:grid-cols-3">
          <Stat
            label={over ? 'Dépassement' : 'Reste'}
            value={formatCents(Math.abs(totals.remainingCents))}
            bad={over}
            detail={`${Math.round(totals.percentUsed)} % utilisé`}
          />
          <Stat
            label="En dépassement"
            value={`${totals.overCount} / ${totals.budgetCount}`}
            bad={totals.overCount > 0}
            detail={
              totals.warningCount > 0
                ? `${totals.warningCount} à surveiller`
                : undefined
            }
          />
          <Stat
            label="Hors budget"
            value={formatCents(unbudgeted.totalCents)}
            detail={
              unbudgeted.categoryCount > 0
                ? plural(unbudgeted.categoryCount, 'catégorie')
                : undefined
            }
          />
        </dl>
      </CardContent>
    </Card>
  )
}
