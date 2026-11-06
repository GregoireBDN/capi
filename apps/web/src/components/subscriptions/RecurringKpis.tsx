import { Card, CardContent, cn } from '@finances/ui'
import type { RecurringSummaryDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'

const percent = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
})

function Stat({
  label,
  value,
  detail,
  className,
}: {
  label: string
  value: string
  detail?: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-muted-foreground truncate text-xs">{label}</dt>
      <dd className="truncate font-semibold tabular-nums">{value}</dd>
      {detail && (
        <dd className="text-muted-foreground truncate text-xs">{detail}</dd>
      )}
    </div>
  )
}

/**
 * Recurring costs at a glance: confirmed, active debits per month and per
 * year (yearly = sum of the yearly costs, monthly = yearly / 12), their
 * fixed vs variable split, subscriptions alone, and recurring incomes.
 * Transfers between own accounts are never part of them.
 */
export function RecurringKpis({ summary }: { summary: RecurringSummaryDto }) {
  const { debits, credits } = summary
  const share = (part: number) =>
    debits.yearlyCents > 0 ? percent.format(part / debits.yearlyCents) : '—'
  return (
    <Card size="sm">
      <CardContent>
        <dl
          aria-label="Chiffres clés"
          className="grid grid-cols-2 gap-x-3 gap-y-4 @2xl:grid-cols-3"
        >
          <Stat
            className="col-span-2 @2xl:col-span-1"
            label="Charges récurrentes par mois"
            value={formatCents(debits.monthlyCents)}
            detail={plural(debits.count, 'charge')}
          />
          <Stat label="Par an" value={formatCents(debits.yearlyCents)} />
          <Stat
            label="Abonnements"
            value={`${formatCents(debits.subscriptions.monthlyCents)} / mois`}
            detail={plural(debits.subscriptions.count, 'abonnement')}
          />
          <Stat
            label="Charges fixes"
            value={`${formatCents(debits.fixed.monthlyCents)} / mois`}
            detail={`${share(debits.fixed.yearlyCents)} du total`}
          />
          <Stat
            label="Charges variables"
            value={`${formatCents(debits.variable.monthlyCents)} / mois`}
            detail={`${share(debits.variable.yearlyCents)} du total`}
          />
          <Stat
            className="col-span-2 @2xl:col-span-1"
            label="Revenus récurrents"
            value={`${formatCents(credits.monthlyCents)} / mois`}
            detail={
              credits.count > 0
                ? `${formatCents(credits.yearlyCents)} par an`
                : 'Aucun revenu confirmé'
            }
          />
        </dl>
      </CardContent>
    </Card>
  )
}
