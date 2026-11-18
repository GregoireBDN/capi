import { cn } from '@finances/ui'
import type { ReactNode } from 'react'
import type { MonthPeriodDto } from '#/api/types.gen'
import { PeriodNote } from '#/components/PeriodNote'

export interface MonthToolbarProps {
  /** The page's `MonthNavigator`. */
  navigator: ReactNode
  /** How far the month's figures go, stated right under the navigator. */
  period?: MonthPeriodDto
  /** The page's own filters or actions, beside the navigator from 672px. */
  children?: ReactNode
  className?: string
}

/**
 * The first row under `PageHeader` on every month page: the month navigator
 * with its `PeriodNote` below it, then the page's filters or actions. They
 * share the row from 672px of container width (`@2xl` in 16px rem; px
 * because of the 22px root) and stack below it. The
 * toolbar is the navigator's container, so the navigator is laid out by the
 * room the toolbar has, wherever it sits.
 */
export function MonthToolbar({
  navigator,
  period,
  children,
  className,
}: MonthToolbarProps) {
  return (
    <div
      data-slot="month-toolbar"
      className={cn(
        '@container flex flex-col gap-3 @[672px]:flex-row @[672px]:flex-wrap @[672px]:items-start @[672px]:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {navigator}
        {period && <PeriodNote period={period} />}
      </div>
      {children !== undefined && children !== null && children !== false && (
        <div className="min-w-0">{children}</div>
      )}
    </div>
  )
}
