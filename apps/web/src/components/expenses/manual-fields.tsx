import {
  NativeSelect,
  NativeSelectOption,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from '@finances/ui'
import { CalendarIcon } from 'lucide-react'
import type { CategoryDto, ManualSuggestionDto } from '#/api/types.gen'

/**
 * Quick-entry fields of `ManualTransactionSheet` (#196): chips a thumb can
 * tap instead of a field to type in or a list to scroll through.
 */

/** A rounded, tappable chip (44px high: the 22px root makes h-8 44px). */
export const CHIP_CLASS = cn(
  'h-8 shrink-0 rounded-full border border-input px-3.5',
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
        <span>{other ? formatShortDay(value) : 'Autre jour'}</span>
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

/** Value of the "Autre…" list for "no category". */
const NO_CATEGORY = '__none__'

/**
 * The most used categories of the kind as chips, then "Autre…": the whole
 * list in a native select (the system picker on phones), which shows the
 * category picked there when it is not one of the chips.
 */
export function CategoryChips({
  labelId,
  categories,
  chipIds,
  value,
  allowNone,
  disabled,
  onChange,
}: {
  labelId: string
  /** Every pickable category of the kind, in list order. */
  categories: readonly CategoryDto[]
  /** Categories shown as chips, in order. */
  chipIds: readonly string[]
  value: string
  /** Whether "no category" is a valid choice (not for a new expense). */
  allowNone: boolean
  disabled: boolean
  onChange: (categoryId: string) => void
}) {
  const chips = chipIds
    .map((id) => categories.find((category) => category.id === id))
    .filter((category) => category !== undefined)
  const onChip = chips.some((category) => category.id === value)
  const listValue = onChip
    ? ''
    : value === ''
      ? allowNone
        ? NO_CATEGORY
        : ''
      : value
  return (
    <ToggleGroup
      type="single"
      spacing={1.5}
      aria-labelledby={labelId}
      className="w-full flex-wrap"
      disabled={disabled}
      value={onChip ? value : ''}
      onValueChange={(next) => {
        if (next) onChange(next)
        else if (allowNone) onChange('')
      }}
    >
      {chips.map((category) => (
        <ToggleGroupItem
          key={category.id}
          value={category.id}
          className={cn(CHIP_CLASS, CHIP_ON, 'max-w-full min-w-0')}
        >
          <span className="truncate">{category.name}</span>
        </ToggleGroupItem>
      ))}
      <NativeSelect
        aria-label="Autre catégorie"
        disabled={disabled}
        data-state={listValue === '' ? 'off' : 'on'}
        className={cn(
          'max-w-full min-w-0',
          '[&>select]:h-8 [&>select]:rounded-full [&>select]:pl-3.5 [&>select]:font-medium',
          '[&>select]:truncate',
          listValue !== '' &&
            '[&>select]:border-primary [&>select]:bg-primary/10 [&>select]:text-primary dark:[&>select]:bg-primary/20',
        )}
        value={listValue}
        onChange={(event) => {
          const next = event.target.value
          onChange(next === NO_CATEGORY ? '' : next)
        }}
      >
        <NativeSelectOption value="" disabled>
          Autre…
        </NativeSelectOption>
        {allowNone && (
          <NativeSelectOption value={NO_CATEGORY}>
            Sans catégorie
          </NativeSelectOption>
        )}
        {categories.map((category) => (
          <NativeSelectOption key={category.id} value={category.id}>
            {category.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </ToggleGroup>
  )
}

/** Lower case without accents, to match what is typed with a suggestion. */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** Suggestions shown at most under the label field. */
const SHOWN_MAX = 8

/** The suggestions matching what is typed (all of them when nothing is). */
export function matchingSuggestions(
  items: readonly ManualSuggestionDto[],
  typed: string,
): ManualSuggestionDto[] {
  const query = fold(typed)
  return items
    .filter((item) => {
      const label = fold(item.label)
      return query === '' || (label.includes(query) && label !== query)
    })
    .slice(0, SHOWN_MAX)
}

/**
 * Labels used before, as one row of chips that scrolls sideways (inside
 * itself: the sheet never does).
 */
export function LabelSuggestions({
  items,
  onPick,
}: {
  items: readonly ManualSuggestionDto[]
  onPick: (item: ManualSuggestionDto) => void
}) {
  if (items.length === 0) return null
  return (
    <ul
      aria-label="Libellés déjà utilisés"
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => (
        <li key={item.label} className="shrink-0">
          <button
            type="button"
            className={cn(CHIP_CLASS, 'bg-muted/60 font-normal')}
            onClick={() => onPick(item)}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
