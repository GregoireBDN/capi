import { cn } from '@finances/ui'
import { CalendarClockIcon } from 'lucide-react'
import type { MonthPeriodDto } from '#/api/types.gen'
import { currentMonth } from '#/lib/calendar'
import { describePeriod } from '#/lib/period'

/**
 * How far the page's figures go and what they are compared with ("Mois en
 * cours : données jusqu’au 3 nov., comparées au 1–3 oct."). Nothing when
 * there is no data at all.
 */
export function PeriodNote({
  period,
  className,
}: {
  period: MonthPeriodDto
  className?: string
}) {
  const text = describePeriod(period, currentMonth())
  if (text === null) return null
  return (
    <p
      data-slot="period-note"
      className={cn(
        'text-muted-foreground flex items-start gap-1.5 text-xs',
        className,
      )}
    >
      <CalendarClockIcon aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{text}</span>
    </p>
  )
}
