import { formatEuros, formatPercent } from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { ChevronRightIcon } from 'lucide-react'
import type { CategorySpendingDto } from '#/api/types.gen'
import { plural } from '#/lib/plural'
import { ROUTES } from '#/lib/routes'
import { Delta } from './Delta'
import {
  categoryColor,
  categoryKey,
  categoryLabel,
  UNCATEGORIZED_COLOR,
} from './labels'
import { UNCATEGORIZED } from './search'

interface CategoryRankingProps {
  categories: readonly CategorySpendingDto[]
  /** Month shown (`YYYY-MM`), for the drill-down links. */
  month: string
  /**
   * What the month is compared with: the previous month ("octobre"), or its
   * same first days while the month is partial ("1–3 oct.").
   */
  previousLabel: string
  /** Account filter, carried over to the drill-down. */
  accountId?: string
}

/**
 * Categories ranked by spending. Each row opens the month's expenses of that
 * category on the transactions page.
 */
export function CategoryRanking({
  categories,
  month,
  previousLabel,
  accountId,
}: CategoryRankingProps) {
  return (
    <ul className="divide-y" aria-label="Dépenses par catégorie">
      {categories.map((item) => {
        const label = categoryLabel(item)
        const color = categoryColor(item) ?? UNCATEGORIZED_COLOR
        const share = Math.min(1, Math.max(0, item.share))
        return (
          <li key={categoryKey(item)}>
            <Link
              to={ROUTES.transactions}
              search={{
                month,
                category: item.categoryId ?? UNCATEGORIZED,
                kind: 'expense',
                ...(accountId ? { account: accountId } : {}),
              }}
              aria-label={`${label} : ${formatEuros(item.spentCents)}, voir les opérations`}
              className="hover:bg-muted/60 focus-visible:outline-ring flex items-center gap-2 rounded-lg px-2 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {label}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatEuros(item.spentCents)}
                  </span>
                </div>
                <div
                  aria-hidden
                  className="bg-muted h-1 overflow-hidden rounded-full"
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${share * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
                  <span className="tabular-nums">
                    {formatPercent(share)} ·{' '}
                    {plural(item.transactionCount, 'opération', 'opérations')}
                  </span>
                  {item.notYetThisMonth ? (
                    // Not paid yet (e.g. the rent later in the month): a
                    // drop here is not a saving, so no coloured delta.
                    <span data-slot="not-yet" className="text-right">
                      Pas encore ce mois-ci ·{' '}
                      <span className="whitespace-nowrap tabular-nums">
                        {formatEuros(item.previousSpentCents)}
                      </span>{' '}
                      au {previousLabel}
                    </span>
                  ) : (
                    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-0.5">
                      <Delta
                        cents={item.deltaCents}
                        suffix={`vs ${previousLabel}`}
                      />
                      {item.averageCents !== null && (
                        <Delta
                          cents={item.spentCents - item.averageCents}
                          suffix="vs moy."
                        />
                      )}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRightIcon
                aria-hidden
                className="text-muted-foreground size-4 shrink-0"
              />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
