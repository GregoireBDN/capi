import { Link } from '@tanstack/react-router'
import {
  ConfirmDialog,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
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
 * - « Se déconnecter » (#353, direction « A. Bouton à côté »): an icon
 *   button on the same row (under the entry when folded), 44px and apart
 *   from it. One click on a computer; in the phone's navigation sheet,
 *   where it sits under the thumb, « Se déconnecter ? » first. The same
 *   sign-out as the Réglages row (`useSignOut`), which stays.
 */
export function AccountLink({ user, active, onNavigate }: AccountLinkProps) {
  return (
    <SidebarMenu className="flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col">
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
      <SidebarMenuItem className="shrink-0">
        <SignOutButton />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

/**
 * « Se déconnecter » beside the entry (#353). Its tooltip names it on a
 * computer; on phones (the navigation sheet) it asks first.
 */
export function SignOutButton() {
  const { isMobile } = useSidebar()
  const signOut = useSignOut()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)

  async function run() {
    setPending(true)
    try {
      await signOut()
    } finally {
      setPending(false)
    }
  }

  const button = (
    <button
      type="button"
      aria-label="Se déconnecter"
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={() => {
        if (isMobile) setConfirming(true)
        else void run()
      }}
      className={cn(
        'text-muted-foreground flex size-8 items-center justify-center rounded-md transition-colors outline-none',
        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        'focus-visible:ring-sidebar-ring focus-visible:ring-2 disabled:opacity-50',
        '[&_svg]:size-[1.1rem]',
        'group-data-[collapsible=icon]:size-(--rail-button) group-data-[collapsible=icon]:[&_svg]:size-[calc(var(--rail-icon)*0.8)]',
      )}
    >
      {/* The browser may hold the logout response while it clears its
          cache (`Clear-Site-Data`): show that it is on its way. */}
      {pending ? (
        <LoaderCircleIcon aria-hidden className="animate-spin" />
      ) : (
        <LogOutIcon aria-hidden />
      )}
    </button>
  )

  return (
    <>
      {isMobile ? (
        // No hover on a phone: the confirmation names the action.
        button
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right" align="center">
            Se déconnecter
          </TooltipContent>
        </Tooltip>
      )}
      {isMobile && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          onConfirm={run}
          loading={pending}
          title="Se déconnecter ?"
          description="Vous devrez vous reconnecter pour revoir vos comptes."
          confirmLabel="Se déconnecter"
        />
      )}
    </>
  )
}
