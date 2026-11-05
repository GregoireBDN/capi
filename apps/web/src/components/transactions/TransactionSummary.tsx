import { cn, Skeleton } from '@finances/ui'
import type { TransactionSummaryDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'

interface TileProps {
  label: string
  value: string
  tone?: 'income' | 'expense' | 'neutral'
  detail?: string
}

function Tile({ label, value, tone = 'neutral', detail }: TileProps) {
  return (
    <div className="bg-card min-w-0 rounded-xl border p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          'truncate text-base font-semibold tabular-nums sm:text-lg',
          tone === 'income' && 'text-green-700 dark:text-green-400',
          tone === 'expense' && 'text-red-600 dark:text-red-400',
        )}
      >
        {value}
      </dd>
      {detail && (
        <dd className="text-muted-foreground truncate text-xs">{detail}</dd>
      )}
    </div>
  )
}

function toneOf(cents: number): TileProps['tone'] {
  return cents > 0 ? 'income' : cents < 0 ? 'expense' : 'neutral'
}

/**
 * Totals of the filtered transactions: income, expenses, net and count.
 * Transfers between the user's own accounts are never income or expense; the
 * note says how many were left out. One-off amounts are shown as a part.
 */
export function TransactionSummary({
  summary,
}: {
  summary: TransactionSummaryDto | undefined
}) {
  if (!summary) {
    return (
      <div
        className="grid grid-cols-2 gap-2 @2xl:grid-cols-4"
        aria-busy="true"
        aria-label="Chargement du résumé"
      >
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <section aria-label="Résumé" className="space-y-1.5">
      <dl className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        <Tile
          label="Revenus"
          value={formatCents(summary.incomeCents)}
          tone="income"
          detail={
            summary.oneOffIncomeCents !== 0
              ? `dont ponctuels ${formatCents(summary.oneOffIncomeCents)}`
              : undefined
          }
        />
        <Tile
          label="Dépenses"
          value={formatCents(summary.expenseCents)}
          tone="expense"
          detail={
            summary.oneOffExpenseCents !== 0
              ? `dont ponctuelles ${formatCents(summary.oneOffExpenseCents)}`
              : undefined
          }
        />
        <Tile
          label="Solde"
          value={formatCents(summary.netCents)}
          tone={toneOf(summary.netCents)}
        />
        <Tile label="Opérations" value={String(summary.count)} />
      </dl>
      <p className="text-muted-foreground text-xs">
        Mouvements internes exclus des revenus et des dépenses
        {summary.transferCount > 0 &&
          ` (${plural(summary.transferCount, 'virement', 'virements')} entre vos comptes)`}
        .
      </p>
    </section>
  )
}
