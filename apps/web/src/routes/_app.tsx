import type { CSSProperties } from 'react'
import { Outlet, createFileRoute } from '@tanstack/react-router'
import { SidebarInset, SidebarProvider } from '@finances/ui'
import { AppSidebar } from '#/components/app-shell/AppSidebar'
import { AppTopBar } from '#/components/app-shell/AppTopBar'
import { useAuth } from '#/lib/auth-context'
import { requireUser } from '#/lib/auth-guard'

/**
 * Authenticated layout (pathless): every route under `routes/_app/` requires a
 * signed-in user and renders inside the sidebar shell. The guard runs in
 * `beforeLoad`, so during SSR an anonymous request is redirected to `/auth`
 * before any protected markup is produced.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async () => ({ user: await requireUser() }),
  component: AppLayout,
})

function AppLayout() {
  const { user: guardUser } = Route.useRouteContext()
  // Prefer the live auth state (updated after profile edits), fall back to the
  // user resolved by the guard while the client auth context is loading.
  const { user } = useAuth()
  const currentUser = user ?? guardUser

  return (
    // Narrower fixed sidebar on small landscape screens (≥ md, e.g. a phone
    // held sideways) so the page keeps room; 16rem from ~1100px up.
    <SidebarProvider
      style={{ '--sidebar-width': 'min(16rem, 32vw)' } as CSSProperties}
    >
      <AppSidebar user={currentUser} />
      <SidebarInset className="min-w-0">
        <AppTopBar />
        <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 md:py-10">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
