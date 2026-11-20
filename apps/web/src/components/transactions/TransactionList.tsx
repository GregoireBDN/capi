import { Button } from '@finances/ui'
import { useEffect, useRef } from 'react'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { formatDay } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { groupByDay } from './changes'
import { TransactionRow } from './TransactionRow'
import type { TransactionRowActions } from './TransactionRow'

interface TransactionListProps {
  items: readonly TransactionDto[]
  categories: readonly CategoryDto[]
  /** Group rows under day headers (date sorts only). */
  groupByDate: boolean
  /** Show each row's account (several open accounts, not filtered to one). */
  showAccount: boolean
  selected: ReadonlySet<string>
  onSelectedChange: (id: string, selected: boolean) => void
  /** Edits of one transaction (category, note, amount, split, ...). */
  actionsFor: (item: TransactionDto) => TransactionRowActions
  /** « Valider » of a row, while the list is filtered on « À revoir ». */
  onValidate?: (item: TransactionDto) => void
  remaining: number
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
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
  showAccount,
  selected,
  onSelectedChange,
  actionsFor,
  onValidate,
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
      showAccount={showAccount}
      onValidate={onValidate && (() => onValidate(item))}
    />
  )

  return (
    <div>
      {groupByDate ? (
        groupByDay(items).map((group) => {
          const heading = formatDay(group.date)
          return (
            <section
              key={group.date}
              aria-label={heading}
              className="not-first:[&>h2]:border-t"
            >
              {/* under the header (AppHeader, h-12) */}
              <h2 className="bg-muted/70 text-muted-foreground sticky top-(--app-top-bar,3rem) z-[1] flex items-baseline justify-between gap-3 border-b px-3 py-1.5 text-xs font-medium backdrop-blur">
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
              <ul className="divide-y px-1">{group.items.map(row)}</ul>
            </section>
          )
        })
      ) : (
        <ul className="divide-y px-1" aria-label="Opérations">
          {items.map(row)}
        </ul>
      )}

      {hasMore && (
        <div ref={sentinel} className="flex justify-center border-t p-3">
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
