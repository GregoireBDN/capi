import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { PasskeysCard } from '#/components/passkeys/PasskeysCard'
import { ChangePasswordCard } from '#/components/profile/ChangePasswordCard'
import { SessionsCard } from '#/components/sessions/SessionsCard'
import { useAuth } from '#/lib/auth-context'

export const Route = createFileRoute('/_app/_settings/settings/security')({
  head: () => ({ meta: [{ title: 'Sécurité · Capi' }] }),
  component: SecurityRoute,
})

/**
 * Sécurité (#300): how the owner signs in (password, passkeys) and where
 * they are signed in (sessions), one topic on one screen.
 */
function SecurityRoute() {
  const { user: guardUser } = Route.useRouteContext()
  const { user } = useAuth()
  const { email } = user ?? guardUser

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Sécurité"
        description="Comment vous vous connectez, et sur quels appareils."
      />
      <ChangePasswordCard email={email} />
      <PasskeysCard email={email} />
      <SessionsCard email={email} />
    </div>
  )
}
