import { ToggleGroup, ToggleGroupItem, cn } from '@finances/ui'
import { CalendarIcon } from 'lucide-react'
import type { ManualSuggestionDto } from '#/api/types.gen'

/**
 * Quick-entry fields of `ManualTransactionSheet` (#196): chips a thumb can
 * tap instead of a field to type in or a list to scroll through.
 */

/** A rounded, tappable chip (44px high: the 22px root makes h-8 44px). */
export const CHIP_CLASS = cn(
  'h-8 shrink-0 rounded-full border border-input px-3',
  'text-sm font-medium whitespace-nowrap',
  'transition-colors outline-none',
  'hover:bg-muted',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
)

/** Chip look when chosen. */
const CHIP_ON = cn(
  'data-[state=on]:border-primary data-[state=on]:bg-primary/10',
  'data-[state=on]:text-primary',
  'dark:data-[state=on]:bg-primary/20',
)

/** `YYYY-MM-DD` one calendar day before `day`, without time zones. */
export function previousDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date - 1))
    .toISOString()
    .slice(0, 10)
}

const shortDay = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** `2026-11-08` → "dim. 8 nov." */
function formatShortDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return shortDay.format(new Date(Date.UTC(year, month - 1, date)))
}

/**
 * "Aujourd'hui", "Hier", then a chip that opens the native date picker (a
 * transparent date input laid over it) and shows the day picked there.
 */
export function DateChips({
  value,
  today,
  invalid,
  onChange,
}: {
  value: string
  today: string
  invalid: boolean
  onChange: (day: string) => void
}) {
  const yesterday = previousDay(today)
  const quick =
    value === today ? 'today' : value === yesterday ? 'yesterday' : ''
  const other = value !== '' && quick === ''
  return (
    <div className="flex flex-wrap gap-1.5">
      <ToggleGroup
        type="single"
        spacing={1.5}
        aria-label="Jour"
        className="flex-wrap"
        value={quick}
        onValueChange={(next) => {
          if (next === 'today') onChange(today)
          else if (next === 'yesterday') onChange(yesterday)
        }}
      >
        <ToggleGroupItem value="today" className={cn(CHIP_CLASS, CHIP_ON)}>
          Aujourd’hui
        </ToggleGroupItem>
        <ToggleGroupItem value="yesterday" className={cn(CHIP_CLASS, CHIP_ON)}>
          Hier
        </ToggleGroupItem>
      </ToggleGroup>
      <div
        data-state={other ? 'on' : 'off'}
        className={cn(
          CHIP_CLASS,
          CHIP_ON,
          'relative inline-flex items-center gap-1.5',
          'has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50',
          invalid && 'border-destructive text-destructive',
        )}
      >
        <CalendarIcon aria-hidden className="size-4" />
        <span>{other ? formatShortDay(value) : 'Autre'}</span>
        <input
          type="date"
          aria-label="Date"
          aria-invalid={invalid}
          max={today}
          value={value}
          // Transparent over the chip: a tap opens the native picker (iOS,
          // Android); desktop browsers need showPicker().
          className="absolute inset-0 size-full cursor-pointer appearance-none text-base opacity-0"
          onClick={(event) => {
            try {
              event.currentTarget.showPicker()
            } catch {
              // Not supported or not allowed: the input still takes typing.
            }
          }}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  )
}

/** Lower case without accents, to compare labels. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** Habits shown at most. */
const HABITS_MAX = 8

/**
 * "Habituels": the labels used before, each with its usual category, as one
 * row of chips that scrolls sideways (inside itself: the sheet never does).
 * A tap fills the label and, when it has one, the category. The chip of the
 * label typed shows as chosen.
 */
export function HabitChips({
  labelId,
  items,
  label,
  categoryName,
  onPick,
}: {
  labelId: string
  items: readonly ManualSuggestionDto[]
  /** The label typed, to show its chip as chosen. */
  label: string
  /** Name of a category of the kind, or undefined. */
  categoryName: (categoryId: string) => string | undefined
  onPick: (item: ManualSuggestionDto) => void
}) {
  if (items.length === 0) return null
  const typed = fold(label)
  return (
    <ul
      aria-labelledby={labelId}
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.slice(0, HABITS_MAX).map((item) => {
        const category = item.categoryId
          ? categoryName(item.categoryId)
          : undefined
        const chosen = typed !== '' && fold(item.label) === typed
        return (
          <li key={item.label} className="shrink-0">
            <button
              type="button"
              aria-pressed={chosen}
              data-state={chosen ? 'on' : 'off'}
              className={cn(CHIP_CLASS, CHIP_ON, 'font-normal')}
              onClick={() => onPick(item)}
            >
              <span className="font-medium">{item.label}</span>
              {category && (
                <span className="text-muted-foreground">
                  {' · '}
                  {category}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
