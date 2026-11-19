import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { PageBack } from '#/components/app-shell/PageBack'
import { ROUTES } from '#/lib/routes'

/**
 * Settings pages (pathless, #261 then #300): the Réglages list
 * (`/settings`), its sections' screens (`/settings/…`), Catégories and
 * Règles. Every page but the list opens with « ‹ Réglages », back to it: a
 * stack of screens, on phones as on wide pages, with the app's one back
 * link (`PageBack`, #324).
 */
export const Route = createFileRoute('/_app/_settings')({
  component: SettingsLayout,
})

function SettingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isList =
    pathname === ROUTES.settings || pathname === `${ROUTES.settings}/`

  return (
    <div>
      {!isList && <PageBack label="Réglages" to={ROUTES.settings} />}
      <Outlet />
    </div>
  )
}
