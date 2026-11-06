import { ProgressMeter } from '@finances/ui'
import type { ReactNode } from 'react'
import { formatCents } from '#/lib/money'

/**
 * Progress toward a savings amount (a goal, the monthly target), where going
 * past the target is good news. Wraps `ProgressMeter`, which is built for
 * budgets (past the target = overspent, close to it = warning): the bar is
 * capped at the target, never warns, and its header is replaced by a
 * visible one that wraps on a phone and shows the real amount saved. The
 * meter's own header stays for screen readers.
 */
export function SavingsMeter({
  name,
  valueCents,
  targetCents,
  action,
}: {
  name: string
  valueCents: number
  targetCents: number
  /** Optional control next to the name (e.g. an edit button). */
  action?: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 text-sm">
          <p className="min-w-0 flex-1 basis-32 font-medium break-words">
            {name}
          </p>
          <p
            aria-hidden
            className="text-muted-foreground ml-auto shrink-0 tabular-nums"
          >
            <span className="text-foreground font-medium">
              {formatCents(valueCents)}
            </span>{' '}
            / {formatCents(targetCents)}
          </p>
        </div>
        {action}
      </div>
      <ProgressMeter
        label={name}
        value={Math.min(Math.max(0, valueCents), targetCents)}
        target={targetCents}
        // Never "close to the limit": a meter state the budgets need.
        warningThreshold={2}
        hideStatus
        className="[&>div:first-child]:sr-only"
      />
    </div>
  )
}
