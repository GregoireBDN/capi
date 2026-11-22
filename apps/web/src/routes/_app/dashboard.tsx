import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '#/components/dashboard/DashboardPage'
import { VerifyEmailCard } from '#/components/VerifyEmailCard'
import { useAuth } from '#/lib/auth-context'

/**
 * The dashboard follows today (#405): no month bar and no `?month=` (an old
 * link's month is dropped); past months are read in « Bilan du mois ».
 */
export const Route = createFileRoute('/_app/dashboard')({
  validateSearch: () => ({}),
  head: () => ({ meta: [{ title: 'Tableau de bord · Capi' }] }),
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
