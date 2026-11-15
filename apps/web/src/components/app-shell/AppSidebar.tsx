import { useEffect, useRef } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronsLeftIcon } from 'lucide-react'
import {
  Button,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@finances/ui'
import type { UserDto } from '#/api/types.gen'
import { useReviewCount } from '#/lib/review-count'
import { ROUTES } from '#/lib/routes'
import { NAV_ITEMS, isNavItemActive } from './nav-items'
import { UserMenu } from './UserMenu'

/**
 * Sidebar of the authenticated layout. From `md` up it is a fixed column the
 * owner can hide ("Masquer le menu", or Cmd/Ctrl+B) and bring back from the
 * top bar; below `md` the `@finances/ui` Sidebar renders it inside a sheet,
 * opened from the top bar.
 */
export function AppSidebar({ user }: { user: UserDto }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { isMobile, open, setOpen, setOpenMobile } = useSidebar()
  const reviewCount = useReviewCount()
  const hideButton = useRef<HTMLButtonElement>(null)

  // Shown again from the top bar, whose button then disappears: keep the
  // focus on the matching control instead of losing it to the page.
  const wasOpen = useRef(open)
  useEffect(() => {
    const changed = open && !wasOpen.current && !isMobile
    wasOpen.current = open
    if (!changed) return
    // Next frame: the new styles (top bar shown or hidden, column visible
    // again) must be applied before the target can take the focus.
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      if (
        !active ||
        active === document.body ||
        active.closest('[data-app-top-bar]')
      )
        hideButton.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open, isMobile])

  // The mobile sheet stays open across navigations unless we close it.
  const closeMobileSheet = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="flex-row items-center justify-between">
        <Link
          to={ROUTES.dashboard}
          onClick={closeMobileSheet}
          className="flex min-w-0 items-center gap-2 rounded-md p-2 no-underline"
        >
          <img src="/logo.svg" alt="" className="size-7" />
          <span className="truncate text-base font-semibold tracking-tight">
            Finances
          </span>
        </Link>
        {!isMobile && (
          <Button
            ref={hideButton}
            type="button"
            variant="secondary"
            ghost
            iconOnly
            aria-label="Masquer le menu"
            title="Masquer le menu"
            onClick={() => setOpen(false)}
          >
            <ChevronsLeftIcon />
          </Button>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Navigation principale">
              <SidebarMenu>
                {NAV_ITEMS.map(({ label, to, icon: Icon, badge }) => {
                  const active = isNavItemActive(pathname, to)
                  const count = badge === 'reviewCount' ? reviewCount : null
                  return (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton asChild isActive={active}>
                        <Link
                          to={to}
                          onClick={closeMobileSheet}
                          aria-current={active ? 'page' : undefined}
                        >
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {count !== null && count > 0 && (
                        <SidebarMenuBadge
                          data-testid={`nav-badge-${to}`}
                          className="bg-primary text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-active/menu-button:text-primary-foreground rounded-full"
                        >
                          {count > 99 ? '99+' : count}
                          <span className="sr-only">
                            {count > 1
                              ? ' opérations à revoir'
                              : ' opération à revoir'}
                          </span>
                        </SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu user={user} onNavigate={closeMobileSheet} />
      </SidebarFooter>
    </Sidebar>
  )
}
