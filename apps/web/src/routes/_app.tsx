import type { CSSProperties } from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider } from '@finances/ui'
import { AppSidebar } from '#/components/app-shell/AppSidebar'
import { AppHeader } from '#/components/app-shell/AppHeader'
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
      className="flex-col"
      // `--app-top-bar` (the header's height) lives in `globals.css`: it
      // grows on a phone showing a month's bar (#401).
      data-app-shell
      style={
        {
          '--sidebar-width': 'min(16rem, 32vw)',
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
        <div className="flex min-w-0 flex-1">
          <AppSidebar />
          <SidebarInset
            id="main-content"
            tabIndex={-1}
            className="min-w-0 outline-none"
          >
            <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 md:py-10">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </PageActionsSlotProvider>
    </SidebarProvider>
  )
}
