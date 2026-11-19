import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@finances/ui'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { transactionsControllerList } from '#/api'
import type { AccountPerformanceDto } from '#/api/types.gen'
import { displayLabel } from '#/components/transactions/labels'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { unwrap } from '#/lib/queries'

/** Latest linked transfers shown on the account page. */
export const LINKED_TRANSFERS_SHOWN = 10

export function linkedTransfersQuery(accountId: string) {
  return queryOptions({
    // Under `transactions`: refreshed with every transaction edit.
    queryKey: ['transactions', 'linked', accountId] as const,
    queryFn: () =>
      unwrap(
        transactionsControllerList({
          query: {
            counterpartAccountId: accountId,
            limit: LINKED_TRANSFERS_SHOWN,
            sort: 'date_desc',
          },
          throwOnError: false,
        }),
      ),
    staleTime: 0,
  })
}

/**
 * The transfers linked to an investment account (#296): money sent to it
 * (positive here) or taken out of it, newest first. They make its
 * contributions; editing one (« Vers : … ») is done on Opérations.
 */
export function LinkedTransfers({
  accountId,
  performance,
}: {
  accountId: string
  performance: Pick<AccountPerformanceDto, 'linkedTransfersCount'>
}) {
  const transfers = useQuery(linkedTransfersQuery(accountId))
  const items = transfers.data?.items ?? []
  if (items.length === 0) return null
  const total = transfers.data?.total ?? items.length
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Virements liés</CardTitle>
        <CardDescription>
          {plural(total, 'virement', 'virements')} vers ou depuis ce compte
          {total > items.length ? `, les ${items.length} derniers.` : '.'}
          {performance.linkedTransfersCount === 0 &&
            ' Le montant investi vient du coût de ses cryptos, pas de ces virements.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-border divide-y">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5 text-sm"
            >
              <span className="min-w-[7rem] flex-1">
                <span className="block truncate">{displayLabel(item)}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {formatCalendarDate(item.bookingDate)} ·{' '}
                  {item.amountCents < 0 ? 'depuis' : 'vers'} {item.accountName}
                </span>
              </span>
              <span className="ml-auto whitespace-nowrap tabular-nums">
                {/* Seen from the investment account: money in is positive. */}
                {item.amountCents < 0 ? '+' : ''}
                {formatCents(-item.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
