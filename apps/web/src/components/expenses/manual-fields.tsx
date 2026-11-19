import { Button, ToggleGroup, ToggleGroupItem, cn } from '@finances/ui'
import {
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  DeleteIcon,
} from 'lucide-react'
import type { AccountDto, ManualSuggestionDto } from '#/api/types.gen'
import type { AmountKey } from './amount-entry'

/**
 * Quick-entry fields of `ManualTransactionSheet` (#196, #245): chips and
 * tiles a thumb can tap instead of a field to type in or a list to scroll
 * through, and the keypad the amount is typed on.
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
export const CHIP_ON = cn(
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

/** Look of a habit tile. */
const TILE_CLASS = cn(
  'border-input flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 py-1 text-left',
  'text-sm font-medium transition-colors outline-none hover:bg-muted',
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
)

/** Habits shown at most: two rows of two, so the keypad stays in view. */
const HABITS_MAX = 4

/** The colour dot of a category (muted when it has none). */
export function CategoryDot({ color }: { color: string | null | undefined }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-2.5 shrink-0 rounded-full',
        !color && 'bg-muted-foreground/40',
      )}
      style={color ? { backgroundColor: color } : undefined}
    />
  )
}

/**
 * "Habituels": the labels used before, each with its usual category, as a
 * grid of two columns (never cut by the sheet's edge, #245). A tap fills the
 * label and, when it has one, the category. The tile of the label typed
 * shows as chosen.
 */
export function HabitGrid({
  labelId,
  items,
  label,
  category,
  onPick,
}: {
  labelId: string
  items: readonly ManualSuggestionDto[]
  /** The label typed, to show its tile as chosen. */
  label: string
  /** A category of the kind, or undefined. */
  category: (
    categoryId: string,
  ) => { name: string; color: string | null } | undefined
  onPick: (item: ManualSuggestionDto) => void
}) {
  if (items.length === 0) return null
  const typed = fold(label)
  return (
    <ul aria-labelledby={labelId} className="grid grid-cols-2 gap-1.5">
      {items.slice(0, HABITS_MAX).map((item) => {
        const usual = item.categoryId ? category(item.categoryId) : undefined
        const chosen = typed !== '' && fold(item.label) === typed
        return (
          <li key={item.label} className="min-w-0">
            <button
              type="button"
              aria-pressed={chosen}
              data-state={chosen ? 'on' : 'off'}
              className={cn(
                TILE_CLASS,
                'flex-col items-start justify-center gap-0 font-normal',
                CHIP_ON,
              )}
              onClick={() => onPick(item)}
            >
              <span className="w-full truncate text-sm font-medium">
                {item.label}
              </span>
              {usual && (
                <span className="text-muted-foreground flex w-full min-w-0 items-center gap-1 text-xs">
                  <CategoryDot color={usual.color} />
                  <span className="sr-only"> · </span>
                  <span className="truncate">{usual.name}</span>
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Value of the "Sans catégorie" tile (the review queue). */
export const NO_CATEGORY = 'none'

/**
 * The kind's categories as chips that wrap, most likely first, all of them
 * (the step is about this one choice, #245): nothing scrolls sideways or is
 * cut. "Sans catégorie" comes last when the kind allows it. A tap chooses,
 * even the tile already chosen (to move on).
 */
export function CategoryChips({
  labelId,
  categories,
  value,
  allowNone,
  onChoose,
}: {
  labelId: string
  /** Ordered, most likely first. */
  categories: readonly { id: string; name: string; color: string | null }[]
  /** The chosen category id, or '' for none. */
  value: string
  allowNone: boolean
  onChoose: (categoryId: string) => void
}) {
  const options = [
    ...categories,
    ...(allowNone
      ? [{ id: NO_CATEGORY, name: 'Sans catégorie', color: null }]
      : []),
  ]
  const current = value === '' ? (allowNone ? NO_CATEGORY : '') : value
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((category) => {
        const chosen = category.id === current
        return (
          <button
            key={category.id}
            type="button"
            role="radio"
            aria-checked={chosen}
            data-state={chosen ? 'on' : 'off'}
            className={cn(
              CHIP_CLASS,
              CHIP_ON,
              'inline-flex items-center gap-1.5',
            )}
            onClick={() =>
              onChoose(category.id === NO_CATEGORY ? '' : category.id)
            }
          >
            {category.id !== NO_CATEGORY && (
              <CategoryDot color={category.color} />
            )}
            {category.name}
          </button>
        )
      })}
    </div>
  )
}

const KEYPAD_DIGITS: readonly AmountKey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  ',',
  '0',
  'back',
]

/**
 * The sheet's own numeric keypad (#245): no system keyboard, so no
 * accessory bar or keyboard inset, and the action is a key of it, under the
 * thumb. Digits on three columns as on a phone, the action ("Suivant") the
 * height of the fourth.
 */
export function AmountKeypad({
  onKey,
  submitLabel,
  submitIcon = 'check',
  loading,
  disabled,
}: {
  onKey: (key: AmountKey) => void
  submitLabel: string
  /** "next" for a step that leads to another one. */
  submitIcon?: 'check' | 'next'
  loading: boolean
  disabled: boolean
}) {
  return (
    <div
      role="group"
      aria-label="Pavé numérique"
      className="@container grid touch-manipulation grid-cols-[1fr_1fr_1fr_1.25fr] gap-1.5 select-none"
    >
      {KEYPAD_DIGITS.map((key, index) => (
        <button
          key={key}
          type="button"
          aria-label={key === 'back' ? 'Effacer' : undefined}
          style={{
            gridColumn: (index % 3) + 1,
            gridRow: Math.floor(index / 3) + 1,
          }}
          className={cn(
            'bg-background flex h-[2.2rem] items-center justify-center rounded-lg text-xl font-medium tabular-nums shadow-xs',
            'short-screen:h-8 transition-colors outline-none active:bg-muted',
            'focus-visible:ring-3 focus-visible:ring-ring/50',
            'dark:bg-input/40 dark:active:bg-input/70',
          )}
          onClick={() => onKey(key)}
        >
          {key === 'back' ? <DeleteIcon aria-hidden className="size-6" /> : key}
        </button>
      ))}
      <Button
        type="submit"
        loading={loading}
        disabled={disabled}
        style={{ gridColumn: 4, gridRow: '1 / span 4' }}
        className="h-auto flex-col gap-1 rounded-lg px-1 font-semibold [&_svg]:size-7"
      >
        {submitIcon === 'next' ? (
          <ChevronRightIcon aria-hidden />
        ) : (
          <CheckIcon aria-hidden />
        )}
        {/* Sized on the keypad: "Enregistrer" fits its key at 320px. */}
        <span className="text-[min(0.875rem,4.2cqi)] whitespace-nowrap">
          {submitLabel}
        </span>
      </Button>
    </div>
  )
}

/**
 * The account as chips (#298): « Payé avec » the bank account or the
 * meal-voucher card, one tap, for the categories the card pays.
 */
export function AccountChips({
  labelId,
  accounts,
  value,
  onChange,
}: {
  labelId: string
  accounts: readonly Pick<AccountDto, 'id' | 'name'>[]
  value: string
  onChange: (accountId: string) => void
}) {
  return (
    <ToggleGroup
      type="single"
      spacing={1.5}
      aria-labelledby={labelId}
      className="flex-wrap"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next)
      }}
    >
      {accounts.map((account) => (
        <ToggleGroupItem
          key={account.id}
          value={account.id}
          className={cn(CHIP_CLASS, CHIP_ON, 'max-w-full')}
        >
          <span className="truncate">{account.name}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
