import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { BudgetPage } from '#/components/budget/BudgetPage'
import { isMonth } from '#/lib/calendar'

/** `?month=YYYY-MM` (absent = current month); invalid values are dropped. */
const searchSchema = z.object({
  month: z.string().refine(isMonth).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/budget')({
  // Its month is in the app header (#401).
  staticData: { monthBar: true },
  validateSearch: (search: Record<string, unknown>) => {
    const { month } = searchSchema.parse(search)
    return month ? { month } : {}
  },
  head: () => ({ meta: [{ title: 'Budget · Capi' }] }),
  component: BudgetRoute,
})

function BudgetRoute() {
  const { month } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <BudgetPage
      month={month}
      onMonthChange={(next) =>
        void navigate({
          search: next ? { month: next } : {},
          resetScroll: false,
        })
      }
    />
  )
}
