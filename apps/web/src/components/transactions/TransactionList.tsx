import { Button, cn } from '@finances/ui'
import { useEffect, useRef } from 'react'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { formatDay } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { groupByDay } from './changes'
import { ROW_GRID, TransactionRow } from './TransactionRow'
import type { TransactionRowActions } from './TransactionRow'

interface TransactionListProps {
  items: readonly TransactionDto[]
  categories: readonly CategoryDto[]
  /** Group rows under day headers (date sorts only). */
  groupByDate: boolean
  selected: ReadonlySet<string>
  onSelectedChange: (id: string, selected: boolean) => void
  /** Edits of one transaction (category, note, amount, split, ...). */
  actionsFor: (item: TransactionDto) => TransactionRowActions
  remaining: number
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}

/** Desktop column titles, aligned with `ROW_GRID`. */
function ColumnHeaders() {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'text-muted-foreground hidden px-1 text-xs @xl:grid',
        ROW_GRID,
      )}
    >
      <span />
      <span className="px-2">Libellé</span>
      <span>Catégorie</span>
      <span>Compte</span>
      <span />
      <span className="text-right">Montant</span>
    </div>
  )
}

/**
 * The loaded transactions, grouped by day with the day's net (transfers
 * excluded) when sorted by date. More pages load when the end of the list
 * scrolls into view, or with "Charger plus". On wide pages the rows are
 * edited in place.
 */
export function TransactionList({
  items,
  categories,
  groupByDate,
  selected,
  onSelectedChange,
  actionsFor,
  remaining,
  hasMore,
  loadingMore,
  onLoadMore,
}: TransactionListProps) {
  const sentinel = useRef<HTMLDivElement>(null)
  const loadMore = useRef(onLoadMore)
  loadMore.current = onLoadMore

  useEffect(() => {
    const element = sentinel.current
    if (!element || !hasMore || typeof IntersectionObserver === 'undefined') {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore.current()
      },
      { rootMargin: '400px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasMore])

  const row = (item: TransactionDto) => (
    <TransactionRow
      key={item.id}
      item={item}
      categories={categories}
      selected={selected.has(item.id)}
      onSelectedChange={(on) => onSelectedChange(item.id, on)}
      {...actionsFor(item)}
      showDate={!groupByDate}
    />
  )

  return (
    <div className="space-y-4">
      <ColumnHeaders />
      {groupByDate ? (
        groupByDay(items).map((group) => {
          const heading = formatDay(group.date)
          return (
            <section key={group.date} aria-label={heading}>
              {/* under the top bar (AppTopBar, h-12) when it shows */}
              <h2 className="bg-background/95 sticky top-(--app-top-bar,3rem) z-[1] flex items-baseline justify-between gap-3 border-b px-3 py-1.5 text-xs font-medium backdrop-blur">
                <time dateTime={group.date}>{heading}</time>
                {group.hasTotal && (
                  <span
                    className="text-muted-foreground whitespace-nowrap tabular-nums"
                    title="Total du jour, mouvements internes exclus"
                  >
                    {formatCents(group.totalCents)}
                  </span>
                )}
              </h2>
              <ul className="divide-y">{group.items.map(row)}</ul>
            </section>
          )
        })
      ) : (
        <ul className="divide-y" aria-label="Opérations">
          {items.map(row)}
        </ul>
      )}

      {hasMore && (
        <div ref={sentinel} className="flex justify-center">
          <Button
            outline
            variant="secondary"
            loading={loadingMore}
            onClick={onLoadMore}
          >
            Charger plus ({remaining} restantes)
          </Button>
        </div>
      )}
    </div>
  )
}
