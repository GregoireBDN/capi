import { createFileRoute } from '@tanstack/react-router'
import { LayoutDashboardIcon } from 'lucide-react'
import { PlaceholderPage } from '#/components/app-shell/PlaceholderPage'
import { VerifyEmailCard } from '#/components/VerifyEmailCard'
import { useAuth } from '#/lib/auth-context'

export const Route = createFileRoute('/_app/dashboard')({
  head: () => ({ meta: [{ title: 'Tableau de bord · Finances' }] }),
  component: DashboardPage,
})

function DashboardPage() {
  const { user: guardUser } = Route.useRouteContext()
  const user = useAuth().user ?? guardUser

  return (
    <PlaceholderPage
      title="Tableau de bord"
      icon={LayoutDashboardIcon}
      description="Vos comptes, votre patrimoine net et le bilan du mois (revenus, dépenses, épargne) s'afficheront ici."
    >
      {!user.emailVerifiedAt && <VerifyEmailCard email={user.email} />}
    </PlaceholderPage>
  )
}
