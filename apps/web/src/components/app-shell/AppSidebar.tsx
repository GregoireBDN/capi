import { Link, useRouterState } from '@tanstack/react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@finances/ui'
import type { UserDto } from '#/api/types.gen'
import { ROUTES } from '#/lib/routes'
import { NAV_ITEMS, isNavItemActive } from './nav-items'
import { UserMenu } from './UserMenu'

/**
 * Sidebar of the authenticated layout. On desktop it is a fixed column; below
 * the `md` breakpoint the `@finances/ui` Sidebar renders it inside a sheet,
 * opened from the layout's top bar.
 */
export function AppSidebar({ user }: { user: UserDto }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { isMobile, setOpenMobile } = useSidebar()

  // The mobile sheet stays open across navigations unless we close it.
  const closeMobileSheet = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          to={ROUTES.dashboard}
          onClick={closeMobileSheet}
          className="flex items-center gap-2 rounded-md p-2 no-underline"
        >
          <img src="/logo.svg" alt="" className="size-7" />
          <span className="text-base font-semibold tracking-tight">
            Finances
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Navigation principale">
              <SidebarMenu>
                {NAV_ITEMS.map(({ label, to, icon: Icon }) => {
                  const active = isNavItemActive(pathname, to)
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
