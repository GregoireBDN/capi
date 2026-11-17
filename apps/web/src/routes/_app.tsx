import type { CSSProperties } from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider } from '@finances/ui'
import { AppSidebar } from '#/components/app-shell/AppSidebar'
import { AppTopBar } from '#/components/app-shell/AppTopBar'
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
      style={
        {
          '--sidebar-width': 'min(16rem, 32vw)',
          // Folded to its icons: a column that grows a little with the
          // screen (about 72px up to 1500px wide, 88px on a large one)...
          '--sidebar-width-icon': 'clamp(3.25rem, 4.6vw, 4rem)',
          // ...and its buttons, icons and logo sized from it (`AppSidebar`).
          '--rail-button': 'calc(var(--sidebar-width-icon) - 1rem)',
          '--rail-icon': 'calc(var(--rail-button) * 0.5)',
          '--rail-logo': 'calc(var(--rail-button) * 0.64)',
        } as CSSProperties
      }
    >
      <AppSidebar user={currentUser} />
      {/* --app-top-bar: height of AppTopBar (shown below md only), for
          sticky elements under it. */}
      <SidebarInset className="min-w-0 [--app-top-bar:3rem] md:[--app-top-bar:0px]">
        {/* The top bar hosts the page's actions on phones (`PageHeader`). */}
        <PageActionsSlotProvider>
          <AppTopBar />
          <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 md:py-10">
            <Outlet />
          </div>
        </PageActionsSlotProvider>
      </SidebarInset>
    </SidebarProvider>
  )
}
