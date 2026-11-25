import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CategoryIcon,
} from '@capi/ui'
import { Link } from '@tanstack/react-router'
import { CircleHelpIcon, PlusIcon } from 'lucide-react'
import type { UnbudgetedSpendingDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'

interface UnbudgetedCardProps {
  month: string
  unbudgeted: UnbudgetedSpendingDto
  onAdd: (categoryId: string) => void
}

/**
 * Biggest expenses of the month outside any budget. Each row opens its
 * expenses; a category that can take a budget ends its row with one 44px
 * « + » named « Fixer un objectif pour … » (#288).
 */
export function UnbudgetedCard({
  month,
  unbudgeted,
  onAdd,
}: UnbudgetedCardProps) {
  if (unbudgeted.top.length === 0) return null
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2">
          <span>Hors budget</span>
          <span className="tabular-nums">
            {formatCents(unbudgeted.totalCents)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y" aria-label="Dépenses hors budget">
          {unbudgeted.top.map((row) => {
            const name = row.name ?? 'Sans catégorie'
            return (
              <li
                key={row.categoryId ?? 'none'}
                className="flex items-center gap-1 py-0.5"
              >
                <Link
                  to={ROUTES.transactions}
                  search={{
                    month,
                    category: row.categoryId ?? 'none',
                    kind: 'expense',
                  }}
                  // The row's height (44px): a target of its own.
                  className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-sm hover:underline"
                >
                  <CategoryIcon
                    icon={row.icon}
                    color={row.color}
                    fallback={row.categoryId ? undefined : CircleHelpIcon}
                    size="sm"
                  />
                  <span className={row.name ? 'truncate' : 'truncate italic'}>
                    {name}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums">
                    {formatCents(row.spentCents)}
                  </span>
                </Link>
                {row.budgetable && row.categoryId && (
                  <Button
                    variant="secondary"
                    ghost
                    iconOnly
                    aria-label={`Fixer un objectif pour ${name}`}
                    title="Fixer un objectif"
                    onClick={() => onAdd(row.categoryId!)}
                  >
                    <PlusIcon />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
