import { CheckIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type OptionGroupProps = React.ComponentProps<'div'> & {
  /** The group's title (« Habituels »), small capitals above its rows. */
  title: React.ReactNode
}

type OptionRowProps = Omit<React.ComponentProps<'button'>, 'children'> & {
  /** Drawn chosen: a solid raised tile of the primary colour and a check (#544). */
  selected?: boolean
  /** Before the label: an icon, a badge (`CategoryIcon`). */
  leading?: React.ReactNode
  label: React.ReactNode
  /** One line under the label. */
  detail?: React.ReactNode
}

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * Option Group
 * Rows of a list of choices under a title (#396: « Habituels », « Les plus
 * utilisées », « Toutes les catégories »).
 */
function OptionGroup({
  title,
  className,
  children,
  ...props
}: OptionGroupProps) {
  const id = React.useId()
  return (
    <div
      role="group"
      aria-labelledby={id}
      data-slot="option-group"
      className={cn('pb-1', className)}
      {...props}
    >
      <p
        id={id}
        className="text-muted-foreground px-4 pt-4 pb-1 text-[12px] font-semibold tracking-wide uppercase"
      >
        {title}
      </p>
      <div>{children}</div>
    </div>
  )
}

/**
 * Option Row
 * One choice of a list, the whole row a rounded tile at least 52px high:
 * what leads it, its label (and a line under it), a check once chosen. The
 * chosen row is a solid raised tile of the primary colour (`glass-key`, like
 * the header's buttons), seen at a glance in both themes (#544: a tint was
 * hardly visible). A radio (`role="radio"`) by default, in a
 * `role="radiogroup"` around the list.
 */
function OptionRow({
  selected = false,
  leading,
  label,
  detail,
  className,
  role = 'radio',
  ...props
}: OptionRowProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'radio' ? selected : undefined}
      aria-pressed={role === 'button' ? selected : undefined}
      data-slot="option-row"
      data-selected={selected || undefined}
      className={cn(
        [
          'mx-1.5 flex min-h-[52px] w-[calc(100%-0.75rem)] min-w-0 items-center gap-3 rounded-xl px-2.5 py-1.5 text-left',
          'transition-colors outline-none',
          'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ring-inset',
          'disabled:pointer-events-none disabled:opacity-50',
        ].join(' '),
        selected ? 'glass-key' : 'hover:bg-muted/50 focus-visible:bg-muted/60',
        className,
      )}
      {...props}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span
          data-slot="option-label"
          className={cn(
            'block truncate text-[16px]',
            selected && 'font-semibold',
          )}
        >
          {label}
        </span>
        {detail && (
          <span
            data-slot="option-detail"
            className={cn(
              'block truncate text-[13px]',
              selected ? 'text-primary-foreground/80' : 'text-muted-foreground',
            )}
          >
            {detail}
          </span>
        )}
      </span>
      {selected && (
        <CheckIcon
          aria-hidden
          strokeWidth={3}
          className="text-primary-foreground size-[20px] shrink-0"
        />
      )}
    </button>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { OptionGroup, OptionRow, type OptionGroupProps, type OptionRowProps }
