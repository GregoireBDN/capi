import { Link, useRouterState } from '@tanstack/react-router'
import { NavTabs, NavTabsLink } from '@finances/ui'
import { SETTINGS_TABS, isNavItemActive } from './nav-items'

/**
 * Tabs above every settings page (Profil, Catégories, Règles), reached from
 * the sidebar's one « Réglages » entry (#261): `NavTabs`, links with their
 * own URLs, all the same width.
 */
export function SettingsTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <NavTabs aria-label="Réglages">
      {SETTINGS_TABS.map(({ label, to, icon: Icon }) => (
        <NavTabsLink key={to} asChild active={isNavItemActive(pathname, to)}>
          <Link to={to}>
            <Icon aria-hidden />
            <span>{label}</span>
          </Link>
        </NavTabsLink>
      ))}
    </NavTabs>
  )
}
