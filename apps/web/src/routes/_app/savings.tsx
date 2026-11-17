import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SavingsPage } from '#/components/savings/SavingsPage'
import { isMonth } from '#/lib/calendar'

/** `?month=YYYY-MM` (absent = the month the API picks); invalid values are dropped. */
const searchSchema = z.object({
  month: z.string().refine(isMonth).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/savings')({
  validateSearch: (search: Record<string, unknown>) => {
    const { month } = searchSchema.parse(search)
    return month ? { month } : {}
  },
  head: () => ({ meta: [{ title: 'Épargne · Finances' }] }),
  component: SavingsRoute,
})

function SavingsRoute() {
  const { month } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SavingsPage
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
