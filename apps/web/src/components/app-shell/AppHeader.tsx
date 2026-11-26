import { Link } from '@tanstack/react-router'
import { Button, cn, useSidebar } from '@capi/ui'
import { MenuIcon } from 'lucide-react'
import type { UserDto } from '#/api/types.gen'
import { useAppEnvironment } from '#/lib/app-environment'
import { useReviewCount } from '#/lib/review-count'
import { ROUTES } from '#/lib/routes'
import { AccountMenu } from './AccountMenu'
import { useSetPageActionsSlot, useSetPageBackSlot } from './page-actions'
import { CapiWordmark } from '#/components/brand/CapiWordmark'
import { StagingBadge } from './StagingBadge'

/**
 * Header of the authenticated layout, on every width (#386, the owner's
 * direction « A », after Azure DevOps), above the sidebar:
 *
 * - ☰, on phones only: it opens the navigation sheet. From `md` up the
 *   sidebar is on screen and folds from its own foot (`AppSidebar`), which
 *   frees the header.
 * - The logo, back to the dashboard; a sub-page's way back (`PageBack`,
 *   #404) follows it from `md` up as a breadcrumb « Comptes › Compte
 *   courant », and takes its place on phones as « ‹ Comptes ».
 * - The page's actions behind one « ⋮ » (`PageHeader`), on every width,
 *   only on a page that has some: the same header everywhere (the owner's
 *   choice on #386, after trying them as icons, beside the title, and a
 *   permanent « + Ajouter une dépense »).
 * - The avatar: the account menu (`AccountMenu`).
 *
 * A month page's month is not in it: it is the bar at the top of the page's
 * column (`MonthBarSlot`, #401), fixed under the header.
 *
 * `h-12` on every width (`--app-header`, `globals.css`), out of the
 * scrolling area (#418): the page scrolls under it in its own area, so a
 * page's sticky elements stick to that area's top (`top-0`).
 *
 * On staging (#454, `APP_ENVIRONMENT`) it is yellow (`env-banner`) with
 * « Staging » beside the name, so it is never taken for production.
 */
export function AppHeader({ user }: { user: UserDto }) {
  const { openMobile, setOpenMobile } = useSidebar()
  const setActionsSlot = useSetPageActionsSlot()
  const setBackSlot = useSetPageBackSlot()
  // Loads the « À revoir » count on every width: on phones the sidebar is
  // not mounted until opened, and Mouvements' « ⋮ » and Opérations' chip read
  // it (`useKnownReviewCount`). ☰ shows no dot (the owner, #393).
  useReviewCount()
  const staging = useAppEnvironment() === 'staging'

  return (
    <header
      data-app-header
      className={cn(
        'bg-(--header-bg) group/header relative z-20 flex h-12 shrink-0 items-center gap-1 border-b px-2 backdrop-blur-lg md:gap-2 md:px-3',
        staging && 'env-banner',
      )}
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
        className="text-foreground relative rounded-full md:hidden [&_svg]:size-[1.1rem]"
        aria-label="Ouvrir le menu"
        aria-expanded={openMobile}
        onClick={() => setOpenMobile(true)}
      >
        <MenuIcon />
      </Button>
      <Link
        to={ROUTES.dashboard}
        className="flex h-11 shrink-0 items-center gap-2 rounded-lg px-1 no-underline group-has-[[data-page-back]:not(:empty)]/header:max-md:hidden"
      >
        {/* On staging phones the mark alone: the badge takes the room of
            « api » (both would push the avatar out at 320px). */}
        {/* 44px like the buttons, moved down by half the « p »'s descender
            so « Ca » sits on the header's middle line (#434). */}
        <CapiWordmark
          className="h-8 translate-y-[9%]"
          onBanner={staging}
          markOnPhones={staging}
        />
        {staging && <StagingBadge />}
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
