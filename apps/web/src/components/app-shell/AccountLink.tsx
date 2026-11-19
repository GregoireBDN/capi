import { Link } from '@tanstack/react-router'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@finances/ui'
import { ChevronRightIcon } from 'lucide-react'
import type { UserDto } from '#/api/types.gen'
import { ROUTES } from '#/lib/routes'
import { getInitials } from './user-initials'

interface AccountLinkProps {
  user: UserDto
  /** Whether a settings page is shown (the link is then the current one). */
  active: boolean
  /** Called before leaving the current page (closes the mobile sheet). */
  onNavigate?: () => void
}

/**
 * Sidebar footer (#300, owner's choice « le compte = Réglages »): who is
 * signed in, as the one link to Réglages, like the Apple ID row of iOS
 * Settings. The theme and « Se déconnecter » are in Réglages.
 */
export function AccountLink({ user, active, onNavigate }: AccountLinkProps) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          size="lg"
          isActive={active}
          tooltip="Réglages"
          className="group-data-[collapsible=icon]:size-(--rail-button)! group-data-[collapsible=icon]:justify-center"
        >
          <Link
            to={ROUTES.settings}
            onClick={onNavigate}
            // The row shows who; its name says where it goes.
            aria-label={`Réglages, ${user.name}`}
            aria-current={active ? 'page' : undefined}
          >
            <span
              aria-hidden
              className="from-primary to-info text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold"
            >
              {getInitials(user.name)}
            </span>
            <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:sr-only">
                <span className="truncate font-medium">{user.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {user.email}
              </span>
            </span>
            <ChevronRightIcon
              aria-hidden
              className="text-muted-foreground ml-auto group-data-[collapsible=icon]:hidden"
            />
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
