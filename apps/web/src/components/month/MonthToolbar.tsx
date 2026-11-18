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
  /** Filters set (not at their default), counted on the « Filtres » button. */
  activeFilters?: number
  /** The page's actions: at the end of the row, on a row of their own below 672px. */
  actions?: ReactNode
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
        // A 44px square beside a short month name (phones), with its label
        // from 420px of bar width.
        className="min-w-8 gap-1.5 px-2 @[420px]:px-2.5 @[672px]:hidden"
      >
        <SlidersHorizontalIcon aria-hidden />
        <span className="hidden @[420px]:inline">Filtres</span>
        {count > 0 && (
          <Badge
            variant="info"
            className="absolute -top-1.5 -right-1.5 min-w-5 justify-center px-1 @[420px]:static"
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
 * the number of filters set) and the actions get a row of their own. Widths
 * in px: with the 22px root, a container `rem` is ~1.4× the usual one.
 */
export function MonthToolbar({
  navigator,
  period,
  filters,
  activeFilters = 0,
  actions,
  className,
}: MonthToolbarProps) {
  return (
    <div
      data-slot="month-toolbar"
      className={cn(
        '@container bg-card space-y-2 rounded-xl border p-2 shadow-xs',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {navigator}
        {filters && (
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <div
              data-slot="month-toolbar-filters"
              className="hidden flex-wrap items-center justify-end gap-2 @[672px]:flex"
            >
              {filters('inline')}
            </div>
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
      </div>
      {period && <PeriodNote period={period} className="border-t px-1 pt-2" />}
    </div>
  )
}
