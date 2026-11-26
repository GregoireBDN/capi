'use client'

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'
import * as React from 'react'
import {
  DayPicker,
  getDefaultClassNames,
  type CustomComponents,
  type DayButton,
  type Locale,
} from 'react-day-picker'

import { buttonBase, getVariantClasses, type ButtonProps } from './button'
import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type CalendarCaptionLayout =
  | 'label'
  | 'dropdown'
  | 'dropdown-months'
  | 'dropdown-years'

type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  /** Variant to use for navigation buttons and day buttons (default: secondary) */
  buttonVariant?: ButtonProps['variant']
  /** Layout for the month/year caption (default: label) */
  captionLayout?: CalendarCaptionLayout
}

type CalendarDayButtonProps = React.ComponentProps<typeof DayButton> & {
  /** Locale for date formatting */
  locale?: Partial<Locale>
  /** Variant to use for the day button */
  variant?: ButtonProps['variant']
}

/* ============================================================================
 * PARTS (stable components, see `components` below)
 * ========================================================================= */

function CalendarRoot({
  className,
  rootRef,
  ...props
}: React.ComponentProps<NonNullable<CustomComponents['Root']>>) {
  return (
    <div
      data-slot="calendar"
      ref={rootRef}
      className={cn(className)}
      {...props}
    />
  )
}

function CalendarChevron({
  className,
  orientation,
  ...props
}: React.ComponentProps<NonNullable<CustomComponents['Chevron']>>) {
  if (orientation === 'left') {
    return <ChevronLeftIcon className={cn('size-4', className)} {...props} />
  }
  if (orientation === 'right') {
    return <ChevronRightIcon className={cn('size-4', className)} {...props} />
  }
  return <ChevronDownIcon className={cn('size-4', className)} {...props} />
}

function CalendarWeekNumber({
  children,
  ...props
}: React.ComponentProps<NonNullable<CustomComponents['WeekNumber']>>) {
  return (
    <td {...props}>
      <div className="flex size-(--cell-size) items-center justify-center text-center">
        {children}
      </div>
    </td>
  )
}

/* ============================================================================
 * CALENDAR (ROOT COMPONENT)
 * ========================================================================= */

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'secondary',
  locale,
  formatters,
  components,
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames()

  // Get button styles based on variant (always use ghost visual style)
  const navButtonClasses = getVariantClasses(buttonVariant, 'ghost')

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        [
          // Base styles
          'group/calendar bg-background p-2',

          // CSS variables for cell sizing
          '[--cell-radius:var(--radius-md)]',
          '[--cell-size:--spacing(7)]',

          // Transparent background in specific slots
          'in-data-[slot=card-content]:bg-transparent',
          'in-data-[slot=popover-content]:bg-transparent',

          // RTL support for navigation buttons
          String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
          String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        ].join(' '),
        className,
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: 'short' }),
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn(
          'relative flex flex-col gap-4 md:flex-row',
          defaultClassNames.months,
        ),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaultClassNames.nav,
        ),
        // Navigation buttons
        button_previous: cn(
          buttonBase(),
          navButtonClasses,
          [
            'size-(--cell-size) p-0',
            'select-none',
            'aria-disabled:opacity-50',
          ].join(' '),
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonBase(),
          navButtonClasses,
          [
            'size-(--cell-size) p-0',
            'select-none',
            'aria-disabled:opacity-50',
          ].join(' '),
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium',
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          'relative rounded-(--cell-radius)',
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn(
          'absolute inset-0 bg-popover opacity-0',
          defaultClassNames.dropdown,
        ),
        caption_label: cn(
          'font-medium select-none',
          captionLayout === 'label'
            ? 'text-sm'
            : 'flex items-center gap-1 rounded-(--cell-radius) text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground',
          defaultClassNames.caption_label,
        ),
        table: 'w-full border-collapse',
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none',
          defaultClassNames.weekday,
        ),
        week: cn('mt-1 flex w-full', defaultClassNames.week),
        week_number_header: cn(
          'w-(--cell-size) select-none',
          defaultClassNames.week_number_header,
        ),
        week_number: cn(
          'text-[0.8rem] text-muted-foreground select-none',
          defaultClassNames.week_number,
        ),
        // A day's cell: the whole cell is the target, its round pastille
        // drawn by `CalendarDayButton` (#488), whose states it carries.
        day: cn(
          'flex flex-1 items-center justify-center p-0 text-center select-none',
          defaultClassNames.day,
        ),
        // A range: a band behind the days between its ends.
        range_start: cn(
          'rounded-l-full bg-primary/10',
          defaultClassNames.range_start,
        ),
        range_middle: cn('bg-primary/10', defaultClassNames.range_middle),
        range_end: cn(
          'rounded-r-full bg-primary/10',
          defaultClassNames.range_end,
        ),
        today: defaultClassNames.today,
        outside: defaultClassNames.outside,
        disabled: defaultClassNames.disabled,
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        // Defined once, outside the render: a component made anew on each
        // render would remount the whole calendar (its month and year lists
        // losing the focus as soon as they change, #488).
        Root: CalendarRoot,
        Chevron: CalendarChevron,
        DayButton: CalendarDayButton,
        WeekNumber: CalendarWeekNumber,
        ...components,
      }}
      {...props}
    />
  )
}

/* ============================================================================
 * CALENDAR DAY BUTTON
 * ========================================================================= */

/**
 * A day (#488, the owner: « des pastilles toujours rondes » and the days one
 * can pick plainly told from the others). The whole cell is the button; the
 * day is a round pastille inside it, as wide as the cell allows up to
 * `--cell-size`, square by its width so it is never an oval:
 * - a day to pick: a soft filled pastille, the figure in the text colour;
 * - a day of the month before or after: a fainter pastille, a muted figure;
 * - today: a ring and the figure in the primary colour;
 * - the chosen day: filled with the primary colour;
 * - a day that can't be picked: no pastille, the figure faded and struck
 *   through, no hover.
 * `--day-text` sets the figures' size (15px by default).
 */
function CalendarDayButton({
  className,
  day: _day,
  modifiers,
  locale: _locale,
  variant: _variant,
  children,
  ...props
}: CalendarDayButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  const inRange =
    modifiers.range_start || modifiers.range_end || modifiers.range_middle
  const chosen =
    modifiers.selected &&
    (!inRange || modifiers.range_start || modifiers.range_end)

  return (
    <button
      ref={ref}
      {...props}
      data-selected={chosen || undefined}
      data-range-middle={(modifiers.range_middle && !chosen) || undefined}
      data-today={modifiers.today || undefined}
      data-outside={modifiers.outside || undefined}
      data-disabled={modifiers.disabled || undefined}
      className={cn(
        'group/day flex w-full items-center justify-center p-[2px] outline-none',
        'disabled:cursor-not-allowed data-disabled:cursor-not-allowed',
        className,
      )}
    >
      <span
        className={cn(
          // Round, always: square by its width, at most `--cell-size`
          'flex aspect-square w-full max-w-(--cell-size) items-center justify-center rounded-full',
          'text-[length:var(--day-text,15px)] leading-none tabular-nums',
          'transition-colors motion-reduce:transition-none',
          // Keyboard focus
          'group-focus-visible/day:ring-3 group-focus-visible/day:ring-ring/60',
          modifiers.disabled
            ? // A day that can't be picked: no pastille, faded, struck through
              'font-normal text-muted-foreground/45 line-through decoration-muted-foreground/45'
            : chosen
              ? // The chosen day
                'bg-primary font-bold text-primary-foreground shadow-sm'
              : cn(
                  'font-medium group-hover/day:bg-primary/15 group-hover/day:text-primary',
                  modifiers.range_middle
                    ? 'text-primary'
                    : modifiers.outside
                      ? // The month before or after: still to pick, fainter
                        'bg-muted/45 text-muted-foreground'
                      : // A day to pick
                        'bg-muted text-foreground',
                  // Today: a ring in the primary colour
                  modifiers.today &&
                    'font-bold text-primary ring-2 ring-primary ring-inset',
                ),
        )}
      >
        {children}
      </span>
    </button>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  Calendar,
  CalendarDayButton,
  type CalendarCaptionLayout,
  type CalendarDayButtonProps,
  type CalendarProps,
}
