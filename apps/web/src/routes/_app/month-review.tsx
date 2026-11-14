import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { MonthClosePage } from '#/components/month-close/MonthClosePage'
import { currentMonth, isMonth, shiftMonth } from '#/lib/calendar'

/** `?month=YYYY-MM` (absent = the previous month); invalid values are dropped. */
const searchSchema = z.object({
  month: z.string().refine(isMonth).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/month-review')({
  validateSearch: (search: Record<string, unknown>) => {
    const { month } = searchSchema.parse(search)
    return month ? { month } : {}
  },
  head: () => ({ meta: [{ title: 'Revue du mois · Finances' }] }),
  component: MonthReviewRoute,
})

function MonthReviewRoute() {
  const { month } = Route.useSearch()
  const navigate = Route.useNavigate()
  const previous = shiftMonth(currentMonth(), -1)
  return (
    <MonthClosePage
      month={month ?? previous}
      onMonthChange={(next) =>
        void navigate({
          search: next === previous ? {} : { month: next },
          resetScroll: false,
        })
      }
    />
  )
}
