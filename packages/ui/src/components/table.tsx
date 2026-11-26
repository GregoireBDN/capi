'use client'

import * as React from 'react'

import { cn } from '../lib/utils'

/* ============================================================================
 * TYPES
 * ========================================================================= */

type TableProps = React.ComponentProps<'table'>
type TableHeaderProps = React.ComponentProps<'thead'>
type TableBodyProps = React.ComponentProps<'tbody'>
type TableFooterProps = React.ComponentProps<'tfoot'>
type TableRowProps = React.ComponentProps<'tr'>
type TableHeadProps = React.ComponentProps<'th'>
type TableCellProps = React.ComponentProps<'td'>
type TableCaptionProps = React.ComponentProps<'caption'>

/* ============================================================================
 * COMPONENTS
 * ========================================================================= */

/**
 * Table
 * Responsive table container with horizontal scroll on overflow
 * Wraps the native table element in a scrollable container. When the table is
 * wider than its container, a fade on the clipped edge(s) shows that it
 * scrolls sideways, and the container becomes keyboard-focusable.
 */
function Table({ className, ...props }: TableProps) {
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = React.useState({ start: false, end: false })

  React.useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const update = () => {
      const max = scroller.scrollWidth - scroller.clientWidth
      const next = {
        start: scroller.scrollLeft > 1,
        end: scroller.scrollLeft < max - 1,
      }
      setOverflow((prev) =>
        prev.start === next.start && prev.end === next.end ? prev : next,
      )
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(scroller)
    if (scroller.firstElementChild)
      observer?.observe(scroller.firstElementChild)
    return () => {
      scroller.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [])

  const scrollable = overflow.start || overflow.end
  const fade =
    'pointer-events-none absolute inset-y-0 z-20 w-8 from-card to-transparent transition-opacity motion-reduce:transition-none'

  return (
    <div data-slot="table-frame" className="relative w-full">
      <div
        ref={scrollerRef}
        data-slot="table-container"
        data-scrollable={scrollable || undefined}
        tabIndex={scrollable ? 0 : undefined}
        className="relative w-full overflow-x-auto rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <table
          data-slot="table"
          className={cn(
            [
              // Layout
              'w-full',

              // Typography
              'caption-bottom text-sm',
            ].join(' '),
            className,
          )}
          {...props}
        />
      </div>
      <div
        aria-hidden
        className={cn(
          fade,
          'right-0 bg-gradient-to-l',
          overflow.end ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}

/**
 * Table Header
 * Semantic table header (thead), muted; no lines between rows (#508)
 */
function TableHeader({ className, ...props }: TableHeaderProps) {
  return (
    <thead
      data-slot="table-header"
      className={cn('text-muted-foreground', className)}
      {...props}
    />
  )
}

/**
 * Table Body
 * Main content area of the table
 */
function TableBody({ className, ...props }: TableBodyProps) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

/**
 * Table Footer
 * Footer section with a subtle background
 */
function TableFooter({ className, ...props }: TableFooterProps) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        [
          // Styling
          'bg-muted/50',

          // Typography
          'font-medium',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Table Row
 * Individual table row with hover and selection states
 */
function TableRow({ className, ...props }: TableRowProps) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        [
          // Transitions
          'transition-colors',

          // Hover State
          'hover:bg-muted/50',

          // Expanded State (for expandable rows)
          'has-aria-expanded:bg-muted/50',

          // Selected State
          'data-[state=selected]:bg-muted',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Table Head
 * Header cell with left alignment and medium weight
 * Adjusts padding for checkbox cells
 */
function TableHead({ className, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        [
          // Layout
          'h-10 px-2',

          // Typography
          'text-left align-middle font-medium whitespace-nowrap text-foreground',

          // Checkbox cell adjustment
          '[&:has([role=checkbox])]:pr-0',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Table Cell
 * Standard table data cell
 * Adjusts padding for checkbox cells
 */
function TableCell({ className, ...props }: TableCellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        [
          // Spacing
          'p-2',

          // Typography
          'align-middle whitespace-nowrap',

          // Checkbox cell adjustment
          '[&:has([role=checkbox])]:pr-0',
        ].join(' '),
        className,
      )}
      {...props}
    />
  )
}

/**
 * Table Caption
 * Accessible caption for the table (appears below by default)
 */
function TableCaption({ className, ...props }: TableCaptionProps) {
  return (
    <caption
      data-slot="table-caption"
      className={cn(
        [
          // Spacing
          'mt-4',

          // Typography
          'text-sm text-muted-foreground',
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

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  type TableBodyProps,
  type TableCaptionProps,
  type TableCellProps,
  type TableFooterProps,
  type TableHeaderProps,
  type TableHeadProps,
  type TableProps,
  type TableRowProps,
}
