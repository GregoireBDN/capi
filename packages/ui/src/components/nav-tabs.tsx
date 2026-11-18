import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type NavTabsProps = React.ComponentProps<'nav'>
type NavTabsLinkProps = React.ComponentProps<'a'> & {
  /** The page shown: underlined and announced as the current page. */
  active?: boolean
  /** Render the child (e.g. a router `Link`) instead of an `<a>`. */
  asChild?: boolean
}

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * Nav Tabs
 * Underlined tabs that switch between sibling pages, each with its own URL.
 * Links, not ARIA tabs (`role="tablist"` is for panels on one page): give
 * the `nav` an `aria-label`. Every tab has the width of the widest one; on
 * phones the row fills the width, from `sm` up it keeps to its tabs, over a
 * line that spans the whole width.
 */
function NavTabs({ className, children, ...props }: NavTabsProps) {
  return (
    <nav
      data-slot="nav-tabs"
      className={cn('border-border w-full border-b', className)}
      {...props}
    >
      <div className="-mb-px grid w-full auto-cols-fr grid-flow-col sm:inline-grid sm:w-auto">
        {children}
      </div>
    </nav>
  )
}

/**
 * Nav Tabs Link
 * One tab: 44px high, label centred, an icon (any `svg` child) from `sm` up
 * only, so that the labels keep the room on a phone.
 */
function NavTabsLink({
  className,
  active = false,
  asChild = false,
  ...props
}: NavTabsLinkProps) {
  const Comp = asChild ? Slot.Root : 'a'
  return (
    <Comp
      data-slot="nav-tabs-link"
      data-active={active || undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        [
          // Layout
          'relative flex min-h-11 min-w-0 items-center justify-center gap-2 px-1 sm:px-5',
          '[&_svg]:hidden [&_svg]:size-[1.1em] [&_svg]:shrink-0 sm:[&_svg]:block',

          // Typography: a little smaller on the narrowest phones.
          'text-xs font-medium whitespace-nowrap no-underline max-[359px]:text-[0.6875rem] sm:text-sm',

          // States
          'text-muted-foreground hover:text-foreground border-b-2 border-transparent transition-colors',
          'data-active:border-primary data-active:text-foreground',
          'focus-visible:ring-ring/50 rounded-t-md outline-none focus-visible:ring-3',
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

export { NavTabs, NavTabsLink }
export type { NavTabsProps, NavTabsLinkProps }
