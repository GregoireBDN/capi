import { createFileRoute } from '@tanstack/react-router'
import { ConsentCard } from '#/components/oauth/ConsentCard'
import { authorizeParams } from '#/components/oauth/queries'
import { requireUserForConsent } from '#/lib/auth-guard'

/**
 * OAuth consent page of the remote MCP connection (#78, ADR 0003): the
 * authorization endpoint the connector (claude.ai) opens in the owner's
 * browser. It is a web page on the tailnet, never reached by the connector's
 * servers. Anonymous visitors sign in first and come back here.
 */
export const Route = createFileRoute('/oauth/authorize')({
  validateSearch: authorizeParams,
  beforeLoad: async ({ location }) => ({
    user: await requireUserForConsent(location.href),
  }),
  head: () => ({ meta: [{ title: 'Connecter une application · Finances' }] }),
  component: AuthorizePage,
})

function AuthorizePage() {
  const params = Route.useSearch()
  const { user } = Route.useRouteContext()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-8">
      <ConsentCard params={params} email={user.email} />
    </div>
  )
}
