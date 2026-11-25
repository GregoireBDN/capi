import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@capi/ui'
import type { ForecastDto, ForecastItemDto } from '#/api/types.gen'
import {
  formatRelativeDay,
  formatShortDay,
} from '#/components/subscriptions/format'
import { RecurringCategoryIcon } from '#/components/subscriptions/RecurringCategoryIcon'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'

function Amount({
  cents,
  approximate,
}: {
  cents: number
  approximate: boolean
}) {
  return (
    <span
      className={
        cents > 0
          ? 'text-success-foreground dark:text-success ml-auto shrink-0 whitespace-nowrap tabular-nums'
          : 'ml-auto shrink-0 whitespace-nowrap tabular-nums'
      }
    >
      {approximate ? '~ ' : ''}
      {cents > 0 ? '+' : ''}
      {formatCents(cents)}
    </span>
  )
}

function ItemRow({ item }: { item: ForecastItemDto }) {
  const late = item.expectedDate !== item.date
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-px flex">
        <RecurringCategoryIcon item={item} size="sm" />
      </span>
      {/* Name and amount on one line; the "not imported yet" note under both
          so a long name keeps the width it needs. */}
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        <span className="min-w-0 flex-1 break-words">{item.name}</span>
        <Amount
          cents={item.amountCents}
          approximate={item.amountType === 'variable'}
        />
        {late && (
          <span className="text-muted-foreground basis-full text-xs">
            Prévu le {formatShortDay(item.expectedDate)}, pas encore importé
          </span>
        )}
      </span>
    </li>
  )
}

/**
 * The expected recurring items until month end, by day (typical amounts,
 * `~` for variable ones), then the day-to-day spending estimate.
 */
export function ForecastItems({ forecast }: { forecast: ForecastDto }) {
  const { items, estimate, today } = forecast
  const days = new Map<string, ForecastItemDto[]>()
  for (const item of items) {
    days.set(item.date, [...(days.get(item.date) ?? []), item])
  }

  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <CardTitle>D’ici la fin du mois</CardTitle>
        <CardDescription>
          {items.length === 0
            ? 'Aucune opération récurrente attendue.'
            : `${plural(items.length, 'opération récurrente attendue', 'opérations récurrentes attendues')}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length > 0 && (
          <ol aria-label="Opérations attendues" className="space-y-3">
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
                  {entries.map((item) => (
                    <ItemRow
                      key={`${item.recurringItemId}-${item.expectedDate}`}
                      item={item}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
        {estimate && estimate.days > 0 && (
          <div className="flex items-start gap-2 border-t pt-3 text-sm">
            <span className="min-w-0 flex-1 space-y-0.5">
              <span className="flex flex-wrap items-center gap-2">
                Dépenses courantes
                <Badge variant="info" outline>
                  estimation
                </Badge>
              </span>
              <span className="text-muted-foreground block text-xs">
                {formatCents(estimate.dailyCents)} par jour sur{' '}
                {plural(estimate.days, 'jour')}, d’après vos dépenses du{' '}
                {formatShortDay(estimate.basedOnFrom)} au{' '}
                {formatShortDay(estimate.basedOnTo)}
              </span>
            </span>
            <Amount cents={estimate.totalCents} approximate />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
