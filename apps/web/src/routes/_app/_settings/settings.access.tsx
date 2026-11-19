import { createFileRoute } from '@tanstack/react-router'
import { AccessTokensCard } from '#/components/access-tokens/AccessTokensCard'
import { PageHeader } from '#/components/app-shell/PageHeader'
import { ConnectedAppsCard } from '#/components/oauth/ConnectedAppsCard'
import { useAuth } from '#/lib/auth-context'

export const Route = createFileRoute('/_app/_settings/settings/access')({
  head: () => ({ meta: [{ title: 'Claude et accès · Finances' }] }),
  component: AccessRoute,
})

/**
 * Claude et accès (#300): the personal access tokens (the local MCP server,
 * scripts) and the apps connected through remote access (hidden while the
 * server has it off).
 */
function AccessRoute() {
  const { user: guardUser } = Route.useRouteContext()
  const { user } = useAuth()
  const { email } = user ?? guardUser

  return (
    <div className="@container space-y-6">
      <PageHeader
        title="Claude et accès"
        description="Ce qui peut lire vos finances sans votre mot de passe : Claude et vos scripts."
      />
      <AccessTokensCard email={email} />
      <ConnectedAppsCard />
    </div>
  )
}
