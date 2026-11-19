import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { cn } from '@finances/ui/lib/utils'
import { ChevronRightIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * The Réglages list (#300), iPhone style like the transaction editor
 * (#280): groups of rows in a card, straight full-width hairlines between
 * them, each row its icon in a tinted square, its name, its current state
 * under it and a chevron when it opens a screen.
 */
export function SettingsGroup({
  label,
  className,
  children,
}: {
  /** Accessible name of the group (not shown). */
  label?: string
  className?: string
  children: ReactNode
}) {
  return (
    <ul
      aria-label={label}
      className={cn(
        'bg-card divide-border divide-y overflow-hidden rounded-xl border',
        className,
      )}
    >
      {children}
    </ul>
  )
}

/** Tints of the icon squares, from the theme's tokens. */
export const SETTINGS_TONES = {
  primary: 'bg-primary/12 text-primary',
  info: 'bg-info/12 text-info',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/15 text-warning',
  muted: 'bg-muted text-muted-foreground',
  danger: 'bg-destructive/12 text-destructive',
} as const

export type SettingsTone = keyof typeof SETTINGS_TONES

function SettingsIcon({
  icon: Icon,
  tone,
}: {
  icon: LucideIcon
  tone: SettingsTone
}) {
  return (
    <span
      aria-hidden
      className={cn(
        // 32px whatever the root size (the app's rem is 22px).
        'flex size-[32px] shrink-0 items-center justify-center rounded-[8px] [&_svg]:size-[18px]',
        SETTINGS_TONES[tone],
      )}
    >
      <Icon />
    </span>
  )
}

/** Name and state of a row: the name is cut with …, the state wraps. */
function RowText({
  title,
  state,
  danger,
}: {
  title: string
  state?: ReactNode
  danger?: boolean
}) {
  return (
    <span className="block min-w-0 flex-1">
      <span
        className={cn(
          'block truncate font-medium',
          danger && 'text-destructive',
        )}
      >
        {title}
      </span>
      {state !== undefined && (
        // Wraps rather than cutting (« Mot de passe, aucune passkey, … »).
        <span className="text-muted-foreground block text-xs text-pretty">
          {/* Keeps the row's height while the state loads. */}
          {state || ' '}
        </span>
      )}
    </span>
  )
}

const ROW =
  'flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left text-sm'

/** A row that opens its own screen: one link, its chevron last. */
export function SettingsLinkRow({
  to,
  icon,
  tone = 'muted',
  title,
  state,
}: {
  to: LinkProps['to']
  icon: LucideIcon
  tone?: SettingsTone
  title: string
  /** Current state under the name; `null` while it loads. */
  state?: ReactNode
}) {
  return (
    <li>
      <Link
        to={to}
        className={cn(
          ROW,
          'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] focus-visible:ring-inset',
          'transition-colors',
        )}
      >
        <SettingsIcon icon={icon} tone={tone} />
        <RowText title={title} state={state} danger={tone === 'danger'} />
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </Link>
    </li>
  )
}

/**
 * A row with its control in place (no screen): the name, then the control
 * filling the rest of the row, or a line of its own under the name when
 * both don't fit.
 */
export function SettingsControlRow({
  icon,
  tone = 'muted',
  title,
  titleId,
  children,
}: {
  icon: LucideIcon
  tone?: SettingsTone
  title: string
  /** Id of the name, to label the control with. */
  titleId: string
  children: ReactNode
}) {
  return (
    <li className={cn(ROW, 'flex-wrap gap-y-2')}>
      <span className="flex min-w-0 items-center gap-3">
        <SettingsIcon icon={icon} tone={tone} />
        <span id={titleId} className="font-medium">
          {title}
        </span>
      </span>
      <span className="flex min-w-0 flex-[1_1_15rem]">{children}</span>
    </li>
  )
}

/** A row that acts at once (no screen, no chevron), e.g. « Se déconnecter ». */
export function SettingsButtonRow({
  icon,
  tone = 'muted',
  title,
  onClick,
}: {
  icon: LucideIcon
  tone?: SettingsTone
  title: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          ROW,
          'min-h-12 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px] focus-visible:ring-inset',
          'transition-colors',
        )}
      >
        <SettingsIcon icon={icon} tone={tone} />
        <RowText title={title} />
      </button>
    </li>
  )
}
