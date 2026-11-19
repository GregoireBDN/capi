import { createFileRoute } from '@tanstack/react-router'
import { ClaudeAccessPage } from '#/components/access/ClaudeAccessPage'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { useAuth } from '#/lib/auth-context'

export const Route = createFileRoute('/_app/_settings/settings/access')({
  head: () => ({ meta: [{ title: 'Claude et accès · Finances' }] }),
  component: AccessRoute,
})

/**
 * Claude et accès (#300, reworked in #329): connect Claude (this Mac, the
 * phone and claude.ai, a script) and every access in one list.
 */
function AccessRoute() {
  const { user: guardUser } = Route.useRouteContext()
  const { user } = useAuth()
  const { email } = user ?? guardUser

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Claude et accès"
        description="Qui peut lire vos finances sans votre mot de passe."
      />
      <ClaudeAccessPage email={email} />
    </div>
  )
}
