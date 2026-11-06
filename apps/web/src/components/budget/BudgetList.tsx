import { Button, cn, ProgressMeter } from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { PencilIcon } from 'lucide-react'
import type { BudgetLineDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { formatBudgetAmount } from './amount'
import { ROUTES } from '#/lib/routes'
import { CategoryDot } from './CategoryDot'
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
        const oneOffs = item.spentCents - item.spentExcludingOneOffsCents
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
              className="hover:bg-muted/50 focus-visible:ring-ring/50 flex min-w-0 flex-1 items-start gap-2 rounded-lg p-2 outline-none focus-visible:ring-[3px]"
            >
              <span className="mt-1.5 flex">
                <CategoryDot color={item.color} />
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <ProgressMeter
                  label={item.name}
                  value={item.spentCents}
                  target={item.targetCents}
                  // Compact amounts keep the name readable on a phone.
                  valueFormatter={formatBudgetAmount}
                  warningThreshold={WARNING_THRESHOLD}
                />
                {(oneOffs !== 0 || item.note) && (
                  <span className="text-muted-foreground block truncate text-xs">
                    {oneOffs !== 0 && `dont ponctuel ${formatCents(oneOffs)}`}
                    {oneOffs !== 0 && item.note && ' · '}
                    {item.note}
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
