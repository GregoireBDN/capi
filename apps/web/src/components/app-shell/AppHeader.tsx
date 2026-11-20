import { Link } from '@tanstack/react-router'
import { Button, useSidebar } from '@finances/ui'
import { MenuIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import type { UserDto } from '#/api/types.gen'
import { ManualTransactionSheet } from '#/components/expenses/ManualTransactionSheet'
import { plural } from '#/lib/plural'
import { useReviewCount } from '#/lib/review-count'
import { ROUTES } from '#/lib/routes'
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
 * - Phones: the page's actions as icons (`PageHeader`; the owner's choice:
 *   every add of the page there). From `md` up: « + Ajouter une dépense » (the quick
 *   entry, on an expense: its usual use; the kind can be changed in it).
 *   « Opération » alone did not say what it added, and a search box here
 *   was unclear beside Opérations' own (the owner, #386): no search.
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
  const [addOpen, setAddOpen] = useState(false)
  // The quick entry is mounted on its first opening only (it loads the
  // categories and accounts).
  const [addMounted, setAddMounted] = useState(false)
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
          <span
            data-testid="menu-review-count"
            title={plural(
              reviewCount,
              'opération à revoir',
              'opérations à revoir',
            )}
            className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] leading-none font-semibold tabular-nums"
          >
            <span aria-hidden>{reviewCount > 99 ? '99+' : reviewCount}</span>
            <span className="sr-only">
              {plural(reviewCount, 'opération à revoir', 'opérations à revoir')}
            </span>
          </span>
        )}
      </Button>
      <Link
        to={ROUTES.dashboard}
        // Named even when the word steps aside.
        aria-label="Finances"
        className="flex h-11 shrink-0 items-center gap-2 rounded-lg px-1 no-underline group-has-[[data-page-back]:not(:empty)]/header:max-md:hidden"
      >
        <img src="/logo.svg" alt="" className="size-6" />
        {/* Below 380px with two page actions, the logo alone: the row
            would not hold the word too. */}
        <span className="font-semibold tracking-tight group-has-[[data-page-actions]>:nth-child(2)]/header:max-[380px]:hidden">
          Finances
        </span>
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
        <Button
          type="button"
          variant="primary"
          className="max-md:hidden"
          iconStart={<PlusIcon />}
          // An icon alone below lg: the name stays for screen readers.
          title="Ajouter une dépense"
          onClick={() => {
            setAddMounted(true)
            setAddOpen(true)
          }}
        >
          <span className="max-lg:sr-only">Ajouter une dépense</span>
        </Button>
        <AccountMenu user={user} />
      </div>
      {addMounted && (
        <ManualTransactionSheet
          open={addOpen}
          onOpenChange={setAddOpen}
          initialKind="expense"
        />
      )}
    </header>
  )
}
