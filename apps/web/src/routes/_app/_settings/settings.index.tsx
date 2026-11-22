import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '#/components/settings/SettingsPage'
import { useAuth } from '#/lib/auth-context'

export const Route = createFileRoute('/_app/_settings/settings/')({
  head: () => ({ meta: [{ title: 'Réglages · Capi' }] }),
  component: SettingsRoute,
})

function SettingsRoute() {
  const { user: guardUser } = Route.useRouteContext()
  const { user } = useAuth()
  return <SettingsPage user={user ?? guardUser} />
}
