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
      style={
        {
          '--sidebar-width': 'min(16rem, 32vw)',
          // Folded to its icons: a column that grows a little with the
          // screen (about 72px up to 1500px wide, 88px on a large one)...
          '--sidebar-width-icon': 'clamp(3.25rem, 4.6vw, 4rem)',
          // ...and its buttons and icons sized from it (`AppSidebar`).
          '--rail-button': 'calc(var(--sidebar-width-icon) - 1rem)',
          '--rail-icon': 'calc(var(--rail-button) * 0.5)',
          // Height of `AppHeader`, on every width (#386), for sticky
          // elements under it and the sidebar's column.
          '--app-top-bar': '3rem',
        } as CSSProperties
      }
    >
      {/* The header hosts the page's way back and, on phones, its other
          actions (`PageHeader`, `PageBack`). */}
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
