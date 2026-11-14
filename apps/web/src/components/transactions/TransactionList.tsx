import { Button, cn, Kbd } from '@finances/ui'
import { useEffect, useRef, useState } from 'react'
import type { CategoryDto, TransactionDto } from '#/api/types.gen'
import { formatDay } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { groupByDay } from './changes'
import { rowShortcut } from './keyboard'
import { ROW_GRID, TransactionRow } from './TransactionRow'
import type { InlineField, TransactionRowActions } from './TransactionRow'

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

/** Keyboard shortcuts of the list, shown on wide pages. */
function ShortcutHint() {
  const shortcuts: [keys: string[], label: string][] = [
    [['↑', '↓'], 'naviguer'],
    [['Entrée'], 'modifier'],
    [['C'], 'catégorie'],
    [['N'], 'note'],
    [['O'], 'ponctuelle'],
    [['M'], 'montant (saisie à la main)'],
    [['X'], 'sélectionner'],
    [['⌘/Ctrl', 'Z'], 'annuler'],
  ]
  return (
    <p className="text-muted-foreground hidden flex-wrap gap-x-3 gap-y-1 px-3 text-xs @xl:flex">
      {shortcuts.map(([keys, label]) => (
        <span key={label} className="inline-flex items-center gap-1">
          {keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
          {label}
        </span>
      ))}
    </p>
  )
}

/**
 * The loaded transactions, grouped by day with the day's net (transfers
 * excluded) when sorted by date. More pages load when the end of the list
 * scrolls into view, or with "Charger plus". On wide pages the rows are
 * edited in place and with the keyboard (`rowShortcut`).
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
  const container = useRef<HTMLDivElement>(null)
  const loadMore = useRef(onLoadMore)
  loadMore.current = onLoadMore
  const [inline, setInline] = useState<{
    id: string
    field: InlineField
  } | null>(null)

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

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    const rowElement = target.closest<HTMLElement>('[data-transaction-row]')
    if (!rowElement) return
    const action = rowShortcut(event, target)
    if (!action) return
    const id = rowElement.dataset.transactionRow!
    const item = items.find((candidate) => candidate.id === id)
    if (!item) return
    event.preventDefault()

    const rows = [
      ...(container.current?.querySelectorAll<HTMLElement>(
        '[data-transaction-row]',
      ) ?? []),
    ]
    const index = rows.indexOf(rowElement)
    const focusRow = (row: HTMLElement | undefined) =>
      row?.querySelector<HTMLElement>('[data-row-trigger]')?.focus()

    switch (action) {
      case 'next':
        focusRow(rows[index + 1])
        break
      case 'previous':
        focusRow(rows[index - 1])
        break
      case 'category':
        rowElement
          .querySelector<HTMLElement>('[data-inline-category] select')
          ?.focus()
        break
      case 'note':
        setInline({ id, field: 'note' })
        break
      case 'amount':
        if (item.manual) setInline({ id, field: 'amount' })
        break
      case 'oneOff':
        actionsFor(item).onChange({ isOneOff: !item.isOneOff })
        break
      case 'select':
        onSelectedChange(id, !selected.has(id))
        break
      case 'leave':
        focusRow(rowElement)
        break
    }
  }

  const row = (item: TransactionDto) => (
    <TransactionRow
      key={item.id}
      item={item}
      categories={categories}
      selected={selected.has(item.id)}
      onSelectedChange={(on) => onSelectedChange(item.id, on)}
      {...actionsFor(item)}
      showDate={!groupByDate}
      inline={inline?.id === item.id ? inline.field : null}
      onInlineChange={(field) =>
        setInline(field === null ? null : { id: item.id, field })
      }
    />
  )

  return (
    // Keyboard shortcuts bubble up from the focused row.
    <div ref={container} className="space-y-4" onKeyDown={onKeyDown}>
      <ShortcutHint />
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
