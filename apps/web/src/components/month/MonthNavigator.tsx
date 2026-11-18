import {
  Button,
  cn,
  PeriodStepper,
  PeriodStepperLabel,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  currentMonth,
  formatMonth,
  formatShortMonth,
  shiftMonth,
} from '#/lib/calendar'
import { coverageQuery } from './coverage'
import { isMonthKey } from './month-keys'

const shortMonth = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  timeZone: 'UTC',
})

/** `1` → "janv." */
function monthAbbreviation(monthNumber: number): string {
  return shortMonth.format(new Date(Date.UTC(2000, monthNumber - 1, 1)))
}

/** Oldest year the picker offers when there is no data before it. */
const YEARS_BACK = 5

export interface MonthShortcut {
  label: string
  month: string
}

/**
 * The shortcuts under the picker: the latest month reachable ("Mois en
 * cours", or "Mois dernier" on the pages that stop at the previous one) and,
 * when the data stops earlier, the month it stops in ("Dernières données").
 */
export function monthShortcuts({
  max,
  current,
  defaultMonth,
}: {
  max: string
  current: string
  defaultMonth: string | undefined
}): MonthShortcut[] {
  const shortcuts: MonthShortcut[] = [
    {
      label:
        max === current
          ? 'Mois en cours'
          : max === shiftMonth(current, -1)
            ? 'Mois dernier'
            : formatMonth(max),
      month: max,
    },
  ]
  if (defaultMonth !== undefined && defaultMonth < max) {
    shortcuts.push({ label: 'Dernières données', month: defaultMonth })
  }
  return shortcuts
}

interface MonthGridProps {
  month: string
  max: string
  monthsWithData: ReadonlySet<string>
  firstYear: number
  onSelect: (month: string) => void
}

/** One year of months, the selected one filled, those with data marked. */
function MonthGrid({
  month,
  max,
  monthsWithData,
  firstYear,
  onSelect,
}: MonthGridProps) {
  const maxYear = Number(max.slice(0, 4))
  const [year, setYear] = useState(() =>
    Math.min(Number(month.slice(0, 4)), maxYear),
  )
  const minYear = Math.min(firstYear, year)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-1">
        <Button
          variant="secondary"
          ghost
          iconOnly
          aria-label="Année précédente"
          disabled={year <= minYear}
          onClick={() => setYear(year - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <p className="text-base font-semibold" aria-live="polite">
          {year}
        </p>
        <Button
          variant="secondary"
          ghost
          iconOnly
          aria-label="Année suivante"
          disabled={year >= maxYear}
          onClick={() => setYear(year + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <div
        className="grid grid-cols-3 gap-1.5"
        role="group"
        aria-label={`Mois de ${year}`}
      >
        {Array.from({ length: 12 }, (_, index) => {
          const value = `${year}-${String(index + 1).padStart(2, '0')}`
          const selected = value === month
          const hasData = monthsWithData.has(value)
          const future = value > max
          return (
            <button
              key={value}
              type="button"
              disabled={future}
              aria-pressed={selected}
              aria-label={`${formatMonth(value)}${hasData ? ', avec des opérations' : ''}`}
              onClick={() => onSelect(value)}
              className={cn(
                'relative flex min-h-8 flex-col items-center justify-center rounded-md text-sm capitalize transition-colors outline-none',
                'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                'disabled:pointer-events-none disabled:opacity-40',
                selected
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : hasData
                    ? 'text-foreground hover:bg-muted font-medium'
                    : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {monthAbbreviation(index + 1)}
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 size-1 rounded-full',
                  hasData
                    ? selected
                      ? 'bg-primary-foreground'
                      : 'bg-primary'
                    : 'bg-transparent',
                )}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function monthsOfYear(month: string): string[] {
  const year = month.slice(0, 4)
  return Array.from(
    { length: 12 },
    (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`,
  )
}

/** Every month name of the year shown, so the label keeps the widest one's width. */
const fullSizers = (month: string) => monthsOfYear(month).map(formatMonth)
const shortSizers = (month: string) => monthsOfYear(month).map(formatShortMonth)

export interface MonthNavigatorProps {
  /** Month shown (`YYYY-MM`). */
  month: string
  onMonthChange: (month: string) => void
  /** Latest month reachable; the current month (Europe/Paris) by default. */
  max?: string
  /**
   * Shown instead of the month name (e.g. "Toutes les dates"): the arrows
   * are off, the picker still leads back to a month.
   */
  label?: string
  /** Whether ← / → move the month (one navigator per page). Default: on. */
  keyboard?: boolean
  className?: string
}

/**
 * The month navigator of every month page: previous / next month, the
 * month's name opening a month picker (months with transactions marked,
 * months after `max` off, shortcuts to the current month and to the month
 * the data stops in), and ← / → on a keyboard. One box with 44px targets,
 * as wide as its content; short label when its container (`@container`) is
 * under 420px. Place it with `MonthToolbar`.
 */
export function MonthNavigator({
  month,
  onMonthChange,
  max: maxProp,
  label,
  keyboard = true,
  className,
}: MonthNavigatorProps) {
  const current = currentMonth()
  const max = maxProp ?? current
  const coverage = useQuery(coverageQuery)
  const [open, setOpen] = useState(false)
  const free = label === undefined
  const canGoBack = free
  const canGoForward = free && month < max

  const latest = useRef({ month, max, free, onMonthChange })
  latest.current = { month, max, free, onMonthChange }
  useEffect(() => {
    if (!keyboard) return
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = isMonthKey(event)
      const state = latest.current
      if (direction === null || !state.free) return
      const target = shiftMonth(state.month, direction === 'next' ? 1 : -1)
      if (target > state.max) return
      event.preventDefault()
      state.onMonthChange(target)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [keyboard])

  const monthsWithData = new Set(coverage.data?.months ?? [])
  const firstData = coverage.data?.months[0]
  const firstYear = firstData
    ? Number(firstData.slice(0, 4))
    : Number(max.slice(0, 4)) - YEARS_BACK
  const shortcuts = monthShortcuts({
    max,
    current,
    defaultMonth: coverage.data?.defaultMonth,
  })

  const select = (target: string) => {
    setOpen(false)
    if (target !== month || !free) onMonthChange(target)
  }

  const name = label ?? formatMonth(month)

  return (
    <PeriodStepper
      data-slot="month-navigator"
      aria-label="Mois"
      className={className}
      previous={{
        label: 'Mois précédent',
        keyShortcuts: keyboard ? 'ArrowLeft' : undefined,
        disabled: !canGoBack,
        onClick: () => onMonthChange(shiftMonth(month, -1)),
      }}
      next={{
        label: 'Mois suivant',
        keyShortcuts: keyboard ? 'ArrowRight' : undefined,
        disabled: !canGoForward,
        onClick: () => onMonthChange(shiftMonth(month, 1)),
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <PeriodStepperLabel
            aria-label={`${name}, choisir un mois`}
            text={name}
            shortText={label ?? formatShortMonth(month)}
            sizers={label === undefined ? fullSizers(month) : undefined}
            shortSizers={label === undefined ? shortSizers(month) : undefined}
          />
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="w-[min(15rem,calc(100vw-2rem))]"
          aria-label="Choisir un mois"
        >
          <MonthGrid
            // Reopening starts again from the month shown.
            key={String(open)}
            month={month}
            max={max}
            monthsWithData={monthsWithData}
            firstYear={firstYear}
            onSelect={select}
          />
          <div className="grid gap-1.5 border-t pt-2.5">
            {shortcuts.map((shortcut) => (
              <Button
                key={shortcut.label}
                outline
                variant="secondary"
                iconStart={<CalendarIcon />}
                onClick={() => select(shortcut.month)}
              >
                {shortcut.label}
              </Button>
            ))}
          </div>
          {monthsWithData.size > 0 && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span aria-hidden className="bg-primary size-1 rounded-full" />
              Mois avec des opérations
            </p>
          )}
        </PopoverContent>
      </Popover>
    </PeriodStepper>
  )
}
