import { Card, CardContent, cn } from '@capi/ui'
import type { RecurringItemDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'
import type { RecurringGroups } from './format'

const percent = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
})
const wholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

export interface RecurringPart {
  key: 'subscriptions' | 'fixed' | 'variable'
  label: string
  /** Bar and legend colour. */
  color: string
  count: number
  yearlyCents: number
  /** Yearly / 12, rounded: what the section header shows. */
  monthlyCents: number
}

/** Items still counted: active and not cancelled as of today. */
function counted(items: readonly RecurringItemDto[]) {
  return items.filter((item) => item.active && !item.ended)
}

/**
 * The page's own split of the recurring debits (the owner's « A », #314
 * feedback): subscriptions, other fixed costs, variable costs. The parts do
 * not overlap (a subscription is never counted again as a fixed cost) and
 * each one's monthly amount is its section header's, so they add up to the
 * total shown above them. Empty parts are left out.
 */
export function recurringParts(groups: RecurringGroups): RecurringPart[] {
  const parts: Omit<RecurringPart, 'count' | 'yearlyCents' | 'monthlyCents'>[] =
    [
      { key: 'subscriptions', label: 'Abonnements', color: 'bg-chart-1' },
      { key: 'fixed', label: 'Autres charges fixes', color: 'bg-chart-2' },
      { key: 'variable', label: 'Charges variables', color: 'bg-chart-3' },
    ]
  return parts
    .map((part) => {
      const items = counted(groups[part.key])
      // The owner's part of an item shared with a contact (#359).
      const yearlyCents = items.reduce(
        (sum, item) => sum + item.ownYearlyCostCents,
        0,
      )
      return {
        ...part,
        count: items.length,
        yearlyCents,
        monthlyCents: Math.round(yearlyCents / 12),
      }
    })
    .filter((part) => part.count > 0)
}

/**
 * Recurring costs at a glance (owner's « A. Un total, une barre »): the
 * monthly total alone, its year and number of charges under it, then its
 * three parts as one stacked bar and a legend with their amount and share.
 * Recurring incomes have their own section below. Hidden while no debit is
 * counted (no block of 0,00 €).
 */
export function RecurringKpis({ groups }: { groups: RecurringGroups }) {
  const parts = recurringParts(groups)
  if (parts.length === 0) return null
  // The sum of the parts as shown, so the legend adds up to it.
  const monthlyCents = parts.reduce((sum, part) => sum + part.monthlyCents, 0)
  const yearlyCents = parts.reduce((sum, part) => sum + part.yearlyCents, 0)
  const count = parts.reduce((sum, part) => sum + part.count, 0)
  const share = (part: RecurringPart) =>
    monthlyCents > 0 ? part.monthlyCents / monthlyCents : 0

  return (
    <Card size="sm">
      <CardContent className="@container space-y-4">
        <div>
          <p className="text-muted-foreground text-sm">Charges récurrentes</p>
          {/* The amount never breaks; « / mois » goes under it at 320px. */}
          <p className="flex flex-wrap items-baseline gap-x-1.5 tabular-nums">
            <span className="text-3xl font-semibold whitespace-nowrap">
              {formatCents(monthlyCents)}
            </span>{' '}
            <span className="text-muted-foreground">/ mois</span>
          </p>
          <p className="text-muted-foreground text-sm tabular-nums">
            {wholeEuros.format(Math.round(yearlyCents / 100))} par an ·{' '}
            {plural(count, 'charge')}
          </p>
        </div>
        <div
          aria-hidden="true"
          className="bg-muted flex h-3 gap-0.5 overflow-hidden rounded-full"
        >
          {parts.map((part) => (
            <span
              key={part.key}
              className={cn('min-w-1', part.color)}
              style={{ width: `${share(part) * 100}%` }}
            />
          ))}
        </div>
        {/* One line per part on a phone (label left, amount right); on a
            wide card the three side by side, each stacked: label, amount,
            share and count, so an amount never sits far from its label. */}
        <ul
          aria-label="Répartition des charges"
          className="grid gap-2.5 @lg:grid-cols-3 @lg:gap-6"
        >
          {parts.map((part) => (
            <li
              key={part.key}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 text-sm @lg:grid-cols-[auto_minmax(0,1fr)]"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1.5 inline-block size-2.5 shrink-0 rounded-[3px]',
                  part.color,
                )}
              />
              <span className="break-normal">
                {part.label}
                <span className="text-muted-foreground block text-xs @lg:hidden">
                  {plural(part.count, 'élément')}
                </span>
              </span>
              <span className="text-right whitespace-nowrap tabular-nums @lg:col-start-2 @lg:text-left">
                <span className="font-medium @lg:text-lg @lg:font-semibold">
                  {formatCents(part.monthlyCents)}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {percent.format(share(part))}
                  <span className="hidden @lg:inline">
                    {' · '}
                    {plural(part.count, 'élément')}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
