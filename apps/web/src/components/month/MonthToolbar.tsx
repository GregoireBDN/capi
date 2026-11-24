import {
  Badge,
  Button,
  cn,
  Sheet,
  SheetBar,
  SheetContent,
  useIsMobile,
} from '@capi/ui'
import { SlidersHorizontalIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { MonthPeriodDto } from '#/api/types.gen'
import { PeriodNote } from '#/components/PeriodNote'
import { PageTitleEnd } from '#/components/app-shell/PageTitleEnd'
import { FORM_SHEET_SCREEN, SheetScroll } from '#/components/sheets/form-sheet'

export type MonthToolbarFiltersLayout = 'inline' | 'sheet'

export interface MonthToolbarProps {
  /** The page's `MonthNavigator` (in the app header, #401). */
  navigator: ReactNode
  /** How far the month's figures go, stated first under the title. */
  period?: MonthPeriodDto
  /**
   * The page's filters, rendered by a function so each place gets its own
   * instance: `inline` at the end of the period note's row from 672px of
   * width, `sheet` in the bottom sheet of the « Filtres » button, at the end
   * of the page title's row below it.
   */
  filters?: (layout: MonthToolbarFiltersLayout) => ReactNode
  /**
   * Whether `filters('inline')` goes in the note's row from 672px. Off when
   * the page lays its wide filters out in `children` (Opérations' chips):
   * `filters` then only feeds the phone sheet. Default: on.
   */
  filtersInline?: boolean
  /** Filters set (not at their default), counted on the « Filtres » button. */
  activeFilters?: number
  /** The page's actions: at the end of the note's row, on a row of their own below 672px. */
  actions?: ReactNode
  /** A search field on a row of its own (Opérations). */
  search?: ReactNode
  /** Rows of their own under the search (filter chips). */
  children?: ReactNode
  className?: string
}

/** Opens the filters in a bottom sheet in narrow pages (phones). */
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
        // Sized to its label, at the end of the title's row; from 672px of
        // page the filters are in the note's row instead.
        className="relative rounded-full px-3 @[672px]:hidden"
        iconStart={<SlidersHorizontalIcon aria-hidden />}
      >
        Filtres
        {count > 0 && (
          <Badge
            variant="info"
            className="min-w-5 justify-center px-1"
            aria-hidden
          >
            {count}
          </Badge>
        )}
      </Button>
      <FiltersSheet open={open} onOpenChange={setOpen}>
        <div className="px-4">{filters('sheet')}</div>
      </FiltersSheet>
    </>
  )
}

/**
 * The « Filtres » panel of a narrow page: a page of its own on a phone
 * (#385), a bottom sheet in a narrow window elsewhere. `onBack` turns its ✕
 * into ‹ (a list opened from it, #406).
 */
export function FiltersSheet({
  open,
  onOpenChange,
  title = 'Filtres',
  description = 'Filtres des chiffres du mois',
  onBack,
  action,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  onBack?: () => void
  action?: ReactNode
  children: ReactNode
}) {
  const isMobile = useIsMobile()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'screen' : 'bottom'}
        className={
          isMobile
            ? FORM_SHEET_SCREEN
            : 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
        }
      >
        <SheetBar
          title={title}
          description={description}
          onBack={onBack}
          action={action}
        />
        <SheetScroll className="pb-6">{children}</SheetScroll>
      </SheetContent>
    </Sheet>
  )
}

/**
 * What a month page sets and says about its month, under its `PageHeader`
 * (#401, the owner's « B. Barre du mois »): the month itself is in the app
 * header (`navigator`, a `MonthNavigator`), so this is no card any more. In
 * order: the `PeriodNote`, with the filters and actions at the end of its
 * row from 672px of width (the filters behind « Filtres » at the end of the
 * page title's row below it, a bottom sheet with the number set; the
 * actions on a row of their own), the search, then the page's own rows
 * (chips). Widths in px: with the 22px root, a container `rem` is ~1.4×
 * the usual one; the page's `@container` and this one have the same width.
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
  return (
    <div
      data-slot="month-toolbar"
      className={cn('@container space-y-3 empty:hidden', className)}
    >
      {navigator}
      {filters && (
        <PageTitleEnd>
          <FiltersButton count={activeFilters} filters={filters} />
        </PageTitleEnd>
      )}
      {(period || (filters && filtersInline) || actions) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {period && (
            <PeriodNote
              period={period}
              className="min-w-[min(100%,14rem)] flex-1 px-1"
            />
          )}
          {filters && filtersInline && (
            <div
              data-slot="month-toolbar-filters"
              className="ml-auto hidden flex-wrap items-center justify-end gap-2 @[672px]:flex"
            >
              {filters('inline')}
            </div>
          )}
          {actions && (
            <div
              data-slot="month-toolbar-actions"
              className="w-full @[672px]:ml-auto @[672px]:w-auto"
            >
              {actions}
            </div>
          )}
        </div>
      )}
      {search && <div data-slot="month-toolbar-search">{search}</div>}
      {children}
    </div>
  )
}
