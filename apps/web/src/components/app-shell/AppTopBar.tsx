import { Link } from '@tanstack/react-router'
import { Button, useSidebar } from '@finances/ui'
import { MenuIcon } from 'lucide-react'
import { ROUTES } from '#/lib/routes'

/** Mobile-only top bar (< md): opens the navigation sheet. */
export function AppTopBar() {
  const { openMobile, setOpenMobile } = useSidebar()

  return (
    <header className="bg-(--header-bg) sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur-lg md:hidden">
      <Button
        type="button"
        variant="secondary"
        ghost
        iconOnly
        size="sm"
        aria-label="Ouvrir le menu"
        aria-expanded={openMobile}
        className="-ml-2"
        onClick={() => setOpenMobile(true)}
      >
        <MenuIcon />
      </Button>
      <Link
        to={ROUTES.dashboard}
        className="flex items-center gap-2 no-underline"
      >
        <img src="/logo.svg" alt="" className="size-6" />
        <span className="font-semibold tracking-tight">Finances</span>
      </Link>
    </header>
  )
}
