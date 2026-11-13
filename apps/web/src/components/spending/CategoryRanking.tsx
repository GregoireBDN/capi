import { Button, cn, formatEuros, formatPercent } from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { ChevronDownIcon, ChevronRightIcon, ClockIcon } from 'lucide-react'
import { useState } from 'react'
import type { CategorySpendingDto } from '#/api/types.gen'
import { ROUTES } from '#/lib/routes'
import { Delta } from './Delta'
import {
  categoryColor,
  categoryKey,
  categoryLabel,
  UNCATEGORIZED_COLOR,
} from './labels'
import { isWithoutSpending, rowComparison, targetRatio } from './rows'
import type { Comparison } from './rows'
import { UNCATEGORIZED } from './search'

interface CategoryRankingProps {
  categories: readonly CategorySpendingDto[]
  /** Month shown (`YYYY-MM`), for the drill-down links. */
  month: string
  /** What each row's change is measured against. */
  comparison: Comparison
  /**
   * The same in words for screen readers, e.g. "par rapport à septembre":
   * the caption above the list says it once for everyone.
   */
  comparedWith: string
  /** Account filter, carried over to the drill-down. */
  accountId?: string
}

/** "850 € attendus" (singular under 2 €). */
function expectedText(cents: number): string {
  return `${formatEuros(cents)} ${cents >= 200 ? 'attendus' : 'attendu'}`
}

/**
 * Spent against the budget target (with the expected part lighter after
 * it), or against the month's total without a target.
 */
function RowBar({ item, color }: { item: CategorySpendingDto; color: string }) {
  const ratio = targetRatio(item)
  const over = ratio !== null && ratio > 1
  const spent = ratio ?? Math.min(1, Math.max(0, item.share))
  const expected =
    ratio === null || item.targetCents === null
      ? 0
      : Math.min(1 - Math.min(1, spent), item.expectedCents / item.targetCents)
  return (
    <div
      aria-hidden
      data-slot="category-bar"
      data-target={ratio === null ? undefined : over ? 'over' : 'within'}
      className="bg-muted flex h-1.5 overflow-hidden rounded-full"
    >
      <div
        className="h-full shrink-0"
        style={{
          width: `${Math.min(1, spent) * 100}%`,
          backgroundColor: over ? 'var(--chart-over)' : color,
        }}
      />
      {expected > 0 && (
        <div
          data-slot="category-bar-expected"
          className="h-full shrink-0 opacity-35"
          style={{ width: `${expected * 100}%`, backgroundColor: color }}
        />
      )}
    </div>
  )
}

function Row({
  item,
  month,
  comparison,
  comparedWith,
  accountId,
}: Omit<CategoryRankingProps, 'categories'> & {
  item: CategorySpendingDto
}) {
  const label = categoryLabel(item)
  const color = categoryColor(item) ?? UNCATEGORIZED_COLOR
  const ratio = targetRatio(item)
  const change = rowComparison(item, comparison)
  return (
    <li data-slot="category-row">
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
            <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
              {formatEuros(item.spentCents)}
            </span>
          </div>
          <RowBar item={item} color={color} />
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {ratio === null ? (
                <span data-slot="category-share" className="tabular-nums">
                  {formatPercent(Math.min(1, Math.max(0, item.share)))} du total
                </span>
              ) : (
                <span
                  data-slot="category-target"
                  className={cn(
                    'tabular-nums',
                    ratio > 1 && 'text-chart-delta-bad font-medium',
                  )}
                >
                  {formatPercent(ratio)} du budget (
                  <span className="whitespace-nowrap">
                    {formatEuros(item.targetCents!)}
                  </span>
                  )
                </span>
              )}
              {item.expectedCents > 0 && (
                <span
                  data-slot="expected"
                  className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums"
                >
                  <ClockIcon aria-hidden className="size-3.5 shrink-0" />
                  {expectedText(item.expectedCents)}
                </span>
              )}
            </span>
            {change.type === 'delta' && (
              <span className="ml-auto">
                <Delta cents={change.cents} />
                <span className="sr-only"> {comparedWith}</span>
              </span>
            )}
            {change.type === 'not-yet' && (
              // Not paid yet (e.g. the rent later in the month): a drop
              // here is not a saving, so no coloured delta.
              <span data-slot="not-yet" className="ml-auto">
                Pas encore ce mois-ci
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
}

/**
 * Categories ranked by spending. Each row reads in one glance: amount,
 * budget target (or share of the month), the recurring costs still expected
 * and one comparison. Categories without any spending this month are folded
 * away. Each row opens the month's expenses of that category on the
 * transactions page.
 */
export function CategoryRanking({
  categories,
  ...rowProps
}: CategoryRankingProps) {
  const [showEmpty, setShowEmpty] = useState(false)
  const spending = categories.filter((item) => !isWithoutSpending(item))
  const empty = categories.filter(isWithoutSpending)
  const shown = showEmpty ? [...spending, ...empty] : spending
  return (
    <div className="space-y-2">
      <ul className="divide-y" aria-label="Dépenses par catégorie">
        {shown.map((item) => (
          <Row key={categoryKey(item)} item={item} {...rowProps} />
        ))}
      </ul>
      {empty.length > 0 && (
        <Button
          variant="secondary"
          ghost
          size="sm"
          aria-expanded={showEmpty}
          onClick={() => setShowEmpty((open) => !open)}
        >
          <ChevronDownIcon
            aria-hidden
            className={cn('transition-transform', showEmpty && 'rotate-180')}
          />
          {showEmpty
            ? 'Masquer les catégories sans dépense'
            : `Afficher les catégories sans dépense (${empty.length})`}
        </Button>
      )}
    </div>
  )
}
