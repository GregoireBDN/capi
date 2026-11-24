import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@capi/ui'
import type { RecurringItemDto } from '#/api/types.gen'
import { RecurringCategoryIcon } from './RecurringCategoryIcon'
import { formatCents } from '#/lib/money'
import {
  formatRelativeDay,
  formatShortDay,
  UPCOMING_DAYS,
  upcomingDebits,
} from './format'

/**
 * Expected debits of the confirmed items over the next 30 days, by date
 * (typical amounts: variable bills are an estimate). A cancelled item stops
 * before its end date, its last charge marked « dernière échéance ».
 */
export function UpcomingTimeline({
  items,
  today,
}: {
  items: RecurringItemDto[]
  today: string
}) {
  const upcoming = upcomingDebits(items, today)
  const days = new Map<string, typeof upcoming>()
  for (const entry of upcoming) {
    days.set(entry.date, [...(days.get(entry.date) ?? []), entry])
  }
  const total = upcoming.reduce(
    (sum, entry) => sum + entry.item.typicalAmountCents,
    0,
  )

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Prochains prélèvements</CardTitle>
        <CardDescription className="tabular-nums">
          {formatCents(total)} sur les {UPCOMING_DAYS} prochains jours
        </CardDescription>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun prélèvement attendu dans les {UPCOMING_DAYS} prochains jours.
          </p>
        ) : (
          <ol aria-label="Prochains prélèvements" className="space-y-3">
            {[...days].map(([date, entries]) => (
              <li key={date} className="relative border-l-2 pl-3">
                <span
                  aria-hidden="true"
                  className="bg-background border-primary absolute top-1 -left-[7px] size-3 rounded-full border-2"
                />
                <p className="text-sm font-medium first-letter:uppercase">
                  {formatShortDay(date)}
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    · {formatRelativeDay(date, today)}
                  </span>
                </p>
                <ul className="mt-1 space-y-1">
                  {entries.map(({ key, item, last }) => (
                    <li key={key} className="flex items-center gap-2 text-sm">
                      <RecurringCategoryIcon item={item} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.name}</span>
                        {last && (
                          <span className="text-muted-foreground block text-xs">
                            Dernière échéance
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {item.amountType === 'variable' ? '~ ' : ''}
                        {formatCents(item.typicalAmountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
