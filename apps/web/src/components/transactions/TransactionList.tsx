import { Button, cn } from '@finances/ui'
import { useEffect, useRef } from 'react'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { formatDay } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { groupByDay } from './changes'
import type { TransactionChanges } from './changes'
import { ROW_GRID, TransactionRow } from './TransactionRow'

interface TransactionListProps {
  items: readonly TransactionDto[]
  categories: readonly CategoryDto[]
  /** Group rows under day headers (date sorts only). */
  groupByDate: boolean
  selected: ReadonlySet<string>
  onSelectedChange: (id: string, selected: boolean) => void
  onChange: (item: TransactionDto, changes: TransactionChanges) => void
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
      className="text-muted-foreground hidden items-center gap-1 px-1 text-xs @2xl:flex"
    >
      <span className="m-2 size-4" />
      <span className={cn('flex-1 px-2', ROW_GRID)}>
        <span>Libellé</span>
        <span>Catégorie</span>
        <span>Compte</span>
        <span />
        <span className="text-right">Montant</span>
      </span>
    </div>
  )
}

/**
 * The loaded transactions, grouped by day with the day's net (transfers
 * excluded) when sorted by date. More pages load when the end of the list
 * scrolls into view, or with "Charger plus".
 */
export function TransactionList({
  items,
  categories,
  groupByDate,
  selected,
  onSelectedChange,
  onChange,
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
      onChange={(changes) => onChange(item, changes)}
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
              <h2 className="bg-background/95 sticky top-14 z-[1] flex items-baseline justify-between gap-3 border-b px-3 py-1.5 text-xs font-medium backdrop-blur md:top-0">
                <time dateTime={group.date}>{heading}</time>
                {group.hasTotal && (
                  <span
                    className="text-muted-foreground tabular-nums"
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
