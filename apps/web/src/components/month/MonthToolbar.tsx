import {
  Badge,
  Button,
  cn,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@finances/ui'
import { SlidersHorizontalIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { MonthPeriodDto } from '#/api/types.gen'
import { PeriodNote } from '#/components/PeriodNote'

export type MonthToolbarFiltersLayout = 'inline' | 'sheet'

export interface MonthToolbarProps {
  /** The page's `MonthNavigator`. */
  navigator: ReactNode
  /** How far the month's figures go, stated at the bottom of the bar. */
  period?: MonthPeriodDto
  /**
   * The page's filters, rendered by a function so each place gets its own
   * instance: `inline` beside the navigator from 672px of bar width, `sheet`
   * in the bottom sheet the « Filtres » button opens below it.
   */
  filters?: (layout: MonthToolbarFiltersLayout) => ReactNode
  /**
   * Whether `filters('inline')` goes in the navigator's row from 672px.
   * Off when the page lays its wide filters out in `children` (Opérations'
   * chips): `filters` then only feeds the phone sheet. Default: on.
   */
  filtersInline?: boolean
  /** Filters set (not at their default), counted on the « Filtres » button. */
  activeFilters?: number
  /** The page's actions: at the end of the row, on a row of their own below 672px. */
  actions?: ReactNode
  /**
   * A search field filling the rest of the navigator's row from 672px, on a
   * row of its own below it on phones (Opérations).
   */
  search?: ReactNode
  /** Rows of their own under the navigator's row (filter chips). */
  children?: ReactNode
  className?: string
}

/** Opens the filters in a bottom sheet in narrow bars (phones). */
function FiltersButton({
  count,
  filters,
}: {
  count: number
  filters: NonNullable<MonthToolbarProps['filters']>
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="secondary"
        outline
        aria-label={
          count > 0
            ? `Filtres, ${count} actif${count > 1 ? 's' : ''}`
            : 'Filtres'
        }
        onClick={() => setOpen(true)}
        // A 44px square, so it fits beside the month name in any bar
        // narrower than 672px (its label is its accessible name).
        className="min-w-8 px-2 @[672px]:hidden"
      >
        <SlidersHorizontalIcon aria-hidden />
        {count > 0 && (
          <Badge
            variant="info"
            className="absolute -top-1.5 -right-1.5 min-w-5 justify-center px-1"
          >
            {count}
          </Badge>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl"
        >
          <SheetHeader className="pb-0">
            <SheetTitle>Filtres</SheetTitle>
            <SheetDescription className="sr-only">
              Filtres des chiffres du mois
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">{filters('sheet')}</div>
        </SheetContent>
      </Sheet>
    </>
  )
}

/**
 * The first row under `PageHeader` on every month page (#263): one bar
 * across the page holding the month navigator, then the page's filters and
 * actions at the end of the row, and the `PeriodNote` at the bottom. The bar
 * is the navigator's container: below 672px of width (phones, narrow
 * cards) the filters fold behind a « Filtres » button (bottom sheet, with
 * the number of filters set) and the actions get a row of their own. On a
 * page with neither, the period note sits in the row, at its end. Widths
 * in px: with the 22px root, a container `rem` is ~1.4× the usual one.
 */
export function MonthToolbar({
  navigator,
  period,
  filters,
  filtersInline = true,
  activeFilters = 0,
  actions,
  search,
  children,
  className,
}: MonthToolbarProps) {
  // Nothing to set on the page: the period note fills the row instead, so
  // the bar never holds a lone navigator and an empty stretch.
  const bare = !filters && !actions && !search && !children
  // Only the navigator: no empty bar around it (same tree, so the
  // navigator isn't remounted when the period arrives).
  const plain = bare && !period
  return (
    <div
      data-slot="month-toolbar"
      className={cn(
        '@container',
        !plain && 'bg-card space-y-2 rounded-xl border p-2 shadow-xs',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {navigator}
        {search && (
          <div
            data-slot="month-toolbar-search"
            className={cn(
              'order-last w-full min-w-0 @[672px]:order-none @[672px]:w-auto @[672px]:flex-1',
              // Too narrow for the month and « Filtres » on one row (320px
              // phones): the button joins the search's row instead.
              '@max-[290px]:w-auto @max-[290px]:flex-1 @max-[290px]:basis-[140px]',
            )}
          >
            {search}
          </div>
        )}
        {filters && (
          <div
            className={cn(
              'ml-auto flex min-w-0 items-center gap-2',
              search && '@max-[290px]:order-last',
            )}
          >
            {filtersInline && (
              <div
                data-slot="month-toolbar-filters"
                className="hidden flex-wrap items-center justify-end gap-2 @[672px]:flex"
              >
                {filters('inline')}
              </div>
            )}
            <FiltersButton count={activeFilters} filters={filters} />
          </div>
        )}
        {actions && (
          <div
            data-slot="month-toolbar-actions"
            className={cn(
              'w-full @[672px]:w-auto',
              // Alone at the end of the row when there are no filters.
              !filters && '@[672px]:ml-auto',
            )}
          >
            {actions}
          </div>
        )}
        {bare && period && (
          <PeriodNote
            period={period}
            className="w-full px-1 @[672px]:w-auto @[672px]:min-w-0 @[672px]:flex-1 @[672px]:justify-end @[672px]:text-right"
          />
        )}
      </div>
      {children}
      {!bare && period && (
        <PeriodNote period={period} className="border-t px-1 pt-2" />
      )}
    </div>
  )
}
