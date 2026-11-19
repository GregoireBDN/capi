import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from '@tanstack/react-router'
import { Button } from '@finances/ui'
import { ChevronLeftIcon } from 'lucide-react'
import { ROUTES } from '#/lib/routes'

/**
 * Settings pages (pathless, #261 then #300): the Réglages list
 * (`/settings`), its sections' screens (`/settings/…`), Catégories and
 * Règles. Every page but the list opens with « ‹ Réglages », back to it: a
 * stack of screens, on phones as on wide pages.
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
      {!isList && (
        // Into the page's top padding (`py-6 md:py-10` in `_app.tsx`), so
        // the title stays where it is on the other pages.
        <Button
          asChild
          variant="secondary"
          ghost
          size="sm"
          className="-mt-4 mb-2 -ml-2 md:-mt-6"
        >
          <Link to={ROUTES.settings}>
            <ChevronLeftIcon />
            Réglages
          </Link>
        </Button>
      )}
      <Outlet />
    </div>
  )
}
