import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronLeftIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  useSidebar,
} from '@finances/ui'
import type { UserDto } from '#/api/types.gen'
import { useReviewCount } from '#/lib/review-count'
import { ROUTES } from '#/lib/routes'
import { carriedMonth, NAV_GROUPS, isNavItemActive } from './nav-items'
import { UserMenu } from './UserMenu'

/**
 * Page icons a little larger than the menu default, and, folded, square
 * buttons that fill the column with icons sized from it (`routes/_app.tsx`
 * sets `--rail-button` and `--rail-icon` from the column width).
 */
export const RAIL_BUTTON = cn(
  '[&_svg]:size-[1.1rem]',
  'group-data-[collapsible=icon]:size-(--rail-button)!',
  'group-data-[collapsible=icon]:p-0!',
  'group-data-[collapsible=icon]:justify-center',
  'group-data-[collapsible=icon]:[&_svg]:size-(--rail-icon)',
  // The name stays for screen readers but takes no room: the icon centres.
  'group-data-[collapsible=icon]:[&>span]:sr-only',
)

/** Search of a nav link: the month carried, else none. */
function monthSearch(month: string | undefined): { month?: string } {
  return month === undefined ? {} : { month }
}

/**
 * Sidebar of the authenticated layout. From `md` up it is a fixed column the
 * owner folds down to its icons and back by tapping its header ("Finances"
 * and a chevron; folded, the logo) or with Cmd/Ctrl+B; the page names show
 * as tooltips while it is folded. Below `md` the `@finances/ui` Sidebar
 * renders it inside a sheet, opened from the top bar, whose header links to
 * the dashboard.
 */
export function AppSidebar({ user }: { user: UserDto }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const search = useRouterState({ select: (s) => s.location.search })
  const { isMobile, open, setOpenMobile, toggleSidebar } = useSidebar()
  const reviewCount = useReviewCount()

  // The mobile sheet stays open across navigations unless we close it.
  const closeMobileSheet = () => {
    if (isMobile) setOpenMobile(false)
  }

  const brand = (
    <>
      <img
        src="/logo.svg"
        alt=""
        className="size-7 shrink-0 group-data-[collapsible=icon]:size-(--rail-logo)"
      />
      <span className="truncate text-base font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
        Finances
      </span>
    </>
  )

  return (
    <TooltipProvider delayDuration={300}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          {isMobile ? (
            <Link
              to={ROUTES.dashboard}
              onClick={closeMobileSheet}
              className="flex min-w-0 items-center gap-2 rounded-md p-2 no-underline"
            >
              {brand}
            </Link>
          ) : (
            // The whole header folds and unfolds the column: one large,
            // quiet target, usable with a finger (iPad, phone held sideways).
            // Folded, it is the logo, in the same square as the page icons.
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={open ? 'Réduire le menu' : 'Agrandir le menu'}
                  aria-expanded={open}
                  onClick={toggleSidebar}
                  className={cn(
                    'flex min-h-11 w-full min-w-11 items-center gap-2 rounded-md p-2 text-left',
                    'hover:bg-sidebar-accent transition-colors outline-none',
                    'focus-visible:ring-sidebar-ring focus-visible:ring-2',
                    'group-data-[collapsible=icon]:size-(--rail-button) group-data-[collapsible=icon]:min-h-0 group-data-[collapsible=icon]:min-w-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0',
                  )}
                >
                  {brand}
                  <ChevronLeftIcon
                    aria-hidden
                    className="text-muted-foreground ml-auto size-[1.1rem] shrink-0 group-data-[collapsible=icon]:hidden"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" align="center" hidden={open}>
                Agrandir le menu
              </TooltipContent>
            </Tooltip>
          )}
        </SidebarHeader>

        <SidebarContent>
          <nav aria-label="Navigation principale" className="contents">
            {NAV_GROUPS.map((group) => (
              <SidebarGroup key={group.label ?? 'main'}>
                {group.label && (
                  <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                )}
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map(({ label, to, icon: Icon, badge }) => {
                      const active = isNavItemActive(pathname, to)
                      const count = badge === 'reviewCount' ? reviewCount : null
                      return (
                        <SidebarMenuItem key={to}>
                          <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={label}
                            className={RAIL_BUTTON}
                          >
                            <Link
                              to={to}
                              search={monthSearch(
                                carriedMonth(pathname, search, to),
                              )}
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
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>

        <SidebarFooter>
          <UserMenu user={user} onNavigate={closeMobileSheet} />
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  )
}
