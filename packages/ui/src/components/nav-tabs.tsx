import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type NavTabsProps = React.ComponentProps<'nav'>
type NavTabsLinkProps = React.ComponentProps<'a'> & {
  /** The page shown: a light blue tab, announced as the current page. */
  active?: boolean
  /** Render the child (e.g. a router `Link`) instead of an `<a>`. */
  asChild?: boolean
}

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * Nav Tabs
 * Folder tabs that switch between sibling pages, each with its own URL
 * (#505, the look of the month bar's tabs, #502): the current one a rounded
 * tab in the light blue of `--month-band`, opening onto what sits under it
 * in the same tint; no line under the row. Links, not ARIA tabs
 * (`role="tablist"` is for panels on one page): give the `nav` an
 * `aria-label`. The row fills the width and every tab takes the same share
 * of it.
 */
function NavTabs({ className, children, ...props }: NavTabsProps) {
  return (
    <nav data-slot="nav-tabs" className={cn('w-full', className)} {...props}>
      <div className="grid w-full auto-cols-fr grid-flow-col gap-1.5">
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

          // States: the current tab in the band's light blue, no underline.
          'text-glass-muted-foreground hover:text-foreground rounded-t-2xl transition-colors',
          'data-active:bg-month-band data-active:text-foreground data-active:font-semibold',
          'focus-visible:ring-ring/50 outline-none focus-visible:ring-3 focus-visible:ring-inset',
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
