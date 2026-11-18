import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '@finances/ui'
import { SETTINGS_TABS, isNavItemActive } from './nav-items'

/**
 * Tabs above every settings page (Catégories, Règles, Profil), reached from
 * the sidebar's one « Réglages » entry (#261). Links, not ARIA tabs: each
 * one is a page with its own URL. Full width on phones,
 * labels only, each as wide as its label; 44px high.
 */
export function SettingsTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <nav
      aria-label="Réglages"
      className="bg-muted flex gap-1 rounded-lg p-1 sm:inline-flex"
    >
      {SETTINGS_TABS.map(({ label, to, icon: Icon }) => {
        const active = isNavItemActive(pathname, to)
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            data-active={active || undefined}
            className={cn(
              'flex min-h-11 min-w-0 flex-auto items-center justify-center gap-2 rounded-md px-1.5 text-xs font-medium no-underline transition-colors sm:px-4 sm:text-sm',
              'focus-visible:ring-ring/50 outline-none focus-visible:ring-3',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {/* Icons from `sm` up: on a phone the three labels need the room. */}
            <Icon
              aria-hidden
              className="hidden size-[1.1em] shrink-0 sm:block"
            />
            <span className="truncate">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
