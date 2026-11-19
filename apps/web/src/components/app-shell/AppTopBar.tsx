import { Link } from '@tanstack/react-router'
import { Button, useSidebar } from '@finances/ui'
import { MenuIcon } from 'lucide-react'
import { ROUTES } from '#/lib/routes'
import { useSetPageActionsSlot } from './page-actions'

/**
 * Top bar of the authenticated layout, below `md` only: its menu button
 * opens the navigation sheet. From `md` up the sidebar is always on screen
 * (full or folded to its icons), so there is no top bar. Kept compact
 * (h-12); sticky elements below it use `top-(--app-top-bar)` (set by
 * `routes/_app.tsx`). Its right side hosts the actions of the page shown
 * (`PageHeader`), which sit beside the title from `md` up.
 */
export function AppTopBar() {
  const { openMobile, setOpenMobile } = useSidebar()
  const setActionsSlot = useSetPageActionsSlot()

  return (
    <header
      data-app-top-bar
      className="bg-(--header-bg) sticky top-0 z-20 flex h-12 items-center gap-1 border-b px-2 backdrop-blur-lg md:hidden"
    >
      <Button
        type="button"
        variant="secondary"
        ghost
        iconOnly
        aria-label="Ouvrir le menu"
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(true)}
      >
        <MenuIcon />
      </Button>
      <Link
        to={ROUTES.dashboard}
        className="flex h-11 items-center gap-2 rounded-lg px-1 no-underline"
      >
        <img src="/logo.svg" alt="" className="size-6" />
        <span className="font-semibold tracking-tight">Finances</span>
      </Link>
      <div
        ref={setActionsSlot}
        data-page-actions
        className="ml-auto flex items-center gap-1"
      />
    </header>
  )
}
