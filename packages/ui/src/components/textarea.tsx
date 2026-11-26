import * as React from 'react'

import { fieldSurface } from '../lib/field'
import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type TextareaProps = React.ComponentProps<'textarea'>

/* ============================================================================
 * COMPONENT
 * ========================================================================= */

/**
 * Textarea
 * Multi-line text input with auto-resizing capability
 * Uses field-sizing-content for automatic height adjustment
 */
function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        [
          // Layout
          'flex field-sizing-content',
          'min-h-16 w-full',

          // Spacing
          'px-3 py-2',

          // Styling: the glass hollow, focus glow, invalid (#507)
          fieldSurface,

          // Typography
          'text-base md:text-sm',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export { Textarea, type TextareaProps }
