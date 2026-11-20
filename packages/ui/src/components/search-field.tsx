'use client'

import { SearchIcon, XIcon } from 'lucide-react'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type SearchFieldProps = Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'defaultValue'
> & {
  value: string
  onValueChange: (value: string) => void
  /** Accessible name of the ✕ that empties it. */
  clearLabel?: string
  /** Class of the box around the field. */
  containerClassName?: string
}

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * Search Field
 * A search box 44px high (#396): a magnifier, the text at 16px (iOS zooms
 * on smaller), a ✕ that empties it and gives the focus back once something
 * is typed. The browser's own clear button is hidden.
 */
function SearchField({
  value,
  onValueChange,
  clearLabel = 'Effacer la recherche',
  className,
  containerClassName,
  ref,
  ...props
}: SearchFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)
  return (
    <div
      data-slot="search-field"
      className={cn('relative', containerClassName)}
    >
      <SearchIcon
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          [
            'h-[44px] w-full min-w-0 rounded-lg border border-input bg-transparent',
            'pr-[44px] pl-[40px] text-[16px]',
            'placeholder:text-muted-foreground transition-colors outline-none',
            'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            '[&::-webkit-search-cancel-button]:appearance-none',
            'dark:bg-input/30',
          ].join(' '),
          className,
        )}
        {...props}
      />
      {value !== '' && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => {
            onValueChange('')
            inputRef.current?.focus()
          }}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute top-1/2 right-[4px] flex size-[36px] -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] pointer-coarse:touch-hitbox"
        >
          <XIcon aria-hidden className="size-[16px]" />
        </button>
      )}
    </div>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { SearchField, type SearchFieldProps }
