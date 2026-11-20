import { Link, useRouterState } from '@tanstack/react-router'
import { QueryClientContext, useQuery } from '@tanstack/react-query'
import { useContext } from 'react'
import { owedSummaryQuery } from '#/components/owed/queries'
import { formatCents, formatWholeEuros } from '#/lib/money'
import { ChevronsLeftIcon, ChevronsRightIcon, SettingsIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  TooltipProvider,
  cn,
  useSidebar,
} from '@finances/ui'
import { REVIEW_SEARCH } from '#/components/transactions/search'
import { plural } from '#/lib/plural'
import { useReviewCount } from '#/lib/review-count'
import { ROUTES } from '#/lib/routes'
import {
  NAV_GROUPS,
  carriedMonth,
  isNavEntryActive,
  isSettingsPage,
} from './nav-items'
import type { NavItem } from './nav-items'

/**
 * Page icons a little larger than the menu default, the same size open and
 * folded (#386: the owner found the folded ones far too big). Folded,
 * 44px square buttons centred in the column (`routes/_app.tsx` sets
 * `--rail-button`).
 */
export const RAIL_BUTTON = cn(
  '[&_svg]:size-[1.1rem]',
  // The current page on the primary tint, hover in the neutral accent: two
  // looks, so a hovered row beside the current one reads as such (#386).
  'hover:bg-foreground/6 hover:text-sidebar-foreground',
  'data-active:bg-primary/12 data-active:text-primary data-active:hover:bg-primary/16 data-active:hover:text-primary',
  'group-data-[collapsible=icon]:size-(--rail-button)!',
  'group-data-[collapsible=icon]:p-0!',
  'group-data-[collapsible=icon]:justify-center',
  // The name stays for screen readers but takes no room: the icon centres.
  'group-data-[collapsible=icon]:[&>span]:sr-only',
)

/** Search of a nav link: the month carried, else none. */
function monthSearch(month: string | undefined): { month?: string } {
  return month === undefined ? {} : { month }
}

/**
 * Sidebar of the authenticated layout (#386, the owner's direction « A »,
 * after Azure DevOps): the navigation in titled groups, then at its foot
 * « Réglages » and the button that folds it. From `md` up it is a fixed
 * column under the header (`AppHeader`), folded down to its icons and back
 * by that button (or Cmd/Ctrl+B); folded, the page names show as tooltips
 * and a short rule replaces each group's title. Below `md` the
 * `@finances/ui` Sidebar renders it inside a sheet, opened from the
 * header's ☰, whose top links to the dashboard. Who is signed in, the theme
 * and the sign-out are in the header's account menu (`AccountMenu`).
 */
export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const search = useRouterState({ select: (s) => s.location.search })
  const { isMobile, open, setOpenMobile, toggleSidebar } = useSidebar()
  const reviewCount = useReviewCount()
  // The badge reads the query cache when the app provides one.
  const queryClient = useContext(QueryClientContext)

  const onSettings = isSettingsPage(pathname)

  // The mobile sheet stays open across navigations unless we close it.
  const closeMobileSheet = () => {
    if (isMobile) setOpenMobile(false)
  }

  function renderItem(item: NavItem) {
    const { label, to, icon: Icon, badge } = item
    const active = isNavEntryActive(pathname, item)
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
            search={monthSearch(carriedMonth(pathname, search, to))}
            onClick={closeMobileSheet}
            aria-current={active ? 'page' : undefined}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        </SidebarMenuButton>
        {/* The badge is a link of its own: Opérations filtered on « À
            revoir » (#322). Hidden while the column is folded. */}
        {/* What people owe the owner (#359), hidden at 0. */}
        {badge === 'owedTotal' && queryClient && <OwedBadge to={to} />}
        {count !== null && count > 0 && (
          <Link
            to={ROUTES.transactions}
            search={REVIEW_SEARCH}
            onClick={closeMobileSheet}
            data-testid={`nav-badge-${to}`}
            aria-label={plural(
              count,
              'opération à revoir',
              'opérations à revoir',
            )}
            title="Voir les opérations à revoir"
            className="bg-primary text-primary-foreground focus-visible:ring-sidebar-ring touch-hitbox absolute top-1/2 right-1 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums outline-none select-none hover:opacity-90 focus-visible:ring-2 group-data-[collapsible=icon]:hidden"
          >
            {/* In a span: the link's 44px touch area (::after) must not
                count as text sticking out of the badge. */}
            <span>{count > 99 ? '99+' : count}</span>
          </Link>
        )}
        {/* Folded, a dot on the icon says there is something to review. */}
        {count !== null && count > 0 && (
          <span
            aria-hidden
            data-testid="nav-review-dot"
            className="bg-primary pointer-events-none absolute top-1.5 right-1.5 hidden size-2 rounded-full group-data-[collapsible=icon]:block"
          />
        )}
      </SidebarMenuItem>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      {/* From md up the column starts under the header (`AppHeader`),
          which already keeps clear of the notch. */}
      <Sidebar
        collapsible="icon"
        className="md:top-[calc(env(safe-area-inset-top)+var(--app-top-bar))] md:pt-0"
      >
        {/* The sheet has no header above it: its top links to the
            dashboard. From md up the logo is in the header. */}
        {isMobile && (
          <SidebarHeader>
            <Link
              to={ROUTES.dashboard}
              onClick={closeMobileSheet}
              className="flex min-h-11 min-w-0 items-center gap-2 rounded-md p-2 no-underline"
            >
              <img src="/logo.svg" alt="" className="size-7 shrink-0" />
              <span className="truncate text-base font-semibold tracking-tight">
                Finances
              </span>
            </Link>
          </SidebarHeader>
        )}

        <SidebarContent>
          <nav aria-label="Navigation principale" className="contents">
            {NAV_GROUPS.map((group, index) => (
              <SidebarGroup
                key={group.label}
                role="group"
                aria-labelledby={groupId(group.label)}
                // The titles already part the groups: less room around them.
                className="py-1"
              >
                {/* Folded, the group titles give way to a short rule
                    between the groups (the owner, #386). */}
                {index > 0 && (
                  <span
                    aria-hidden
                    data-testid="nav-group-divider"
                    className="bg-sidebar-border pointer-events-none absolute top-0 left-1/2 hidden h-px w-6 -translate-x-1/2 group-data-[collapsible=icon]:block"
                  />
                )}
                <SidebarGroupLabel id={groupId(group.label)}>
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  {/* A little room between rows, so a hovered one beside the
                      current one reads apart (#386). */}
                  <SidebarMenu className="gap-0.5">
                    {group.items.map(renderItem)}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </nav>
        </SidebarContent>

        {/* At the foot (#386, after Azure DevOps, the owner's choice):
            « Réglages », the one way to the settings pages, and from md up
            the button that folds the column, beside it (under it once
            folded). */}
        <SidebarFooter className="border-sidebar-border border-t">
          <SidebarMenu className="flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col">
            <SidebarMenuItem className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none">
              <SidebarMenuButton
                asChild
                isActive={onSettings}
                tooltip="Réglages"
                className={RAIL_BUTTON}
              >
                <Link
                  to={ROUTES.settings}
                  onClick={closeMobileSheet}
                  aria-current={onSettings ? 'page' : undefined}
                >
                  <SettingsIcon />
                  <span>Réglages</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {!isMobile && (
              <SidebarMenuItem className="shrink-0">
                <SidebarMenuButton
                  tooltip="Agrandir le menu"
                  aria-label={open ? 'Réduire le menu' : 'Agrandir le menu'}
                  aria-expanded={open}
                  onClick={toggleSidebar}
                  className={cn(
                    RAIL_BUTTON,
                    'text-muted-foreground size-8 justify-center p-0',
                  )}
                >
                  {open ? <ChevronsLeftIcon /> : <ChevronsRightIcon />}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  )
}

/** The id of a group's title, which names its list. */
function groupId(label: string): string {
  return `nav-group-${label.toLowerCase()}`
}

/**
 * What people owe the owner (#359), whole euros, hidden at 0, and on the
 * narrow column of small tablets (768–1023px), where it would touch the name.
 */
function OwedBadge({ to }: { to: string }) {
  const owed = useQuery(owedSummaryQuery)
  const total = owed.data?.owedToMe.totalCents ?? 0
  if (total <= 0) return null
  return (
    <span
      data-testid={`nav-badge-${to}`}
      aria-label={`On me doit ${formatCents(total)}`}
      className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs whitespace-nowrap tabular-nums group-data-[collapsible=icon]:hidden md:max-lg:hidden"
    >
      {formatWholeEuros(total)}
    </span>
  )
}
