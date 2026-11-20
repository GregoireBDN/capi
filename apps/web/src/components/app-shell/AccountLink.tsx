import { Link } from '@tanstack/react-router'
import {
  ConfirmDialog,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  cn,
  useSidebar,
} from '@finances/ui'
import {
  ChevronRightIcon,
  LoaderCircleIcon,
  LogOutIcon,
  SettingsIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { UserDto } from '#/api/types.gen'
import { ROUTES } from '#/lib/routes'
import { useSignOut } from '#/lib/use-sign-out'

interface AccountLinkProps {
  user: UserDto
  /** Whether a settings page is shown (the link is then the current one). */
  active: boolean
  /** Called before leaving the current page (closes the mobile sheet). */
  onNavigate?: () => void
}

/**
 * Sidebar footer: the way to Réglages and a quick sign-out.
 *
 * - The entry (#352, direction « A. Ligne de réglages »; the one link to
 *   Réglages since #300): a gear on the primary tint in the settings rows'
 *   32px square, « Réglages » as its title and who is signed in under it,
 *   then the chevron. Folded, the gear alone, « Réglages » as its tooltip.
 * - « Se déconnecter » (#353): on a computer, its own row under the entry,
 *   its icon in the gear's column and its name in full (the owner's « Deux
 *   lignes » on PR #355), so the open footer folds into two icons like the
 *   pages above it; one click. In the phone's navigation sheet, an icon
 *   button on the entry's row, 44px and apart from it, and « Se
 *   déconnecter ? » first, since it sits under the thumb. The same sign-out
 *   as the Réglages row (`useSignOut`), which stays.
 */
export function AccountLink({ user, active, onNavigate }: AccountLinkProps) {
  const { isMobile } = useSidebar()
  return (
    <SidebarMenu className={cn('gap-1', isMobile && 'flex-row items-center')}>
      {/* A container: on a narrow column the chevron gives its room to the
          words (the gear already says where the entry goes). */}
      <SidebarMenuItem
        className={cn(
          '@container min-w-0 flex-1',
          // Folded, no container: a size container's own width would count
          // as 0, and the link would overflow the column (#352).
          'group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:[container-type:normal]',
        )}
      >
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip="Réglages"
          className={cn(
            'h-auto min-h-8 py-1.5',
            'group-data-[collapsible=icon]:size-(--rail-button)! group-data-[collapsible=icon]:min-h-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!',
          )}
        >
          <Link
            to={ROUTES.settings}
            onClick={onNavigate}
            // Where it goes, then who.
            aria-label={`Réglages, ${user.name}`}
            aria-current={active ? 'page' : undefined}
          >
            <span
              aria-hidden
              className={cn(
                // 32px whatever the root size, like the settings rows.
                'bg-primary/12 text-primary flex size-[32px] shrink-0 items-center justify-center rounded-[8px]',
                'group-data-[collapsible=icon]:size-[calc(var(--rail-button)*0.72)]',
              )}
            >
              <SettingsIcon className="size-[18px]! group-data-[collapsible=icon]:size-[calc(var(--rail-button)*0.4)]!" />
            </span>
            <span className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:sr-only">
              {/* Whole words: a long name wraps, never cut with « … » nor
                  broken inside a word (the body breaks `anywhere`). */}
              <span className="block font-medium wrap-break-word">
                Réglages
              </span>
              <span className="text-muted-foreground block text-xs font-normal wrap-break-word">
                {user.name}
              </span>
            </span>
            <ChevronRightIcon
              aria-hidden
              className="text-muted-foreground ml-auto group-data-[collapsible=icon]:hidden @max-[9rem]:hidden"
            />
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem className={cn(isMobile && 'shrink-0')}>
        {isMobile ? <PhoneSignOut /> : <ComputerSignOut />}
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/** Signs out once, tracking the wait (the response may take a while). */
function useSignOutAction() {
  const signOut = useSignOut()
  const [pending, setPending] = useState(false)
  async function run() {
    setPending(true)
    try {
      await signOut()
    } finally {
      setPending(false)
    }
  }
  return { pending, run }
}

/**
 * The browser may hold the logout response while it clears its cache
 * (`Clear-Site-Data`): a spinner shows that it is on its way.
 */
function SignOutIcon({ pending }: { pending: boolean }) {
  return pending ? (
    <LoaderCircleIcon aria-hidden className="animate-spin" />
  ) : (
    <LogOutIcon aria-hidden />
  )
}

/**
 * Computer: a row like a page's, its icon in the gear's 32px column so both
 * rows line up; folded, an icon with « Se déconnecter » as its tooltip.
 */
function ComputerSignOut() {
  const { pending, run } = useSignOutAction()
  return (
    <SidebarMenuButton
      tooltip="Se déconnecter"
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={() => void run()}
      className={cn(
        'text-muted-foreground',
        'group-data-[collapsible=icon]:size-(--rail-button)! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!',
      )}
    >
      <span
        aria-hidden
        className="flex w-[32px] shrink-0 justify-center [&_svg]:size-[18px]! group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:[&_svg]:size-[calc(var(--rail-icon)*0.8)]!"
      >
        <SignOutIcon pending={pending} />
      </span>
      <span className="group-data-[collapsible=icon]:sr-only">
        Se déconnecter
      </span>
    </SidebarMenuButton>
  )
}

/**
 * Phone (the navigation sheet): an icon button beside the entry, then
 * « Se déconnecter ? ». No tooltip: there is no hover on a phone.
 */
function PhoneSignOut() {
  const { pending, run } = useSignOutAction()
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label="Se déconnecter"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => setConfirming(true)}
        className={cn(
          'text-muted-foreground flex size-8 items-center justify-center rounded-md transition-colors outline-none',
          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          'focus-visible:ring-sidebar-ring focus-visible:ring-2 disabled:opacity-50',
          '[&_svg]:size-[1.1rem]',
        )}
      >
        <SignOutIcon pending={pending} />
      </button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={run}
        loading={pending}
        title="Se déconnecter ?"
        description="Vous devrez vous reconnecter pour revoir vos comptes."
        confirmLabel="Se déconnecter"
      />
    </>
  )
}
