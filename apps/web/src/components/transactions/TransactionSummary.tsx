import { cn, Skeleton } from '@finances/ui'
import { ArrowLeftRightIcon } from 'lucide-react'
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
 * One figure of the strip: its label above it, both on the same edge
 * (#406), the value sized on its column (`cqi`) and never wrapped. Under
 * 330px of strip (a 320px phone) the figures stack, each a row with its
 * label on the left and its value on the right.
 */
function Figure({ label, cents, toned = false }: FigureProps) {
  return (
    <div className="@container flex min-w-0 items-baseline justify-between gap-3 px-3 py-1.5 @[330px]/strip:block @[330px]/strip:px-2.5 @[330px]/strip:py-2">
      <dt className="text-muted-foreground text-[13px]">{label}</dt>
      <dd
        className={cn(
          'text-[15px] font-semibold whitespace-nowrap tabular-nums @[330px]/strip:text-[clamp(13px,13cqi,19px)]',
          toned && cents > 0 && 'text-chart-delta-good',
          toned && cents < 0 && 'text-chart-delta-bad',
        )}
      >
        {formatCents(cents)}
      </dd>
    </div>
  )
}

/** "dont exceptionnelles −200,00 € · 12 virements internes exclus". */
export function summaryNote(summary: TransactionSummaryDto): string {
  const parts: string[] = []
  if (summary.oneOffExpenseCents !== 0)
    parts.push(
      `dont exceptionnelles ${formatCents(summary.oneOffExpenseCents)}`,
    )
  if (summary.oneOffIncomeCents !== 0)
    parts.push(
      `revenus exceptionnels ${formatCents(summary.oneOffIncomeCents)}`,
    )
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
 * left out and the one-off share, as the card's last row (#406). The
 * count is in the list header.
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
    <section
      aria-label="Résumé"
      className="bg-card @container/strip overflow-hidden rounded-xl border"
    >
      <dl className="grid grid-cols-1 divide-y @[330px]/strip:grid-cols-3 @[330px]/strip:divide-x @[330px]/strip:divide-y-0">
        <Figure label="Revenus" cents={summary.incomeCents} />
        <Figure label="Dépenses" cents={summary.expenseCents} />
        <Figure label="Net" cents={summary.netCents} toned />
      </dl>
      {/* Part of the totals: what they leave out, their last row. */}
      <p className="text-muted-foreground flex items-center gap-1.5 border-t px-3 py-1.5 text-[13px]">
        <ArrowLeftRightIcon aria-hidden className="size-[14px] shrink-0" />
        {summaryNote(summary)}
      </p>
    </section>
  )
}
