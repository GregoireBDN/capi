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
  /** Drawn chosen: a tint and a check at the end. */
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
 * utilisées », « Toutes les catégories »), separated by hairlines.
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
 * One choice of a list, the whole row a button at least 52px high: what
 * leads it, its label (and a line under it), a check once chosen. A radio
 * (`role="radio"`) by default, in a `role="radiogroup"` around the list.
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
          'flex min-h-[52px] w-full min-w-0 items-center gap-3 px-4 py-1.5 text-left',
          'transition-colors outline-none',
          'hover:bg-muted/50 focus-visible:bg-muted/60',
          'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:ring-inset',
          'disabled:pointer-events-none disabled:opacity-50',
          'data-[selected]:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]',
        ].join(' '),
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
            className="text-muted-foreground block truncate text-[13px]"
          >
            {detail}
          </span>
        )}
      </span>
      {selected && (
        <CheckIcon aria-hidden className="text-primary size-[20px] shrink-0" />
      )}
    </button>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { OptionGroup, OptionRow, type OptionGroupProps, type OptionRowProps }
