import { useNavigate } from '@tanstack/react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@finances/ui'
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
} from 'lucide-react'
import type { UserDto } from '#/api/types.gen'
import { useAuth } from '#/lib/auth-context'
import { ROUTES } from '#/lib/routes'
import { useThemePreference } from '#/lib/use-theme-preference'
import type { ThemeMode } from '#/lib/use-theme'
import { getInitials } from './user-initials'

const THEME_OPTIONS = [
  { value: 'light', label: 'Clair', icon: SunIcon },
  { value: 'dark', label: 'Sombre', icon: MoonIcon },
  { value: 'auto', label: 'Système', icon: MonitorIcon },
] as const satisfies readonly {
  value: ThemeMode
  label: string
  icon: unknown
}[]

function isThemeMode(value: string): value is ThemeMode {
  return THEME_OPTIONS.some((option) => option.value === value)
}

interface UserMenuProps {
  user: UserDto
  /** Called before leaving the current page (closes the mobile sheet). */
  onNavigate?: () => void
}

/**
 * Sidebar footer: who is signed in, then Réglages (the list of #300, also the
 * sidebar entry just above), the theme and logout.
 */
export function UserMenu({ user, onNavigate }: UserMenuProps) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const { mode, setPreference } = useThemePreference()

  async function handleLogout() {
    onNavigate?.()
    await logout()
    await navigate({ to: ROUTES.auth })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label="Menu du compte"
              className="group-data-[collapsible=icon]:size-(--rail-button)! group-data-[collapsible=icon]:justify-center"
            >
              <span
                aria-hidden
                className="from-primary to-info text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold"
              >
                {getInitials(user.name)}
              </span>
              <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </span>
              <ChevronsUpDownIcon className="text-muted-foreground ml-auto group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="top"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuItem
              onSelect={() => {
                onNavigate?.()
                void navigate({ to: ROUTES.settings })
              }}
            >
              <SettingsIcon />
              Réglages
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Thème</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(value) => {
                if (isThemeMode(value)) void setPreference(value)
              }}
            >
              {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <Icon />
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void handleLogout()}>
              <LogOutIcon />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
