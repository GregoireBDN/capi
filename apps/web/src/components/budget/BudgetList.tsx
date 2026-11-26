import { Button, CategoryIcon, cn, ProgressMeter } from '@capi/ui'
import { Link } from '@tanstack/react-router'
import { PencilIcon } from 'lucide-react'
import type { BudgetLineDto } from '#/api/types.gen'
import { formatCents, formatWholeEuros } from '#/lib/money'
import { formatBudgetAmount } from './amount'
import { ROUTES } from '#/lib/routes'
import { WARNING_THRESHOLD } from './BudgetSummary'

interface BudgetListProps {
  month: string
  /** Budgeted categories, highest share used first (API order). */
  items: readonly BudgetLineDto[]
  onEdit: (item: BudgetLineDto) => void
}

/**
 * One meter per budgeted category. Tapping a row opens its expenses of the
 * month on the transactions page (same filters as the spent amount); the
 * pencil edits the target.
 */
export function BudgetList({ month, items, onEdit }: BudgetListProps) {
  return (
    <ul className="space-y-2" aria-label="Budgets par catégorie">
      {items.map((item) => {
        // Prepaid subscription payments (#314) are left out of averages
        // like one-offs, but named apart: why the month is over.
        const prepaid = item.prepaid.map(
          (p) =>
            `dont ${formatCents(p.amountCents)} prépayés pour ${p.termMonths} mois`,
        )
        const oneOffs =
          item.spentCents -
          item.spentExcludingOneOffsCents -
          item.prepaid.reduce((sum, p) => sum + p.amountCents, 0)
        return (
          <li
            key={item.categoryId}
            data-status={item.status}
            className={cn(
              'bg-card flex items-start gap-1 rounded-xl border p-1',
              item.status === 'over' && 'border-chart-over/50 bg-chart-over/5',
            )}
          >
            <Link
              to={ROUTES.transactions}
              search={{ month, category: item.categoryId, kind: 'expense' }}
              aria-label={`Opérations ${item.name}`}
              className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-2 outline-none focus-visible:ring-[3px]"
            >
              <CategoryIcon icon={item.icon} color={item.color} />
              <span className="min-w-0 flex-1 space-y-1">
                <ProgressMeter
                  label={item.name}
                  // What the month's budget paid itself: what envelopes
                  // paid adds to the target (#430, ADR 0008 §5).
                  value={item.spentCents - item.envelopePaidCents}
                  target={item.targetCents}
                  // Compact amounts keep the name readable on a phone.
                  valueFormatter={formatBudgetAmount}
                  warningThreshold={WARNING_THRESHOLD}
                />
                {item.envelopes.length > 0 && (
                  <span className="text-muted-foreground block text-xs">
                    {item.envelopes
                      .map(
                        (paid) =>
                          `+ ${formatWholeEuros(paid.paidCents)} par ${paid.name}`,
                      )
                      .join(' · ')}
                  </span>
                )}
                {(oneOffs !== 0 ||
                  prepaid.length > 0 ||
                  item.note ||
                  item.tracked) && (
                  <span
                    className={cn(
                      'text-muted-foreground block text-xs',
                      // A prepaid line is the explanation: never cut it.
                      prepaid.length > 0 ? 'break-normal' : 'truncate',
                    )}
                  >
                    {[
                      item.tracked && 'Suivi pendant le mois',
                      ...prepaid,
                      oneOffs !== 0 &&
                        `dont exceptionnel ${formatCents(oneOffs)}`,
                      item.note,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </span>
            </Link>
            <Button
              variant="secondary"
              ghost
              iconOnly
              aria-label={`Modifier le budget ${item.name}`}
              onClick={() => onEdit(item)}
            >
              <PencilIcon />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
