import { Link } from '@tanstack/react-router'
import { Button, useSidebar } from '@finances/ui'
import { MenuIcon } from 'lucide-react'
import type { UserDto } from '#/api/types.gen'
import { plural } from '#/lib/plural'
import { useReviewCount } from '#/lib/review-count'
import { ROUTES } from '#/lib/routes'
import { IconDot } from './badges'
import { AccountMenu } from './AccountMenu'
import { useSetPageActionsSlot, useSetPageBackSlot } from './page-actions'

/**
 * Header of the authenticated layout, on every width (#386, the owner's
 * direction « A », after Azure DevOps), above the sidebar:
 *
 * - ☰, on phones only: it opens the navigation sheet, with a dot counting
 *   the transactions to review. From `md` up the sidebar is on screen and
 *   folds from its own foot (`AppSidebar`), which frees the header.
 * - The logo, back to the dashboard; a sub-page's way back (`PageBack`,
 *   « ‹ Comptes ») takes its place on phones and follows it from `md` up.
 * - The page's actions behind one « ⋮ » (`PageHeader`), on every width,
 *   only on a page that has some: the same header everywhere (the owner's
 *   choice on #386, after trying them as icons, beside the title, and a
 *   permanent « + Ajouter une dépense »).
 * - The avatar: the account menu (`AccountMenu`).
 *
 * `h-12` on every width: sticky elements below it use `top-(--app-top-bar)`
 * (set by `routes/_app.tsx`).
 */
export function AppHeader({ user }: { user: UserDto }) {
  const { openMobile, setOpenMobile } = useSidebar()
  const setActionsSlot = useSetPageActionsSlot()
  const setBackSlot = useSetPageBackSlot()
  const reviewCount = useReviewCount()
  // The sidebar's « À revoir » badge is out of sight: on ☰ instead.
  const showReviewDot = reviewCount !== null && reviewCount > 0

  return (
    <header
      data-app-header
      className="bg-(--header-bg) group/header sticky top-0 z-20 flex h-12 shrink-0 items-center gap-1 border-b px-2 backdrop-blur-lg md:gap-2 md:px-3"
    >
      <a
        href="#main-content"
        // Visually hidden until focused: its box only appears with the focus.
        className="focus:bg-background focus-visible:ring-ring/50 sr-only text-sm font-medium focus:not-sr-only focus:absolute focus:top-1 focus:left-2 focus:z-30 focus:rounded-lg focus:px-3 focus:py-2 focus-visible:ring-[3px]"
      >
        Aller au contenu
      </a>
      <Button
        type="button"
        variant="secondary"
        ghost
        iconOnly
        className="relative md:hidden [&_svg]:size-[1.1rem]"
        aria-label="Ouvrir le menu"
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(true)}
      >
        <MenuIcon />
        {showReviewDot && (
          <IconDot
            data-testid="menu-review-count"
            label={plural(
              reviewCount,
              'opération à revoir',
              'opérations à revoir',
            )}
          />
        )}
      </Button>
      <Link
        to={ROUTES.dashboard}
        className="flex h-11 shrink-0 items-center gap-2 rounded-lg px-1 no-underline group-has-[[data-page-back]:not(:empty)]/header:max-md:hidden"
      >
        <img src="/logo.svg" alt="" className="size-6" />
        <span className="font-semibold tracking-tight">Finances</span>
      </Link>
      <div
        ref={setBackSlot}
        data-page-back
        className="flex min-w-0 items-center empty:hidden md:ml-1 md:border-l md:pl-2"
      />
      <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
        <div
          ref={setActionsSlot}
          data-page-actions
          className="flex items-center gap-1 empty:hidden"
        />
        <AccountMenu user={user} />
      </div>
    </header>
  )
}
