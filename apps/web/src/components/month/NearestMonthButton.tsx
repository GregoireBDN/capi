import { Button } from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import type { ComponentProps } from 'react'
import { formatMonth } from '#/lib/calendar'
import { coverageQuery, nearestMonthWithData } from './coverage'

interface NearestMonthButtonProps extends Omit<
  ComponentProps<typeof Button>,
  'onClick' | 'children'
> {
  /** The empty month shown. */
  month: string
  onMonthChange: (month: string) => void
}

/**
 * "Voir septembre 2026": from an empty month to the nearest one with
 * transactions (see `nearestMonthWithData`). Nothing when no month has any.
 */
export function NearestMonthButton({
  month,
  onMonthChange,
  ...props
}: NearestMonthButtonProps) {
  const coverage = useQuery(coverageQuery)
  const nearest = coverage.data
    ? nearestMonthWithData(coverage.data.months, month)
    : null
  if (nearest === null) return null
  return (
    <Button {...props} onClick={() => onMonthChange(nearest)}>
      Voir {formatMonth(nearest).toLowerCase()}
    </Button>
  )
}
