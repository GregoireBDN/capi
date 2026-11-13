import { Button } from '@finances/ui'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { formatMonth, shiftMonth } from '#/lib/calendar'

interface MonthSwitcherProps {
  month: string
  /** Current month in Europe/Paris: the latest one shown. */
  today: string
  onMonthChange: (month: string) => void
}

/** Previous / next month, up to the current one. */
export function MonthSwitcher({
  month,
  today,
  onMonthChange,
}: MonthSwitcherProps) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="secondary"
        ghost
        iconOnly
        aria-label="Mois précédent"
        onClick={() => onMonthChange(shiftMonth(month, -1))}
      >
        <ChevronLeftIcon />
      </Button>
      <p
        className="min-w-0 flex-1 truncate text-center text-base font-semibold @2xl:w-44 @2xl:flex-none"
        aria-live="polite"
      >
        {formatMonth(month)}
      </p>
      <Button
        variant="secondary"
        ghost
        iconOnly
        aria-label="Mois suivant"
        disabled={month >= today}
        onClick={() => onMonthChange(shiftMonth(month, 1))}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  )
}
