import { Outlet, createFileRoute } from '@tanstack/react-router'
import { SettingsTabs } from '#/components/app-shell/SettingsTabs'

/**
 * Settings pages (pathless): Profil, Catégories and Règles keep their URLs
 * and share the tabs that switch between them, under the sidebar's one
 * « Réglages » entry (#261). The tabs stay on screen while the page
 * scrolls, just under the top bar on phones.
 */
export const Route = createFileRoute('/_app/_settings')({
  component: SettingsLayout,
})

function SettingsLayout() {
  return (
    <div className="space-y-6">
      {/* Into the page's top padding (`py-6 md:py-10` in `_app.tsx`): the
          tabs start near the top, then stick there over the content. */}
      <div className="bg-background sticky top-(--app-top-bar,3rem) z-10 -mt-6 pt-2 md:-mt-10 md:pt-3">
        <SettingsTabs />
      </div>
      <Outlet />
    </div>
  )
}
