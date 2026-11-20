import { Link, useMatches } from '@tanstack/react-router'
import { Button, cn, useSidebar } from '@finances/ui'
import { MenuIcon } from 'lucide-react'
import type { UserDto } from '#/api/types.gen'
import { useReviewCount } from '#/lib/review-count'
import { ROUTES } from '#/lib/routes'
import { AccountMenu } from './AccountMenu'
import {
  useSetPageActionsSlot,
  useSetPageBackSlot,
  useSetPageMonthSlot,
} from './page-actions'

/**
 * Header of the authenticated layout, on every width (#386, the owner's
 * direction « A », after Azure DevOps), above the sidebar:
 *
 * - ☰, on phones only: it opens the navigation sheet. From `md` up the
 *   sidebar is on screen and folds from its own foot (`AppSidebar`), which
 *   frees the header.
 * - The logo, back to the dashboard; a sub-page's way back (`PageBack`,
 *   « ‹ Comptes ») takes its place on phones and follows it from `md` up.
 * - The page's actions behind one « ⋮ » (`PageHeader`), on every width,
 *   only on a page that has some: the same header everywhere (the owner's
 *   choice on #386, after trying them as icons, beside the title, and a
 *   permanent « + Ajouter une dépense »).
 * - The avatar: the account menu (`AccountMenu`).
 * - On a month page, its month (`MonthNavigator`, #401, the owner's « B.
 *   Barre du mois »): a second row on phones, the middle of the row from
 *   `md` up.
 *
 * `h-12` per row: sticky elements below it use `top-(--app-top-bar)`, 3rem,
 * 6rem on a phone showing the month's bar (`globals.css`).
 */
export function AppHeader({ user }: { user: UserDto }) {
  const { openMobile, setOpenMobile } = useSidebar()
  const setActionsSlot = useSetPageActionsSlot()
  const setBackSlot = useSetPageBackSlot()
  const setMonthSlot = useSetPageMonthSlot()
  // A month page (`staticData.monthBar`): its bar is there from the first
  // render on phones.
  const monthPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.monthBar),
  })
  // Loads the « À revoir » count on every width: on phones the sidebar is
  // not mounted until opened, and Dépenses' « ⋮ » and Opérations' chip read
  // it (`useKnownReviewCount`). ☰ shows no dot (the owner, #393).
  useReviewCount()

  return (
    <header
      data-app-header
      className={cn(
        'bg-(--header-bg) group/header sticky top-0 z-20 grid shrink-0 border-b backdrop-blur-lg',
        // Phones: one row, then the month's own bar under it (#401).
        // Computer: the month in the middle of the one row.
        'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
      )}
    >
      <div className="flex h-12 min-w-0 items-center gap-1 pl-2 md:gap-2 md:pl-3">
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
      </div>
      {/* The page's month (`MonthNavigator`): a bar of its own under the
          row on phones, which the header carries when the page scrolls; the
          middle of the row on a computer, as wide whatever the month. */}
      <div
        ref={setMonthSlot}
        data-page-month
        className="@container col-span-2 row-start-2 flex h-12 items-center border-t px-2 empty:hidden md:col-span-1 md:col-start-2 md:row-start-1 md:w-[17rem] md:border-t-0 md:px-0 lg:w-[20rem]"
      />
      {/* Until the page has put its month there (once hydrated, and once
          it knows its month), keep the bar's room so nothing below moves;
          hidden by `globals.css` as soon as the month is in. */}
      {monthPage && (
        <div
          data-month-placeholder
          aria-hidden
          className="col-span-2 row-start-2 h-12 border-t md:hidden"
        />
      )}
      <div className="col-start-2 row-start-1 flex h-12 items-center justify-end gap-1 pr-2 md:col-start-3 md:gap-2 md:pr-3">
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
