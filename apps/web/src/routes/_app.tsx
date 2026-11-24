import type { CSSProperties } from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider } from '@capi/ui'
import { AppSidebar } from '#/components/app-shell/AppSidebar'
import { AppHeader } from '#/components/app-shell/AppHeader'
import { MonthBarSlot } from '#/components/app-shell/MonthBarSlot'
import { APP_SCROLL_ID } from '#/components/app-shell/app-scroll'
import { PageActionsSlotProvider } from '#/components/app-shell/page-actions'
import { useAuth } from '#/lib/auth-context'
import { requireUser } from '#/lib/auth-guard'
import { readSidebarOpen } from '#/lib/sidebar-state'

/**
 * Authenticated layout (pathless): every route under `routes/_app/` requires a
 * signed-in user and renders inside the sidebar shell. The guard runs in
 * `beforeLoad`, so during SSR an anonymous request is redirected to `/auth`
 * before any protected markup is produced.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async () => ({
    user: await requireUser(),
    // Shown or hidden fixed sidebar (≥ md), remembered in a cookie and read
    // during SSR so the first render is already right.
    sidebarOpen: readSidebarOpen(),
  }),
  component: AppLayout,
})

function AppLayout() {
  const { user: guardUser, sidebarOpen } = Route.useRouteContext()
  // Prefer the live auth state (updated after profile edits), fall back to the
  // user resolved by the guard while the client auth context is loading.
  const { user } = useAuth()
  const currentUser = user ?? guardUser

  return (
    // Narrower fixed sidebar on small landscape screens (≥ md, e.g. a phone
    // held sideways) so the page keeps room; 16rem from ~1100px up.
    <SidebarProvider
      defaultOpen={sidebarOpen}
      // The header across the whole width, then the sidebar and the page.
      // The shell is as tall as the window and only the page's area scrolls
      // (#418): the header never moves and the scrollbar starts under it
      // (`body:has([data-app-shell])` in `globals.css`).
      className="min-h-0 flex-1 flex-col"
      // `--app-header` lives in `globals.css`.
      data-app-shell
      style={
        {
          // 34vw: « Dépenses partagées » whole on a small tablet (#409).
          '--sidebar-width': 'min(16rem, 34vw)',
          // Folded to its icons: a column centred under the header's logo
          // (0.75rem of padding + 0.25rem + half its 1.5rem), with 44px
          // square buttons around 1.1rem icons (`AppSidebar`, #386).
          '--sidebar-width-icon': '3.5rem',
          '--rail-button': '2rem',
        } as CSSProperties
      }
    >
      {/* The header hosts the page's way back, its actions and its month
          (`PageBack`, `PageHeader`, `MonthNavigator`). */}
      <PageActionsSlotProvider>
        <AppHeader user={currentUser} />
        <div className="flex min-h-0 min-w-0 flex-1">
          <AppSidebar />
          <SidebarInset className="min-h-0 min-w-0">
            {/* A month page's month, under the header, out of the scrolling
                area too (#401). */}
            <MonthBarSlot />
            {/* The one area that scrolls (#418): sticky elements inside it
                stick to its top (`top-0`), sticky bottom bars to the
                window's bottom. `relative`: what a page positions absolutely
                is clipped and scrolled with it, never left to stretch the
                body. Its id lets the router restore its scroll
                and reset it on a new page (`router.tsx`). */}
            <div
              id={APP_SCROLL_ID}
              data-scroll-restoration-id={APP_SCROLL_ID}
              className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
            >
              {/* The skip link's target (`AppHeader`): focused, the keys
                  scroll this area. The same space above the page's title on
                  every page and width (#418); the end clears the home
                  indicator, the body no longer padding it. */}
              <div
                id="main-content"
                tabIndex={-1}
                className="mx-auto w-full max-w-5xl px-4 pt-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))] outline-none sm:px-6"
              >
                <Outlet />
              </div>
            </div>
          </SidebarInset>
        </div>
      </PageActionsSlotProvider>
    </SidebarProvider>
  )
}
