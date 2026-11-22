import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { DeleteAccountCard } from '#/components/profile/DeleteAccountCard'
import { useAuth } from '#/lib/auth-context'
import { ROUTES } from '#/lib/routes'

export const Route = createFileRoute('/_app/_settings/settings/danger')({
  head: () => ({ meta: [{ title: 'Zone dangereuse · Capi' }] }),
  component: DangerRoute,
})

/** Zone dangereuse (#300): deleting the account, alone on its screen. */
function DangerRoute() {
  const { user: guardUser } = Route.useRouteContext()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="@container space-y-6">
      <PageHeader title="Zone dangereuse" />
      <DeleteAccountCard
        email={(user ?? guardUser).email}
        onDeleted={async () => {
          await logout()
          await navigate({ to: ROUTES.auth })
        }}
      />
    </div>
  )
}
