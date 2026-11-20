import { Badge, cn } from '@finances/ui'
import {
  BanIcon,
  ChevronRightIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type { RecurringItemDto } from '#/api/types.gen'
import { RecurringCategoryIcon } from './RecurringCategoryIcon'
import { formatCents } from '#/lib/money'
import { ROW_BUTTON, ROW_LIST } from '#/lib/row-list'
import {
  CADENCE_LABELS,
  formatAmountPerPeriod,
  daysBetween,
  formatChargedAfterEnd,
  formatDayMonth,
  formatEnd,
  formatPrepaid,
  formatPriceChange,
  formatRelativeDay,
  periodAfter,
  shareText,
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
  const { endedOn } = item
  if (endedOn !== null && item.nextExpectedDate >= endedOn)
    return item.termMonths ? (
      <>
        Payé jusqu’au {formatDayMonth(item.nextExpectedDate, today)}, pas de
        renouvellement
      </>
    ) : (
      <>Plus de prélèvement attendu</>
    )
  const late = item.nextExpectedDate < today
  if (item.termMonths) {
    // A renewal is years away: its date says more than « dans 412 jours ».
    const soon = Math.abs(daysBetween(today, item.nextExpectedDate)) <= 30
    return (
      <>
        Renouvellement{' '}
        {soon
          ? formatRelativeDay(item.nextExpectedDate, today)
          : `le ${formatDayMonth(item.nextExpectedDate, today)}`}
      </>
    )
  }
  const last =
    endedOn !== null && periodAfter(item, item.nextExpectedDate) >= endedOn
  return (
    <>
      {late ? 'Attendu ' : 'Prochain '}
      {formatRelativeDay(item.nextExpectedDate, today)}
      {last ? ' · dernière échéance' : ''}
    </>
  )
}

/** Warning badge of a charge booked on or after the end date. */
export function ChargedAfterEndBadge({
  item,
  today,
}: {
  item: RecurringItemDto
  today: string
}) {
  const label = formatChargedAfterEnd(item, today)
  if (!label) return null
  return (
    <Badge
      variant="warning"
      outline
      // Long: wraps on narrow phones rather than being clipped.
      className="h-auto min-h-5 max-w-full shrink rounded-lg py-0.5 text-left whitespace-normal"
    >
      <TriangleAlertIcon aria-hidden="true" />
      {label}
    </Badge>
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
    .filter((item) => item.active && !item.ended)
    // The owner's part of an item shared with a contact (#359).
    .reduce((sum, item) => sum + item.ownYearlyCostCents, 0)
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
      <ul className={cn('bg-card', ROW_LIST)}>
        {items.map((item) => {
          const priceChange = formatPriceChange(item, today)
          const end = formatEnd(item, today)
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onEdit(item)}
                aria-label={`Modifier ${item.name}`}
                data-active={item.active}
                className={cn(
                  ROW_BUTTON,
                  'flex min-w-0 items-start gap-2 p-3 data-[active=false]:opacity-70',
                )}
              >
                <RecurringCategoryIcon item={item} />
                <span className="min-w-0 flex-1 space-y-0.5">
                  {/* Each fact beside what it is about: the price change
                      under the price, the end date under the next date. */}
                  <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="min-w-0 font-medium break-words">
                      {item.name}
                    </span>
                    <span className="ml-auto max-w-full text-right font-semibold whitespace-nowrap tabular-nums">
                      {credit ? '+' : ''}
                      {formatAmountPerPeriod(item)}
                    </span>
                  </span>
                  <span className="text-muted-foreground flex flex-wrap justify-between gap-x-2 text-xs">
                    <span className="truncate">
                      {item.termMonths
                        ? `Prépayé ${item.termMonths} mois`
                        : CADENCE_LABELS[item.cadence]}
                      {item.categoryName ? ` · ${item.categoryName}` : ''}
                    </span>
                    {item.termMonths ? (
                      <span className="ml-auto shrink-0 tabular-nums">
                        {formatPrepaid(item)}
                      </span>
                    ) : (
                      item.cadence !== 'monthly' && (
                        <span className="ml-auto shrink-0 tabular-nums">
                          ≈ {formatCents(item.monthlyEquivalentCents)} / mois
                        </span>
                      )
                    )}
                  </span>
                  {item.share && (
                    <span className="text-muted-foreground block text-xs">
                      {shareText(item)}
                    </span>
                  )}
                  <span className="flex flex-wrap justify-between gap-x-2 text-xs">
                    <span className="text-muted-foreground">
                      <NextDate item={item} today={today} />
                    </span>
                    {priceChange && (
                      <span
                        className={cn(
                          'ml-auto flex shrink-0 items-center gap-1 font-medium whitespace-nowrap',
                          (item.priceChangeCents ?? 0) > 0 === !credit
                            ? 'text-warning-foreground dark:text-warning'
                            : 'text-success-foreground dark:text-success',
                        )}
                      >
                        {(item.priceChangeCents ?? 0) > 0 ? (
                          <TrendingUpIcon
                            aria-hidden="true"
                            className="size-3.5"
                          />
                        ) : (
                          <TrendingDownIcon
                            aria-hidden="true"
                            className="size-3.5"
                          />
                        )}
                        {priceChange}
                      </span>
                    )}
                  </span>
                  {end && (
                    <span className="flex items-center gap-1 text-xs font-medium">
                      <BanIcon aria-hidden="true" className="size-3.5" />
                      {end}
                    </span>
                  )}
                  {(item.chargedAfterEnd || (!item.active && !end)) && (
                    <span className="flex flex-wrap gap-1.5 pt-1">
                      <ChargedAfterEndBadge item={item} today={today} />
                      {!item.active && !end && (
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
