import { Button } from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { ListIcon } from 'lucide-react'
import type { RecurringItemDto } from '#/api/types.gen'
import { ALL_MONTHS } from '#/components/transactions/search'
import { formatCents } from '#/lib/money'
import { ROUTES } from '#/lib/routes'
import {
  describeSchedule,
  formatChargeCount,
  formatDayMonth,
  formatRunPeriod,
  formatShortMonth,
} from './format'

/**
 * The history of a recurring item at the end of its editor (#279), in the
 * form that suits it: a variable amount as bars of its latest charges (the
 * latest one highlighted), a fixed one as its prices grouped by run
 * (« août → nov. · 4 fois · 14,99 € »), never one line per identical charge.
 */
export function RecurringHistory({
  item,
  today,
}: {
  item: RecurringItemDto
  today: string
}) {
  const count = formatChargeCount(item, today)
  return (
    <section
      aria-label="Historique"
      className="bg-muted/40 space-y-1 rounded-lg px-3 py-2 text-sm"
    >
      <p className="font-medium">Historique</p>
      {item.amountType === 'variable' && item.occurrences.length > 1 ? (
        <VariableBars item={item} today={today} />
      ) : (
        <PriceRuns item={item} today={today} />
      )}
      {count && <p className="text-muted-foreground text-xs">{count}</p>}
      <Button size="sm" ghost variant="secondary" className="-ml-2" asChild>
        <Link
          to={ROUTES.transactions}
          search={{
            month: ALL_MONTHS,
            q: item.searchText,
            account: item.accountId,
          }}
        >
          <ListIcon className="size-4" />
          Voir les opérations
        </Link>
      </Button>
    </section>
  )
}

function VariableBars({
  item,
  today,
}: {
  item: RecurringItemDto
  today: string
}) {
  // Oldest first, left to right.
  const charges = [...item.occurrences].reverse()
  const max = Math.max(...charges.map((charge) => charge.amountCents), 1)
  const latest = item.occurrences[0]
  return (
    <>
      <p className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-semibold tabular-nums">
          {formatCents(latest.amountCents)} le{' '}
          {formatDayMonth(latest.date, today)}
        </span>
        <span className="text-muted-foreground text-xs">dernier</span>
      </p>
      <ol
        aria-label={`${charges.length} derniers prélèvements`}
        className="flex h-16 items-end gap-1.5 pt-1"
      >
        {charges.map((charge, index) => (
          <li
            key={charge.transactionId}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
          >
            <span className="sr-only">
              {formatDayMonth(charge.date, today)} :{' '}
              {formatCents(charge.amountCents)}
            </span>
            <span
              aria-hidden="true"
              data-latest={index === charges.length - 1}
              className="bg-muted-foreground/30 data-[latest=true]:bg-primary block rounded-t-sm"
              style={{
                height: `${Math.max(8, Math.round((charge.amountCents / max) * 100))}%`,
              }}
            />
          </li>
        ))}
      </ol>
      <div
        aria-hidden="true"
        className="text-muted-foreground flex gap-1.5 text-xs"
      >
        {charges.map((charge) => (
          <span
            key={charge.transactionId}
            className="min-w-0 flex-1 truncate text-center"
          >
            {formatShortMonth(charge.date, today)}
          </span>
        ))}
      </div>
      <p className="text-muted-foreground">
        D’habitude ~ {formatCents(item.typicalAmountCents)}, de{' '}
        {formatCents(item.minAmountCents)} à {formatCents(item.maxAmountCents)},{' '}
        {describeSchedule(item)}
      </p>
    </>
  )
}

function PriceRuns({ item, today }: { item: RecurringItemDto; today: string }) {
  if (item.amountRuns.length === 0) {
    return (
      <p className="tabular-nums">
        {formatCents(item.typicalAmountCents)} {describeSchedule(item)}
      </p>
    )
  }
  return (
    <>
      <p className="text-muted-foreground text-xs">{describeSchedule(item)}</p>
      <ol aria-label="Prix successifs" className="space-y-0.5">
        {item.amountRuns.map((run, index) => (
          <li
            key={`${run.from}:${run.amountCents}`}
            data-current={index === 0}
            className="text-muted-foreground data-[current=true]:text-foreground flex flex-wrap justify-between gap-x-2 data-[current=true]:font-medium"
          >
            <span>{formatRunPeriod(run, today)}</span>
            <span className="ml-auto whitespace-nowrap tabular-nums">
              {formatCents(run.amountCents)}
            </span>
          </li>
        ))}
      </ol>
    </>
  )
}
