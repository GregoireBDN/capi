import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type BreadcrumbProps = React.ComponentProps<'nav'> & {
  /**
   * Below `md` (a phone), only the parent shows, as « ‹ Comptes »: the
   * current page and the separators are left to wider screens (#404, the
   * owner's « A »), the page's title saying where you are.
   */
  backOnPhones?: boolean
}

type BreadcrumbLinkProps = React.ComponentProps<'a'> & {
  /** Render the router's link instead (`<Link>` as the only child). */
  asChild?: boolean
}

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * Where a page sits (#404): « Comptes › Compte courant », the parent a link,
 * the current page as text. An ordered list in a `<nav>` named « Fil
 * d’Ariane », the separators hidden from screen readers. The current page
 * is cut with … when it doesn't fit; the links never shrink.
 */
function Breadcrumb({
  backOnPhones = false,
  className,
  'aria-label': label = 'Fil d’Ariane',
  ...props
}: BreadcrumbProps) {
  return (
    <nav
      data-slot="breadcrumb"
      data-back-on-phones={backOnPhones || undefined}
      aria-label={label}
      className={cn('group/breadcrumb flex min-w-0', className)}
      {...props}
    />
  )
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<'ol'>) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn('flex min-w-0 items-center text-base', className)}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn(
        'flex shrink-0 items-center has-[[data-slot=breadcrumb-page]]:min-w-0 has-[[data-slot=breadcrumb-page]]:shrink',
        'group-data-[back-on-phones]/breadcrumb:max-md:has-[[data-slot=breadcrumb-page]]:hidden',
        className,
      )}
      {...props}
    />
  )
}

/** A step back: 44px high, in the primary colour. */
function BreadcrumbLink({
  asChild = false,
  className,
  children,
  ...props
}: BreadcrumbLinkProps) {
  const Comp = asChild ? Slot.Root : 'a'
  const chevron = (
    <ChevronLeftIcon
      aria-hidden
      className="hidden size-6 shrink-0 group-data-[back-on-phones]/breadcrumb:max-md:block"
    />
  )
  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn(
        'text-primary hover:bg-glass-fill focus-visible:ring-ring/50 flex h-8 items-center gap-0.5 rounded-lg px-1.5 font-medium whitespace-nowrap outline-none focus-visible:ring-[3px]',
        'group-data-[back-on-phones]/breadcrumb:max-md:pr-2 group-data-[back-on-phones]/breadcrumb:max-md:pl-1',
        className,
      )}
      {...props}
    >
      {asChild &&
      React.isValidElement<{ children?: React.ReactNode }>(children) ? (
        React.cloneElement(
          children,
          undefined,
          chevron,
          children.props.children,
        )
      ) : (
        <>
          {chevron}
          {children}
        </>
      )}
    </Comp>
  )
}

/** The page shown: text, not a link, at most 18rem, cut with … (#404). */
function BreadcrumbPage({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn(
        'text-foreground max-w-[18rem] truncate px-1.5 font-medium',
        className,
      )}
      {...props}
    />
  )
}

/** `›` between two steps, hidden from screen readers. */
function BreadcrumbSeparator({
  className,
  children,
  ...props
}: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden
      className={cn(
        'text-glass-muted-foreground flex shrink-0 [&_svg]:size-4',
        'group-data-[back-on-phones]/breadcrumb:max-md:hidden',
        className,
      )}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  )
}

/* ============================================================================
 * EXPORTS
 * ========================================================================= */

export {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  type BreadcrumbLinkProps,
  type BreadcrumbProps,
}
