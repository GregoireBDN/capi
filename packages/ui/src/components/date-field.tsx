'use client'

import { CalendarIcon } from 'lucide-react'
import * as React from 'react'
import { fr } from 'react-day-picker/locale'

import { useIsMobile } from '../hooks/use-mobile'
import {
  dayToLocalDate,
  formatCalendarDay,
  localDateToDay,
  todayInParis,
} from '../lib/calendar-day'
import { fieldSurface } from '../lib/field'
import { cn } from '../lib/utils'
import { Button } from './button'
import { Calendar } from './calendar'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './sheet'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type DateFieldProps = Omit<
  React.ComponentProps<'button'>,
  'value' | 'onChange' | 'children' | 'type' | 'title'
> & {
  /** The day as `YYYY-MM-DD`, `""` when none. */
  value: string
  /** The day picked as `YYYY-MM-DD`, `""` when cleared. */
  onChange: (value: string) => void
  /** The first day that can be picked (`YYYY-MM-DD`). */
  min?: string
  /** The last day that can be picked (`YYYY-MM-DD`), e.g. today. */
  max?: string
  /** Offers « Effacer » once a day is chosen (an optional field). */
  clearable?: boolean
  /** Today (`YYYY-MM-DD`); default: today in Europe/Paris. */
  today?: string
  /** Shown while no day is chosen. */
  placeholder?: string
  /** The panel's title on phones, e.g. the field's label. */
  title?: string
}

/* ============================================================================
 * HELPERS
 * ========================================================================= */

/** `YYYY-MM` of a day. */
const monthOf = (day: string) => day.slice(0, 7)

/** The first of `day`'s month as the picker's local date. */
const firstOfMonth = (day: string) => dayToLocalDate(`${monthOf(day)}-01`)

/** The first of `day`'s month, whole years later (or earlier). */
function shiftYears(day: string, years: number): string {
  const year = Number(day.slice(0, 4)) + years
  return `${String(year).padStart(4, '0')}-${day.slice(5, 7)}-01`
}

/** `day` brought within `min` … `max`. */
function clamp(day: string, min?: string, max?: string): string {
  if (min && day < min) return min
  if (max && day > max) return max
  return day
}

/* ============================================================================
 * CALENDAR PANEL (shared by the popover and the bottom sheet)
 * ========================================================================= */

function DateFieldPanel({
  value,
  min,
  max,
  today,
  clearable,
  large,
  onPick,
}: {
  value: string
  min?: string
  max?: string
  today: string
  clearable?: boolean
  large: boolean
  onPick: (value: string) => void
}) {
  const [month, setMonth] = React.useState(() =>
    firstOfMonth(clamp(value || today, min, max)),
  )
  const todayAllowed = (!min || today >= min) && (!max || today <= max)

  return (
    <div className="flex flex-col gap-2">
      <Calendar
        mode="single"
        locale={fr}
        captionLayout="dropdown"
        autoFocus
        today={dayToLocalDate(today)}
        selected={value ? dayToLocalDate(value) : undefined}
        month={month}
        onMonthChange={setMonth}
        // The year list: from the bound, or 50 years back and 30 ahead.
        startMonth={firstOfMonth(min ?? shiftYears(today, -50))}
        endMonth={firstOfMonth(max ?? shiftYears(today, 30))}
        disabled={[
          ...(min ? [{ before: dayToLocalDate(min) }] : []),
          ...(max ? [{ after: dayToLocalDate(max) }] : []),
        ]}
        onSelect={(date: Date | undefined) => {
          // A second tap on the chosen day keeps it.
          onPick(date ? localDateToDay(date) : value)
        }}
        className={cn(
          'w-full bg-transparent p-0',
          // Days of 44px at least on phones (touch targets), 40px with a
          // mouse; the whole cell is the target.
          large ? '[--cell-size:46px]' : '[--cell-size:40px]',
        )}
        classNames={{
          root: 'rdp-root w-full',
          // Weeks start on Monday (fr), the days share the width.
          month: 'rdp-month flex w-full flex-col gap-3',
          month_caption:
            'rdp-month_caption flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          dropdowns:
            'rdp-dropdowns flex h-(--cell-size) w-full items-center justify-center gap-1 text-[15px] font-semibold',
          caption_label:
            'rdp-caption_label flex h-(--cell-size) items-center gap-1 rounded-md px-2 text-[15px] font-semibold first-letter:uppercase [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
          weekday:
            'rdp-weekday flex-1 text-center text-[12px] font-semibold uppercase text-muted-foreground select-none',
        }}
      />
      {(todayAllowed || (clearable && value)) && (
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          {todayAllowed ? (
            <Button
              type="button"
              variant="primary"
              ghost
              onClick={() => onPick(today)}
            >
              Aujourd’hui
            </Button>
          ) : (
            <span />
          )}
          {clearable && value && (
            <Button
              type="button"
              variant="secondary"
              ghost
              onClick={() => onPick('')}
            >
              Effacer
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/* ============================================================================
 * DATE FIELD
 * ========================================================================= */

/**
 * DateField (#488)
 * The app's date field, never the browser's: the day as `dd/mm/yyyy` in a
 * field that opens the app's `Calendar` in French (weeks from Monday) in a
 * popover, or a bottom sheet on phones. Its value is a calendar day
 * `YYYY-MM-DD` (`""` when none), never a `Date` moved by a time zone.
 * `min` / `max` bound it, « Aujourd’hui » picks today (Europe/Paris) and
 * `clearable` offers « Effacer ». A `FieldLabel htmlFor` names it.
 */
function DateField({
  value,
  onChange,
  min,
  max,
  clearable,
  today: todayProp,
  placeholder = 'jj/mm/aaaa',
  title = 'Choisir une date',
  className,
  disabled,
  id,
  ...props
}: DateFieldProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false)
  const today = todayProp ?? todayInParis()
  const valueId = React.useId()

  // Opens on the chosen day (or today, or the first day offered), so the
  // arrows move from it at once; never on the month's ‹ button.
  const focusDay = (event: Event) => {
    const panel = event.currentTarget as HTMLElement
    const day =
      panel.querySelector<HTMLButtonElement>(
        '[data-selected=true] button:not(:disabled)',
      ) ??
      panel.querySelector<HTMLButtonElement>(
        '[data-today=true] button:not(:disabled)',
      ) ??
      panel.querySelector<HTMLButtonElement>('.rdp-day button:not(:disabled)')
    if (!day) return
    event.preventDefault()
    day.focus({ preventScroll: true })
  }

  const pick = (day: string) => {
    onChange(day)
    setOpen(false)
  }

  const trigger = (
    <button
      type="button"
      id={id}
      data-slot="date-field"
      disabled={disabled}
      aria-haspopup="dialog"
      {...props}
      aria-describedby={[valueId, props['aria-describedby']]
        .filter(Boolean)
        .join(' ')}
      className={cn(
        [
          // Like `Input`: same height, hollow, focus and invalid states;
          // lit while its calendar is open
          'flex h-9 w-full min-w-0 items-center justify-between gap-2',
          'px-3 py-1',
          fieldSurface,
          'aria-expanded:glass-field-focus data-[state=open]:glass-field-focus',
          'text-left text-base text-foreground md:text-sm',
          'disabled:pointer-events-none',
        ].join(' '),
        className,
      )}
    >
      <span
        id={valueId}
        className={cn(
          'truncate tabular-nums',
          !value && 'text-muted-foreground',
        )}
      >
        {value ? formatCalendarDay(value) : placeholder}
      </span>
      <CalendarIcon
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground"
      />
    </button>
  )

  const panel = (
    <DateFieldPanel
      value={value}
      min={min}
      max={max}
      today={today}
      clearable={clearable}
      large={isMobile}
      onPick={pick}
    />
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          onOpenAutoFocus={focusDay}
          className="gap-2 rounded-t-2xl px-[max(0.5rem,env(safe-area-inset-left))] pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="min-h-11 justify-center px-2 py-0 pr-12">
            <SheetTitle className="text-base">{title}</SheetTitle>
            <SheetDescription className="sr-only">
              Choisissez un jour dans le calendrier.
            </SheetDescription>
          </SheetHeader>
          <div className="mx-auto w-full max-w-[420px]">{panel}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[316px] p-2"
        onOpenAutoFocus={focusDay}
      >
        {panel}
      </PopoverContent>
    </Popover>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { DateField, type DateFieldProps }
