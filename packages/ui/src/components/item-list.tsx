import { ChevronRightIcon } from 'lucide-react'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * ITEM LIST
 *
 * An "inset" list: rows separated by space, not rules, each one target (a
 * link) with a rounded hover / focus background, an optional round icon, a
 * title and a second line on the left, a value and an optional detail on the
 * right, and a chevron always last so every row ends at the same x.
 * ========================================================================= */

type ItemListProps = React.ComponentProps<'div'>

/** Groups of rows, spaced apart. */
function ItemList({ className, ...props }: ItemListProps) {
  return (
    <div
      data-slot="item-list"
      className={cn('space-y-5', className)}
      {...props}
    />
  )
}

type ItemListGroupProps = Omit<React.ComponentProps<'section'>, 'title'> & {
  /** Sentence-case heading; without one the rows stand alone. */
  title?: React.ReactNode
  /** Shown at the end of the heading, aligned with the rows' values. */
  total?: React.ReactNode
}

/** A heading with its total on the same line (no rule), then its rows. */
function ItemListGroup({
  title,
  total,
  className,
  children,
  ...props
}: ItemListGroupProps) {
  const id = React.useId()
  return (
    <section
      data-slot="item-list-group"
      aria-labelledby={title ? id : undefined}
      className={cn('space-y-1', className)}
      {...props}
    >
      {title && (
        <div className="flex flex-wrap items-baseline gap-x-3 px-2">
          <h3
            id={id}
            // No min-w-0 and words kept whole (the body breaks anywhere): a
            // long word (« Investissements ») wraps the total to the next
            // line instead of breaking (#344).
            className="text-muted-foreground flex-1 text-sm font-medium break-normal"
          >
            {title}
          </h3>
          {total != null && (
            <p className="ml-auto text-sm font-semibold whitespace-nowrap tabular-nums">
              {total}
            </p>
          )}
          {/* Keeps the total above the rows' values, left of their chevron. */}
          <span aria-hidden className="w-4 shrink-0" />
        </div>
      )}
      <ul className="space-y-0.5">{children}</ul>
    </section>
  )
}

type ItemListRowProps = Omit<React.ComponentProps<'a'>, 'title'> & {
  /**
   * Render the row as its single child (a router link), which receives the
   * row's classes and content.
   */
  asChild?: boolean
  /** A small icon, drawn in a 32px round badge. */
  icon?: React.ReactNode
  /** Colours of the icon badge (background and foreground). */
  iconClassName?: string
  title: React.ReactNode
  /** Second line on the left. */
  subtitle?: React.ReactNode
  /** Main figure on the right. */
  value?: React.ReactNode
  /** Second line on the right. */
  detail?: React.ReactNode
  /**
   * On a narrow row (under 464px, a phone), show two lines only: the title,
   * then the value followed by `compactDetail` (#344, owner's « D. Nom puis
   * chiffres »); the subtitle and `detail` are left to wider rows, which keep
   * the two columns. The gaps tighten so a 20-character title fits at 375px.
   */
  compactWhenNarrow?: boolean
  /** With `compactWhenNarrow`: what follows the value on a narrow row. */
  compactDetail?: React.ReactNode
}

/**
 * One row, one target (#262, owner's « Pastille + montant »): the badge, the
 * title and its second line (cut with … when they don't fit), the value and
 * its detail on the right, centred on the two lines, then the chevron.
 */
function ItemListRow({
  asChild = false,
  icon,
  iconClassName,
  title,
  subtitle,
  value,
  detail,
  compactWhenNarrow = false,
  compactDetail,
  className,
  children,
  ...props
}: ItemListRowProps) {
  const Comp = asChild ? Slot.Root : 'a'
  const compact = compactWhenNarrow
  const figures = value != null || Boolean(detail)
  return (
    <li
      data-slot="item-list-row"
      // The row's own width decides whether it is compact (the li is the row).
      className={compact ? '@container/item-row' : undefined}
    >
      <Comp
        className={cn(
          'flex min-h-11 items-center rounded-lg py-2 text-sm',
          compact
            ? 'gap-2 px-1.5 @min-[464px]/item-row:gap-3 @min-[464px]/item-row:px-2'
            : 'gap-3 px-2',
          'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring outline-none focus-visible:ring-2',
          'transition-colors',
          className,
        )}
        {...props}
      >
        {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : null}
        {icon && (
          <span
            aria-hidden
            className={cn(
              // 32px whatever the root size (the app's rem is 22px).
              'bg-muted text-muted-foreground flex size-[32px] shrink-0 items-center justify-center rounded-full [&_svg]:size-[16px]',
              iconClassName,
            )}
          >
            {icon}
          </span>
        )}
        {compact ? (
          /* Narrow: the title, then the value and its compact detail. Wide:
             the title and its subtitle, the value and its detail on the
             right, as below. */
          <>
            <span className="block min-w-0 flex-1">
              <span className="block truncate font-medium">{title}</span>
              {subtitle && (
                <span className="text-muted-foreground hidden truncate text-xs @min-[464px]/item-row:block">
                  {subtitle}
                </span>
              )}
              {value != null && (
                <span className="flex flex-wrap items-baseline gap-x-2 @min-[464px]/item-row:hidden">
                  <span className="whitespace-nowrap tabular-nums">
                    {value}
                  </span>
                  {compactDetail && (
                    <span className="text-xs whitespace-nowrap tabular-nums">
                      {compactDetail}
                    </span>
                  )}
                </span>
              )}
            </span>
            {figures && (
              <span className="hidden shrink-0 text-right @min-[464px]/item-row:block">
                {value != null && (
                  <span className="block font-medium whitespace-nowrap tabular-nums">
                    {value}
                  </span>
                )}
                {detail && (
                  <span className="block text-xs whitespace-nowrap tabular-nums">
                    {detail}
                  </span>
                )}
              </span>
            )}
          </>
        ) : (
          <>
            {/* Name and its second line on the left, cut with … when they
                don't fit; the value and its detail on the right, never
                cut. */}
            <span className="block min-w-0 flex-1">
              <span className="block truncate font-medium">{title}</span>
              {subtitle && (
                <span className="text-muted-foreground block truncate text-xs">
                  {subtitle}
                </span>
              )}
            </span>
            {figures && (
              <span className="block shrink-0 text-right">
                {value != null && (
                  <span className="block font-medium whitespace-nowrap tabular-nums">
                    {value}
                  </span>
                )}
                {detail && (
                  <span className="block text-xs whitespace-nowrap tabular-nums">
                    {detail}
                  </span>
                )}
              </span>
            )}
          </>
        )}
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </Comp>
    </li>
  )
}

export { ItemList, ItemListGroup, ItemListRow }
export type { ItemListGroupProps, ItemListProps, ItemListRowProps }
