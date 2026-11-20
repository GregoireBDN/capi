import {
  cn,
  Input,
  NotificationCount,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@finances/ui'
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'

export interface FilterChipOption {
  value: string
  label: string
  /** Heading the option is listed under (category kinds). */
  group?: string
}

/** The pill look shared by the filter chips: 44px, sized to its content. */
const CHIP =
  'inline-flex min-h-8 items-center gap-1 rounded-full border text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
const CHIP_OFF = 'bg-background text-foreground hover:bg-muted'
const CHIP_ON = 'border-primary bg-primary/10 text-primary'

/** Ignores case and accents ("energie" finds « Énergie »). */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

interface FilterChipProps {
  /** What it filters ("Compte"). */
  label: string
  value: string | undefined
  options: readonly FilterChipOption[]
  onChange: (value: string | undefined) => void
  /** A search field above the options (categories). */
  searchable?: boolean
  /** Shown only when set (phones: the « Filtres » sheet sets them). */
  hideWhenUnset?: boolean
}

/**
 * A filter as a chip: « Compte ⌄ » while unset, « Compte : Livret A × »
 * once set (filled, × clears it). The chip opens its options in a popover.
 */
export function FilterChip({
  label,
  value,
  options,
  onChange,
  searchable = false,
  hideWhenUnset = false,
}: FilterChipProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.value === value)

  const shown = useMemo(() => {
    const needle = fold(query.trim())
    return needle === ''
      ? options
      : options.filter((option) => fold(option.label).includes(needle))
  }, [options, query])

  const pick = (next: string | undefined) => {
    setOpen(false)
    setQuery('')
    onChange(next)
  }

  const trigger = selected ? (
    <button
      type="button"
      aria-label={`${label} : ${selected.label}, changer`}
      className="flex min-h-8 min-w-0 items-center gap-1 rounded-l-full py-1 pl-3 outline-none"
    >
      <span className="truncate">
        {label} : {selected.label}
      </span>
    </button>
  ) : (
    <button
      type="button"
      aria-label={`${label}, tous`}
      className={cn(
        CHIP,
        CHIP_OFF,
        'pointer-coarse:touch-hitbox relative px-3',
      )}
    >
      {label}
      <ChevronDownIcon aria-hidden className="size-4 opacity-60" />
    </button>
  )

  let lastGroup: string | undefined
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      {selected ? (
        <span
          data-slot="filter-chip"
          data-state="on"
          className={cn(CHIP, CHIP_ON, 'max-w-full pr-1')}
        >
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <button
            type="button"
            aria-label={`Retirer le filtre ${label}`}
            onClick={() => pick(undefined)}
            className="hover:bg-primary/15 pointer-coarse:touch-hitbox relative flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
          >
            <XIcon aria-hidden className="size-4" />
          </button>
        </span>
      ) : (
        <span
          data-slot="filter-chip"
          data-state="off"
          className={cn(
            'inline-flex',
            hideWhenUnset && 'hidden @[672px]:inline-flex',
          )}
        >
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        </span>
      )}
      <PopoverContent
        align="start"
        aria-label={label}
        className="max-h-[min(24rem,var(--radix-popover-content-available-height))] w-72 overflow-y-auto p-1.5"
      >
        {searchable && (
          <Input
            type="search"
            aria-label={`Rechercher ${label.toLowerCase()}`}
            placeholder="Rechercher…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mb-1.5"
            autoComplete="off"
          />
        )}
        <ul className="space-y-0.5" aria-label={`Choix : ${label}`}>
          {query.trim() === '' && (
            <li>
              <OptionButton
                label="Tous"
                selected={value === undefined}
                onSelect={() => pick(undefined)}
              />
            </li>
          )}
          {shown.map((option) => {
            const heading =
              option.group !== undefined && option.group !== lastGroup
                ? option.group
                : undefined
            lastGroup = option.group
            return (
              <li key={option.value}>
                {heading && (
                  <p className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">
                    {heading}
                  </p>
                )}
                <OptionButton
                  label={option.label}
                  selected={option.value === value}
                  onSelect={() => pick(option.value)}
                />
              </li>
            )
          })}
          {shown.length === 0 && (
            <li className="text-muted-foreground px-2 py-2 text-sm">
              Aucun résultat
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function OptionButton({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'hover:bg-muted flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-[3px]',
        selected && 'font-medium',
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      {selected && <CheckIcon aria-hidden className="text-primary size-4" />}
    </button>
  )
}

/** An on / off chip (« À revoir », « Ponctuelles »). */
export function ToggleChip({
  label,
  pressed,
  onPressedChange,
  hideWhenOff = false,
  count,
}: {
  label: string
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  /** Shown only when on (phones: the « Filtres » sheet turns it on). */
  hideWhenOff?: boolean
  /**
   * What the filter would show (#393: the transactions to review), set
   * forward while off: its number astride the chip's corner
   * (`NotificationCount`), on every width; `label` says it to screen
   * readers (« 7 opérations à revoir »).
   */
  count?: { value: number; label: string }
}) {
  const counted = !pressed && count !== undefined && count.value > 0
  return (
    <button
      type="button"
      data-slot="filter-chip"
      data-state={pressed ? 'on' : 'off'}
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        CHIP,
        pressed ? CHIP_ON : CHIP_OFF,
        'pointer-coarse:touch-hitbox relative px-3',
        counted && 'border-primary/50 text-primary hover:bg-primary/10',
        hideWhenOff && !pressed && !counted && 'hidden @[672px]:inline-flex',
      )}
    >
      {label}
      {pressed && <XIcon aria-hidden className="size-4" />}
      {/* Astride the chip's corner, like an app's notification badge (#393). */}
      {counted && <NotificationCount value={count.value} label={count.label} />}
    </button>
  )
}
