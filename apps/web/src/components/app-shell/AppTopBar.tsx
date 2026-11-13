import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { Button, cn, useSidebar } from '@finances/ui'
import { MenuIcon } from 'lucide-react'
import { ROUTES } from '#/lib/routes'

/**
 * Top bar of the authenticated layout, with the menu button: below `md` it
 * opens the navigation sheet; from `md` up it only shows while the owner has
 * hidden the fixed sidebar, and brings it back. Kept compact (h-12); sticky
 * elements below it use `top-(--app-top-bar)` (set by `routes/_app.tsx`).
 */
export function AppTopBar() {
  const { isMobile, open, setOpen, openMobile, setOpenMobile } = useSidebar()
  const menuButton = useRef<HTMLButtonElement>(null)

  // Sidebar hidden from inside it (its button, Cmd/Ctrl+B): move the focus
  // here rather than leave it on a control that is sliding out of view.
  const wasOpen = useRef(open)
  useEffect(() => {
    const changed = !open && wasOpen.current && !isMobile
    wasOpen.current = open
    if (!changed) return
    // Next frame: the new styles (top bar shown or hidden, column visible
    // again) must be applied before the target can take the focus.
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      if (
        !active ||
        active === document.body ||
        active.closest('[data-slot=sidebar]')
      )
        menuButton.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open, isMobile])

  return (
    <header
      data-app-top-bar
      className={cn(
        'bg-(--header-bg) sticky top-0 z-20 flex h-12 items-center gap-1 border-b px-2 backdrop-blur-lg',
        open && 'md:hidden',
      )}
    >
      <Button
        ref={menuButton}
        type="button"
        variant="secondary"
        ghost
        iconOnly
        aria-label="Ouvrir le menu"
        aria-expanded={isMobile ? openMobile : open}
        onClick={() => (isMobile ? setOpenMobile(true) : setOpen(true))}
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
    </header>
  )
}
