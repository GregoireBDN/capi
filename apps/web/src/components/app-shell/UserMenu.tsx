import { Link, useNavigate } from '@tanstack/react-router'
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
  ListOrderedIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  TagsIcon,
  UserIcon,
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

/** Sidebar footer: who is signed in, plus profile, theme and logout. */
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
            <SidebarMenuButton size="lg" aria-label="Menu du compte">
              <span
                aria-hidden
                className="from-primary to-info text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold"
              >
                {getInitials(user.name)}
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </span>
              <ChevronsUpDownIcon className="text-muted-foreground ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="top"
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuItem asChild>
              <Link to={ROUTES.profile} onClick={onNavigate}>
                <UserIcon />
                Profil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={ROUTES.categories} onClick={onNavigate}>
                <TagsIcon />
                Catégories
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={ROUTES.rules} onClick={onNavigate}>
                <ListOrderedIcon />
                Règles
              </Link>
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
