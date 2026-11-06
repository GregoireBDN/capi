import { Badge } from '@finances/ui'
import {
  ChevronRightIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react'
import type { RecurringItemDto } from '#/api/types.gen'
import { CategoryDot } from '#/components/budget/CategoryDot'
import { formatCents } from '#/lib/money'
import {
  CADENCE_LABELS,
  formatAmountPerPeriod,
  formatPriceChange,
  formatRelativeDay,
} from './format'

interface RecurringListProps {
  title: string
  description?: string
  items: RecurringItemDto[]
  today: string
  onEdit: (item: RecurringItemDto) => void
}

function NextDate({ item, today }: { item: RecurringItemDto; today: string }) {
  if (!item.active)
    return <>Dernière fois {formatRelativeDay(item.lastSeenDate, today)}</>
  if (!item.nextExpectedDate) return null
  const late = item.nextExpectedDate < today
  return (
    <>
      {late ? 'Attendu ' : 'Prochain '}
      {formatRelativeDay(item.nextExpectedDate, today)}
    </>
  )
}

/**
 * One group of confirmed items. Each row shows the actual amount per period
 * and, when the cadence is not monthly, its monthly equivalent; the next
 * expected date; a badge when the price changed or the series stopped.
 * Tapping a row opens the editor.
 */
export function RecurringList({
  title,
  description,
  items,
  today,
  onEdit,
}: RecurringListProps) {
  if (items.length === 0) return null
  const headingId = `recurring-${title.replace(/\W+/g, '-').toLowerCase()}`
  const credit = items[0].direction === 'credit'
  const activeYearly = items
    .filter((item) => item.active)
    .reduce((sum, item) => sum + item.yearlyCostCents, 0)
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={headingId} className="font-semibold">
          {title}
        </h3>
        <span className="text-muted-foreground shrink-0 text-sm whitespace-nowrap tabular-nums">
          {formatCents(Math.round(activeYearly / 12))} / mois
        </span>
      </div>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
      <ul className="bg-card divide-y rounded-xl border">
        {items.map((item) => {
          const priceChange = formatPriceChange(item, today)
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onEdit(item)}
                aria-label={`Modifier ${item.name}`}
                data-active={item.active}
                className="hover:bg-muted/50 focus-visible:ring-ring/50 flex w-full min-w-0 items-start gap-2 p-3 text-left outline-none first:rounded-t-xl last:rounded-b-xl focus-visible:ring-[3px] data-[active=false]:opacity-70"
              >
                <span className="mt-1.5 flex">
                  <CategoryDot color={item.categoryColor} />
                </span>
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="min-w-0 font-medium break-words">
                      {item.name}
                    </span>
                    <span className="ml-auto shrink-0 font-semibold tabular-nums">
                      {credit ? '+' : ''}
                      {formatAmountPerPeriod(item)}
                    </span>
                  </span>
                  <span className="text-muted-foreground flex flex-wrap justify-between gap-x-2 text-xs">
                    <span className="truncate">
                      {CADENCE_LABELS[item.cadence]}
                      {item.categoryName ? ` · ${item.categoryName}` : ''}
                    </span>
                    {item.cadence !== 'monthly' && (
                      <span className="ml-auto shrink-0 tabular-nums">
                        ≈ {formatCents(item.monthlyEquivalentCents)} / mois
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    <NextDate item={item} today={today} />
                  </span>
                  {(priceChange || !item.active) && (
                    <span className="flex flex-wrap gap-1.5 pt-1">
                      {priceChange && (
                        <Badge
                          variant={
                            (item.priceChangeCents ?? 0) > 0 === !credit
                              ? 'warning'
                              : 'success'
                          }
                          outline
                        >
                          {(item.priceChangeCents ?? 0) > 0 ? (
                            <TrendingUpIcon aria-hidden="true" />
                          ) : (
                            <TrendingDownIcon aria-hidden="true" />
                          )}
                          {priceChange}
                        </Badge>
                      )}
                      {!item.active && (
                        <Badge variant="secondary" outline>
                          Inactif
                        </Badge>
                      )}
                    </span>
                  )}
                </span>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="text-muted-foreground mt-1 size-4 shrink-0"
                />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
