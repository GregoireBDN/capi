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
  /** What « nothing chosen » means (« Tous », « Toutes »), said to screen readers. */
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
 * A control of a toolbar (#406): the height, corners and glass hollow of the
 * search beside it (#507), so the search and the filters read as one
 * family. Lit like a focused field while its options are open.
 */
const FILTER_CONTROL =
  'relative inline-flex h-[44px] max-w-full min-w-0 items-center gap-2 rounded-control text-[15px] whitespace-nowrap outline-none transition-[background-color,box-shadow] focus-visible:glass-field-focus has-[[aria-expanded=true]]:glass-field-focus aria-expanded:glass-field-focus'

const FILTER_CONTROL_OFF = 'glass-field'

/** A chosen value: a tint of its colour (the primary's by default), no edge. */
const FILTER_CONTROL_ON =
  'bg-[color-mix(in_oklch,var(--filter-tint,var(--primary))_13%,var(--card))]'

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/** The icon of a control, in a box of one size set or not (no shift). */
function ControlIcon({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="text-muted-foreground flex size-[1.15rem] shrink-0 items-center justify-center [&_svg]:size-[17px]"
    >
      {children}
    </span>
  )
}

/**
 * Filter Control
 * A filter of a toolbar that opens its options in a popover (#406), like a
 * field with a floating label (the owner's request): « 🏛 Compte ⌄ », its
 * name as a placeholder, while nothing is chosen; then « [value icon]
 * Livret A × » tinted with the value's colour, its name small above the
 * value inside the control (#507). Its size never changes with
 * its value: give it its width (`className`, a grid cell); the value is cut
 * with « … ».
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
          'pr-1 pl-2.5 text-left',
          className,
        )}
      >
        <ControlIcon>{icon}</ControlIcon>
        {/* Its name in place of a value, like a field's placeholder. */}
        <span className="text-muted-foreground min-w-0 flex-1 truncate">
          {label}
        </span>
        <span
          aria-hidden
          className="text-muted-foreground flex size-7 shrink-0 items-center justify-center"
        >
          <ChevronDownIcon className="size-[16px]" />
        </span>
      </button>
    )
    return withOptions(triggerOf(button))
  }
  const tint = value.color
    ? ({ '--filter-tint': value.color } as React.CSSProperties)
    : undefined
  const trigger = (
    <button
      type="button"
      aria-label={`${label} : ${value.label}, changer`}
      title={value.label}
      onClick={onOpen}
      className="-my-px flex h-[44px] min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
    >
      <ControlIcon>{value.icon ?? icon}</ControlIcon>
      {/* Its name above its value, inside the control (#507: no edge to
          sit on any more). */}
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span
          aria-hidden
          className="text-muted-foreground truncate text-[12px] font-medium"
        >
          {label}
        </span>
        <span className="truncate text-[14px] font-semibold">
          {value.label}
        </span>
      </span>
    </button>
  )
  return withOptions(
    <span
      data-slot="filter-control"
      data-state="on"
      className={cn(
        FILTER_CONTROL,
        FILTER_CONTROL_ON,
        'gap-1.5 pr-1 pl-2',
        className,
      )}
      style={tint}
    >
      {triggerOf(trigger)}
      <button
        type="button"
        aria-label={`Retirer le filtre ${label}`}
        onClick={onClear}
        className="hover:bg-foreground/10 focus-visible:ring-ring/50 relative flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] pointer-coarse:touch-hitbox"
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
        'pr-3 pl-2.5 text-left',
        pressed ? FILTER_CONTROL_ON : FILTER_CONTROL_OFF,
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-[20px] shrink-0 items-center justify-center rounded-[6px]',
          pressed
            ? 'bg-primary text-primary-foreground shadow-glass-primary'
            : 'bg-card shadow-[inset_0_0_0_1.5px_oklch(from_var(--foreground)_l_c_h/30%)]',
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
