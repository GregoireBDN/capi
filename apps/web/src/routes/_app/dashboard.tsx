import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { DashboardPage } from '#/components/dashboard/DashboardPage'
import { VerifyEmailCard } from '#/components/VerifyEmailCard'
import { useAuth } from '#/lib/auth-context'
import { isMonth } from '#/lib/calendar'

/** `?month=YYYY-MM` (absent = the month the API picks); invalid values are dropped. */
const searchSchema = z.object({
  month: z.string().refine(isMonth).optional().catch(undefined),
})

export const Route = createFileRoute('/_app/dashboard')({
  validateSearch: (search: Record<string, unknown>) => {
    const { month } = searchSchema.parse(search)
    return month ? { month } : {}
  },
  head: () => ({ meta: [{ title: 'Tableau de bord · Finances' }] }),
  component: DashboardRoute,
})

function DashboardRoute() {
  const { user: guardUser } = Route.useRouteContext()
  const user = useAuth().user ?? guardUser
  const { month } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <DashboardPage
      month={month}
      onMonthChange={(next) =>
        void navigate({
          search: next ? { month: next } : {},
          resetScroll: false,
        })
      }
      banner={!user.emailVerifiedAt && <VerifyEmailCard email={user.email} />}
    />
  )
}
