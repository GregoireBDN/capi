import { Button, Card, CardContent, CardHeader, CardTitle } from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { PlusIcon } from 'lucide-react'
import type { UnbudgetedSpendingDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import { CategoryDot } from './CategoryDot'

interface UnbudgetedCardProps {
  month: string
  unbudgeted: UnbudgetedSpendingDto
  onAdd: (categoryId: string) => void
}

/** Biggest expenses of the month outside any budget, with a shortcut to add one. */
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
                className="flex items-center gap-2 py-1.5"
              >
                <Link
                  to={ROUTES.transactions}
                  search={{
                    month,
                    category: row.categoryId ?? 'none',
                    kind: 'expense',
                  }}
                  // 44px hit area on touch screens, inside the row padding.
                  className="relative flex min-w-0 flex-1 items-center gap-2 text-sm hover:underline pointer-coarse:touch-hitbox"
                >
                  <CategoryDot color={row.color} />
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
                    size="sm"
                    aria-label={`Ajouter un budget ${name}`}
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
