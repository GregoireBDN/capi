import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { DefaultPageBack } from '#/components/app-shell/PageBack'
import { ROUTES } from '#/lib/routes'

/**
 * Settings pages (pathless, #261 then #300): the Réglages list
 * (`/settings`), its sections' screens (`/settings/…`), Catégories and
 * Règles. Every page but the list goes back to it: « Réglages › Sécurité »
 * in the header, « ‹ Réglages » on phones (the app's one back link,
 * `PageBack`, #324, #404), given to each screen's `PageHeader`.
 */
export const Route = createFileRoute('/_app/_settings')({
  component: SettingsLayout,
})

function SettingsLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isList =
    pathname === ROUTES.settings || pathname === `${ROUTES.settings}/`

  return (
    <DefaultPageBack
      back={isList ? undefined : { label: 'Réglages', to: ROUTES.settings }}
    >
      <Outlet />
    </DefaultPageBack>
  )
}
