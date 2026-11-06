import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '#/components/dashboard/DashboardPage'
import { VerifyEmailCard } from '#/components/VerifyEmailCard'
import { useAuth } from '#/lib/auth-context'

export const Route = createFileRoute('/_app/dashboard')({
  head: () => ({ meta: [{ title: 'Tableau de bord · Finances' }] }),
  component: DashboardRoute,
})

function DashboardRoute() {
  const { user: guardUser } = Route.useRouteContext()
  const user = useAuth().user ?? guardUser

  return (
    <DashboardPage
      banner={!user.emailVerifiedAt && <VerifyEmailCard email={user.email} />}
    />
  )
}
