import { Outlet, createFileRoute } from '@tanstack/react-router'
import { SettingsTabs } from '#/components/app-shell/SettingsTabs'

/**
 * Settings pages (pathless): Catégories, Règles and Profil keep their URLs
 * and share the tabs that switch between them, under the sidebar's one
 * « Réglages » entry (#261).
 */
export const Route = createFileRoute('/_app/_settings')({
  component: SettingsLayout,
})

function SettingsLayout() {
  return (
    <div className="space-y-6">
      <SettingsTabs />
      <Outlet />
    </div>
  )
}
