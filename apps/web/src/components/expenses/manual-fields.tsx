import { CategoryIcon, ToggleGroup, ToggleGroupItem, cn } from '@finances/ui'
import { CalendarIcon } from 'lucide-react'
import type { AccountDto, ManualSuggestionDto } from '#/api/types.gen'

/**
 * Quick-entry fields of `ManualTransactionSheet` (#196, #245): chips and
 * tiles a thumb can tap instead of a field to type in or a list to scroll
 * through.
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

/** Habits shown at most: two rows of two, so the categories stay in view. */
const HABITS_MAX = 4

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
  ) => { name: string; color: string | null; icon: string | null } | undefined
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
                  <CategoryIcon
                    icon={usual.icon}
                    color={usual.color}
                    size="sm"
                  />
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
  categories: readonly {
    id: string
    name: string
    color: string | null
    icon: string | null
  }[]
  /** The chosen category id, or '' for none. */
  value: string
  allowNone: boolean
  onChoose: (categoryId: string) => void
}) {
  const options = [
    ...categories,
    ...(allowNone
      ? [{ id: NO_CATEGORY, name: 'Sans catégorie', color: null, icon: null }]
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
              <CategoryIcon
                icon={category.icon}
                color={category.color}
                size="sm"
              />
            )}
            {category.name}
          </button>
        )
      })}
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

/**
 * The meal-voucher card's day (#298): a bar of the 25 € cap with what is
 * already paid that day, then this payment (red when it goes over), and
 * what is left after it, or the most the card can still pay.
 */
export function VoucherDayGauge({
  capCents,
  paidCents,
  amountCents,
  when,
}: {
  capCents: number
  paidCents: number
  amountCents: number
  /** « aujourd’hui », « hier », « le 12 nov. 2026 ». */
  when: string
}) {
  const left = Math.max(0, capCents - paidCents)
  const over = amountCents > left
  const share = (cents: number) =>
    `${(Math.min(Math.max(cents, 0), capCents) / capCents) * 100}%`
  const euros = (cents: number) =>
    euroFormat.format(cents / 100).replace(/[,.]00(?=\s?€)/, '')
  return (
    <div className="w-full space-y-1 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-foreground truncate">
          Plafond {euros(capCents)} · {when}
        </span>
        <span
          className={cn(
            'shrink-0 font-medium tabular-nums',
            over && 'text-destructive',
          )}
        >
          {over ? `${euros(left)} max` : `Reste ${euros(left - amountCents)}`}
        </span>
      </div>
      <div
        aria-hidden
        className="bg-muted flex h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-muted-foreground/40"
          style={{ width: share(paidCents) }}
        />
        <div
          className={over ? 'bg-destructive' : 'bg-primary'}
          style={{ width: share(over ? left : amountCents) }}
        />
      </div>
    </div>
  )
}

const euroFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
