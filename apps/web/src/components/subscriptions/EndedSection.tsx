import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  cn,
} from '@finances/ui'
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react'
import type { RecurringItemDto } from '#/api/types.gen'
import { RecurringCategoryIcon } from './RecurringCategoryIcon'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import { ROW_BUTTON, ROW_LIST } from '#/lib/row-list'
import { formatDayMonth } from './format'
import { ChargedAfterEndBadge } from './RecurringList'

/**
 * « Abonnements résiliés » (#270): confirmed items cancelled as of today,
 * out of the totals and the forecast. Collapsed by default, open when one
 * was charged after its end date; hidden when there are none. Each row
 * shows the end date, the last charge and the yearly cost before the end,
 * and opens the editor (« Réactiver »).
 */
export function EndedSection({
  items,
  today,
  onEdit,
}: {
  items: RecurringItemDto[]
  today: string
  onEdit: (item: RecurringItemDto) => void
}) {
  if (items.length === 0) return null
  const charged = items.some((item) => item.chargedAfterEnd !== null)
  return (
    <Card size="sm" className="min-w-0">
      <details className="group space-y-3" open={charged}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <ChevronRightIcon
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0 group-open:hidden"
          />
          <ChevronDownIcon
            aria-hidden="true"
            className="text-muted-foreground hidden size-4 shrink-0 group-open:block"
          />
          <h3 className="min-w-0 flex-1 font-semibold">Abonnements résiliés</h3>
          <span className="text-muted-foreground shrink-0 text-sm">
            {plural(items.length, 'élément')}
          </span>
        </summary>
        <CardHeader className="pt-0">
          <CardDescription>
            Hors des totaux et de la prévision ; leur historique est conservé.
            Ouvrez-en un pour le réactiver.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className={ROW_LIST}>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  aria-label={`Modifier ${item.name}`}
                  className={cn(
                    ROW_BUTTON,
                    'flex min-w-0 items-start gap-2 p-3',
                  )}
                >
                  <RecurringCategoryIcon item={item} />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="min-w-[7rem] flex-1 font-medium break-words">
                        {item.name}
                      </span>
                      <span className="text-muted-foreground ml-auto text-sm whitespace-nowrap tabular-nums">
                        {formatCents(item.yearlyCostCents)} / an avant la fin
                      </span>
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      Fin le {formatDayMonth(item.endedOn!, today)} · dernier
                      prélèvement le {formatDayMonth(item.lastSeenDate, today)}
                    </span>
                    {item.chargedAfterEnd && (
                      <span className="flex flex-wrap gap-1.5 pt-1">
                        <ChargedAfterEndBadge item={item} today={today} />
                      </span>
                    )}
                  </span>
                  <ChevronRightIcon
                    aria-hidden="true"
                    className="text-muted-foreground mt-1 size-4 shrink-0"
                  />
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </details>
    </Card>
  )
}
