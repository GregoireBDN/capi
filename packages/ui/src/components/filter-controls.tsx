'use client'

import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '../lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

/* ============================================================================
 * TYPES
 * ========================================================================= */

interface FilterValue {
  /** The chosen value's name (« Livret A »). */
  label: string
  /** Its own icon (an account badge, a `CategoryIcon`), small. */
  icon?: React.ReactNode
  /** Its colour (any CSS colour): the control is tinted with it. */
  color?: string
}

type FilterControlProps = {
  /** What it filters (« Compte »). */
  label: string
  /** The filter's own icon, shown while nothing is chosen. */
  icon: React.ReactNode
  /** The chosen value; none: the control reads « Compte Tous ⌄ ». */
  value?: FilterValue
  /** What « nothing chosen » means (« Tous », « Toutes »). */
  emptyLabel?: string
  /** Clears the value (the × of a set control). */
  onClear: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * Opens the options elsewhere instead of in a popover (a phone's
   * « Filtres » page): the control is then a plain button.
   */
  onOpen?: () => void
  /** The options, in the popover (`OptionRow`s). */
  children?: React.ReactNode
  className?: string
}

type FilterToggleProps = Omit<
  React.ComponentProps<'button'>,
  'children' | 'onChange'
> & {
  label: string
  icon: React.ReactNode
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
}

/* ============================================================================
 * STYLES
 * ========================================================================= */

/**
 * A control of a toolbar (#406): the height, corners, border and card
 * background of the search beside it, so the search and the filters read
 * as one family.
 */
const FILTER_CONTROL =
  'relative inline-flex h-[44px] max-w-full items-center gap-2 rounded-lg border text-[15px] whitespace-nowrap shadow-xs outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50'

const FILTER_CONTROL_OFF = 'bg-card hover:bg-muted/60'

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * Filter Control
 * A filter of a toolbar that opens its options in a popover (#406): « 🏛
 * Compte Tous ⌄ » while nothing is chosen, then « [value icon] Compte
 * Livret A × » tinted with the value's colour. The name of what it filters
 * stays in view, set or not.
 */
function FilterControl({
  label,
  icon,
  value,
  emptyLabel = 'Tous',
  onClear,
  open,
  onOpenChange,
  onOpen,
  children,
  className,
}: FilterControlProps) {
  // In a popover, unless the options open elsewhere (`onOpen`).
  const withOptions = (control: React.ReactNode) =>
    onOpen ? (
      control
    ) : (
      <Popover open={open} onOpenChange={onOpenChange}>
        {control}
        <PopoverContent
          align="start"
          aria-label={label}
          className="max-h-[min(30rem,var(--radix-popover-content-available-height))] w-[20rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-0"
        >
          {children}
        </PopoverContent>
      </Popover>
    )
  const triggerOf = (button: React.ReactElement) =>
    onOpen ? button : <PopoverTrigger asChild>{button}</PopoverTrigger>

  if (!value) {
    const button = (
      <button
        type="button"
        data-slot="filter-control"
        data-state="off"
        aria-label={`${label}, ${emptyLabel.toLowerCase()}`}
        onClick={onOpen}
        className={cn(
          FILTER_CONTROL,
          FILTER_CONTROL_OFF,
          'pr-2.5 pl-3 [&_svg]:shrink-0',
          className,
        )}
      >
        <span
          aria-hidden
          className="text-muted-foreground flex [&_svg]:size-[17px]"
        >
          {icon}
        </span>
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{emptyLabel}</span>
        <ChevronDownIcon
          aria-hidden
          className="text-muted-foreground size-[16px]"
        />
      </button>
    )
    return withOptions(triggerOf(button))
  }
  const tint = value.color
    ? {
        borderColor: `color-mix(in srgb, ${value.color} 60%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${value.color} 11%, var(--card))`,
      }
    : undefined
  const trigger = (
    <button
      type="button"
      aria-label={`${label} : ${value.label}, changer`}
      onClick={onOpen}
      className="-my-px flex h-[44px] min-w-0 flex-1 items-center gap-2 text-left outline-none"
    >
      {value.icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-semibold">{value.label}</span>
    </button>
  )
  return withOptions(
    <span
      data-slot="filter-control"
      data-state="on"
      className={cn(
        FILTER_CONTROL,
        !value.color &&
          'border-primary/60 bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]',
        'pr-1 pl-2',
        className,
      )}
      style={tint}
    >
      {triggerOf(trigger)}
      <button
        type="button"
        aria-label={`Retirer le filtre ${label}`}
        onClick={onClear}
        className="hover:bg-foreground/10 focus-visible:ring-ring/50 relative flex size-8 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-[3px] pointer-coarse:touch-hitbox"
      >
        <XIcon aria-hidden className="size-[15px]" />
      </button>
    </span>,
  )
}

/**
 * Filter Toggle
 * An on / off filter of a toolbar (« Exceptionnelles »), told apart from the
 * filters that open a list by its check box (#406).
 */
function FilterToggle({
  label,
  icon,
  pressed,
  onPressedChange,
  className,
  ...props
}: FilterToggleProps) {
  return (
    <button
      type="button"
      data-slot="filter-toggle"
      data-state={pressed ? 'on' : 'off'}
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        FILTER_CONTROL,
        'pr-3 pl-2.5',
        pressed
          ? 'border-primary/60 bg-[color-mix(in_srgb,var(--primary)_10%,var(--card))]'
          : FILTER_CONTROL_OFF,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-[20px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]',
          pressed
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/45',
        )}
      >
        {pressed && <CheckIcon className="size-[13px]" strokeWidth={3} />}
      </span>
      <span
        aria-hidden
        className="text-muted-foreground flex [&_svg]:size-[17px]"
      >
        {icon}
      </span>
      <span className={pressed ? 'font-semibold' : 'font-medium'}>{label}</span>
    </button>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  FILTER_CONTROL,
  FILTER_CONTROL_OFF,
  FilterControl,
  FilterToggle,
  type FilterControlProps,
  type FilterToggleProps,
  type FilterValue,
}
