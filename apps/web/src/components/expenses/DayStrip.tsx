import { Button, Calendar, cn } from '@finances/ui'
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
} from 'lucide-react'
import { fr } from 'react-day-picker/locale'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/* Calendar days as `YYYY-MM-DD`, never through a time zone. */

function toDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date))
}

/** `day` moved by `days` calendar days. */
export function addDays(day: string, days: number): string {
  const date = toDate(day)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** A calendar day as the date picker's local midnight (no time zone shift). */
function toLocal(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/** The picker's local date back to `YYYY-MM-DD`. */
function fromLocal(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

/** Whole days from `earlier` to `later`. */
function daysBetween(earlier: string, later: string): number {
  return Math.round(
    (toDate(later).getTime() - toDate(earlier).getTime()) / 86_400_000,
  )
}

const format = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: 'UTC' })
const WEEKDAY = format({ weekday: 'short' })
const MONTH = format({ month: 'short' })
const FULL_DAY = format({ weekday: 'short', day: 'numeric', month: 'short' })
const FULL_DAY_YEAR = format({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** « Aujourd’hui », « Hier », « mer. 18 nov. » (the year when not this one). */
export function spokenDay(day: string, today: string): string {
  if (day === today) return 'Aujourd’hui'
  if (day === addDays(today, -1)) return 'Hier'
  return (
    day.slice(0, 4) === today.slice(0, 4) ? FULL_DAY : FULL_DAY_YEAR
  ).format(toDate(day))
}

/** A tile's width and the gap between two (px): 44px targets at least. */
const TILE_MIN = 44
const GAP = 6

/**
 * Days a page shows: as many tiles as fit, 5 to 7 (5 at 320px, 7 from
 * 390px).
 */
export function daysThatFit(width: number): number {
  return Math.max(5, Math.min(7, Math.floor((width + GAP) / (TILE_MIN + GAP))))
}

/**
 * The last day of the page that holds `day`: pages of `count` days end on
 * `today`, then every `count` days before it.
 */
export function pageEndFor(day: string, today: string, count: number): string {
  const back = Math.max(0, daysBetween(day, today))
  return addDays(today, -count * Math.floor(back / count))
}

/** How far a swipe goes before it turns the page (px). */
const SWIPE_PX = 40

interface DayStripProps {
  value: string
  onChange: (day: string) => void
  /** Today in Europe/Paris: the last day offered. */
  today: string
  invalid?: boolean
  /** The month opens or closes (the sheet makes room for it). */
  onPickingChange?: (picking: boolean) => void
}

/**
 * The day of a transaction (#398, the owner's « bande de jours »): one row
 * of whole days, the oldest on the left and today at the end like a
 * calendar, as many as fit (never a tile cut in half). ‹ and › above it, or
 * a swipe, turn the page; the calendar button reaches any day. The chosen
 * day is named above the strip.
 */
export function DayStrip({
  value,
  onChange,
  today,
  invalid,
  onPickingChange,
}: DayStripProps) {
  const strip = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(7)
  const [end, setEnd] = useState(() => pageEndFor(value || today, today, 7))
  const [slide, setSlide] = useState<'earlier' | 'later' | null>(null)
  const swipe = useRef<{ x: number; turned: boolean } | null>(null)
  // The month on screen (#398 feedback): any day, one tap.
  const [picking, setPickingState] = useState(false)
  const setPicking = (open: boolean) => {
    setPickingState(open)
    onPickingChange?.(open)
  }

  useLayoutEffect(() => {
    const node = strip.current
    if (!node) return
    const measure = () => {
      // Not laid out (a hidden step, tests): keep the default.
      if (node.clientWidth > 0) setCount(daysThatFit(node.clientWidth))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // The page holding the chosen day, whenever it or the width changes.
  useEffect(() => {
    setEnd(pageEndFor(value || today, today, count))
  }, [value, today, count])

  const days = Array.from({ length: count }, (_, index) =>
    addDays(end, index - count + 1),
  )
  const atToday = end >= today

  function turn(pages: number) {
    if (pages > 0 && atToday) return
    setSlide(pages < 0 ? 'earlier' : 'later')
    setEnd((current) => {
      const next = addDays(current, pages * count)
      return next > today ? today : next
    })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-[44px] items-center gap-1">
        <p
          className={cn(
            'min-w-0 flex-1 truncate px-1 text-sm font-medium first-letter:uppercase',
            invalid && 'text-destructive',
          )}
          aria-live="polite"
        >
          {value ? spokenDay(value, today) : 'Choisissez un jour'}
        </p>
        {!picking && (
          <>
            <Button
              type="button"
              variant="secondary"
              ghost
              iconOnly
              aria-label="Jours précédents"
              title="Jours précédents"
              onClick={() => turn(-1)}
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              type="button"
              variant="secondary"
              ghost
              iconOnly
              aria-label="Jours suivants"
              title="Jours suivants"
              disabled={atToday}
              onClick={() => turn(1)}
            >
              <ChevronRightIcon />
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="secondary"
          ghost
          iconOnly
          aria-label={
            picking ? 'Fermer le calendrier' : 'Choisir dans le calendrier'
          }
          title={
            picking ? 'Fermer le calendrier' : 'Choisir dans le calendrier'
          }
          aria-expanded={picking}
          onClick={() => setPicking(!picking)}
        >
          {picking ? <XIcon /> : <CalendarIcon />}
        </Button>
      </div>
      {picking && (
        <Calendar
          mode="single"
          locale={fr}
          required
          selected={value ? toLocal(value) : undefined}
          defaultMonth={toLocal(value || today)}
          endMonth={toLocal(today)}
          disabled={{ after: toLocal(today) }}
          onSelect={(date: Date) => {
            onChange(fromLocal(date))
            setPicking(false)
          }}
          // The width of a phone at most, so a whole month shows in a dialog
          // too (#398); px, as the app's root is 22px. Days 40px at least.
          className="mx-auto w-full max-w-[320px] bg-transparent p-0 [--cell-size:40px] [&_.rdp-caption_label]:first-letter:uppercase"
          showOutsideDays={false}
          classNames={{ root: 'rdp-root w-full' }}
        />
      )}
      <div
        ref={strip}
        hidden={picking}
        role="radiogroup"
        aria-label="Jour"
        aria-invalid={invalid || undefined}
        className="touch-pan-y overflow-hidden"
        onPointerDown={(event) => {
          swipe.current = { x: event.clientX, turned: false }
        }}
        onPointerUp={(event) => {
          const start = swipe.current
          if (!start) return
          const dx = event.clientX - start.x
          if (Math.abs(dx) < SWIPE_PX) return
          start.turned = true
          turn(dx > 0 ? -1 : 1)
        }}
        onClickCapture={(event) => {
          // A swipe that ends on a tile doesn't choose it.
          if (swipe.current?.turned) {
            event.preventDefault()
            event.stopPropagation()
          }
          swipe.current = null
        }}
      >
        <div
          key={end}
          style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
          className={cn(
            'grid gap-[6px]',
            slide &&
              'animate-in fade-in duration-200 motion-reduce:animate-none',
            slide === 'earlier' && 'slide-in-from-left-6',
            slide === 'later' && 'slide-in-from-right-6',
          )}
        >
          {days.map((day) => {
            const on = day === value
            const date = toDate(day)
            // The weekday, « Auj. » for today, the month on its 1st.
            const top =
              day === today
                ? 'Auj.'
                : date.getUTCDate() === 1
                  ? MONTH.format(date)
                  : WEEKDAY.format(date).replace('.', '')
            return (
              <button
                key={day}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={spokenDay(day, today)}
                onClick={() => onChange(day)}
                className={cn(
                  'flex h-[64px] min-w-0 flex-col items-center justify-center rounded-xl transition-colors outline-none',
                  'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                  on
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/70 text-muted-foreground hover:bg-muted dark:bg-muted/50',
                )}
              >
                <span className="text-[12px] leading-none font-medium">
                  {top}
                </span>
                <span
                  className={cn(
                    'text-[20px] leading-tight font-semibold tabular-nums',
                    !on && (day === today ? 'text-primary' : 'text-foreground'),
                  )}
                >
                  {date.getUTCDate()}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
