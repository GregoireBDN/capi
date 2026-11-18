import { cn, Skeleton } from '@finances/ui'
import type { TransactionSummaryDto } from '#/api/types.gen'
import { formatCents } from '#/lib/money'
import { plural } from '#/lib/plural'

interface FigureProps {
  label: string
  cents: number
  /** Net: green when positive, red when negative (theme tokens). */
  toned?: boolean
}

/**
 * One figure of the strip, laid out by its own width: a column (label
 * above, value sized on the column with `cqi`, never wrapped) beside the
 * others, or a compact row (label left, value right) when they stack.
 */
function Figure({ label, cents, toned = false }: FigureProps) {
  return (
    <div className="@container min-w-0">
      <div className="px-3 py-2 @[240px]:flex @[240px]:items-baseline @[240px]:justify-between @[240px]:gap-3 @[240px]:py-1.5">
        <dt className="text-muted-foreground text-xs">{label}</dt>
        <dd
          className={cn(
            'text-[clamp(0.8rem,11cqi,1.25rem)] font-semibold whitespace-nowrap tabular-nums @[240px]:text-base',
            toned && cents > 0 && 'text-chart-delta-good',
            toned && cents < 0 && 'text-chart-delta-bad',
          )}
        >
          {formatCents(cents)}
        </dd>
      </div>
    </div>
  )
}

/** "dont ponctuelles −200,00 € · 12 virements internes exclus". */
export function summaryNote(summary: TransactionSummaryDto): string {
  const parts: string[] = []
  if (summary.oneOffExpenseCents !== 0)
    parts.push(`dont ponctuelles ${formatCents(summary.oneOffExpenseCents)}`)
  if (summary.oneOffIncomeCents !== 0)
    parts.push(`revenus ponctuels ${formatCents(summary.oneOffIncomeCents)}`)
  parts.push(
    summary.transferCount > 0
      ? plural(
          summary.transferCount,
          'virement interne exclu',
          'virements internes exclus',
        )
      : 'virements internes exclus',
  )
  const text = parts.join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Totals of the filtered transactions in one strip: income, expenses and
 * their net (« Net », not a balance). Transfers between the user's own
 * accounts are never income or expense; the note line says how many were
 * left out and the one-off share. The count is in the list header.
 */
export function TransactionSummary({
  summary,
}: {
  summary: TransactionSummaryDto | undefined
}) {
  if (!summary) {
    return (
      <Skeleton
        className="h-16 rounded-xl"
        aria-busy="true"
        aria-label="Chargement du résumé"
      />
    )
  }

  return (
    <section aria-label="Résumé" className="space-y-1.5">
      <dl className="bg-card grid grid-cols-1 divide-y rounded-xl border @[480px]:grid-cols-3 @[480px]:divide-x @[480px]:divide-y-0">
        <Figure label="Revenus" cents={summary.incomeCents} />
        <Figure label="Dépenses" cents={summary.expenseCents} />
        <Figure label="Net" cents={summary.netCents} toned />
      </dl>
      <p className="text-muted-foreground px-1 text-xs">
        {summaryNote(summary)}
      </p>
    </section>
  )
}
