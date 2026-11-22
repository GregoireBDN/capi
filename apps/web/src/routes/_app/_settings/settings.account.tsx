import { createFileRoute } from '@tanstack/react-router'
import { AccountSettings } from '#/components/settings/AccountSettings'
import { useAuth } from '#/lib/auth-context'

export const Route = createFileRoute('/_app/_settings/settings/account')({
  head: () => ({ meta: [{ title: 'Compte · Capi' }] }),
  component: AccountRoute,
})

function AccountRoute() {
  const { user: guardUser } = Route.useRouteContext()
  const { user } = useAuth()
  return <AccountSettings user={user ?? guardUser} />
}
