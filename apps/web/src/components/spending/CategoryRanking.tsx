import { Button, cn, formatEuros, formatPercent } from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { ChevronDownIcon, ChevronRightIcon, ClockIcon } from 'lucide-react'
import { useState } from 'react'
import type { CategorySpendingDto, SpendingKind } from '#/api/types.gen'
import { ROUTES } from '#/lib/routes'
import { DIVIDED_LIST, ROW_BUTTON } from '#/lib/row-list'
import { Delta } from './Delta'
import { INCREASE_IS_GOOD, KIND_LABEL, RANKING_TITLE, ROW_NOUN } from './kinds'
import {
  categoryColor,
  categoryKey,
  categoryLabel,
  UNCATEGORIZED_COLOR,
} from './labels'
import { isWithoutSpending, rowComparison, targetRatio } from './rows'
import { SpendingCategoryIcon } from './SpendingCategoryIcon'
import type { Comparison } from './rows'
import { UNCATEGORIZED } from './search'

interface CategoryRankingProps {
  /** Expenses, income (per category) or savings (per account). */
  kind: SpendingKind
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
function RowBar({
  item,
  color,
  kind,
}: {
  item: CategorySpendingDto
  color: string
  kind: SpendingKind
}) {
  const ratio = targetRatio(item)
  // Only an expense target can be overrun; more income than planned is fine.
  const over = kind === 'expense' && ratio !== null && ratio > 1
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

/**
 * Where a row's operations are: its category's expenses or income; for an
 * Épargne row, the transfers of its savings account (an investment has no
 * operations of its own: the month's transfers).
 */
function operationsSearch(
  item: CategorySpendingDto,
  kind: SpendingKind,
  month: string,
  accountId: string | undefined,
) {
  if (kind === 'savings') {
    return item.accountType === 'savings' && item.accountId
      ? { month, kind: 'transfer' as const, account: item.accountId }
      : { month, kind: 'transfer' as const }
  }
  return {
    month,
    category: item.categoryId ?? UNCATEGORIZED,
    kind,
    ...(accountId ? { account: accountId } : {}),
  }
}

/** An Épargne row's detail: what went in and out, or the account's kind. */
function movesText(item: CategorySpendingDto): string {
  if (item.outCents) {
    return `Versé ${formatEuros(item.inCents ?? 0)} · retiré ${formatEuros(item.outCents)}`
  }
  if (item.accountId === null) return 'Placements'
  return item.accountType === 'savings' ? 'Livret' : 'Placement'
}

function Row({
  item,
  kind,
  month,
  comparison,
  comparedWith,
  accountId,
}: Omit<CategoryRankingProps, 'categories'> & {
  item: CategorySpendingDto
}) {
  const label = categoryLabel(item, kind)
  const color = categoryColor(item) ?? UNCATEGORIZED_COLOR
  const ratio = targetRatio(item)
  const change = rowComparison(item, comparison)
  return (
    <li data-slot="category-row">
      <Link
        to={ROUTES.transactions}
        search={operationsSearch(item, kind, month, accountId)}
        aria-label={`${label} : ${formatEuros(item.spentCents)}, voir les opérations`}
        className={cn(ROW_BUTTON, 'flex items-center gap-2.5 px-2 py-2.5')}
      >
        <SpendingCategoryIcon item={item} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {label}
            </span>
            <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
              {formatEuros(item.spentCents)}
            </span>
          </div>
          <RowBar item={item} color={color} kind={kind} />
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {kind === 'savings' ? (
                <span data-slot="category-moves" className="tabular-nums">
                  {movesText(item)}
                </span>
              ) : ratio === null ? (
                <span data-slot="category-share" className="tabular-nums">
                  {formatPercent(Math.min(1, Math.max(0, item.share)))} du total
                </span>
              ) : (
                <span
                  data-slot="category-target"
                  className={cn(
                    'tabular-nums',
                    // Over an expense target is bad news; over planned
                    // income is not.
                    kind === 'expense' &&
                      ratio > 1 &&
                      'text-chart-delta-bad font-medium',
                  )}
                >
                  {formatPercent(ratio)}{' '}
                  {kind === 'expense' ? 'du budget' : 'du prévu'} (
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
                <Delta
                  cents={change.cents}
                  increaseIsGood={INCREASE_IS_GOOD[kind]}
                />
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
      <ul
        className={DIVIDED_LIST}
        aria-label={`${KIND_LABEL[rowProps.kind]} ${RANKING_TITLE[rowProps.kind].toLowerCase()}`}
      >
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
            ? `Masquer ${ROW_NOUN[rowProps.kind]}`
            : `Afficher ${ROW_NOUN[rowProps.kind]} (${empty.length})`}
        </Button>
      )}
    </div>
  )
}
