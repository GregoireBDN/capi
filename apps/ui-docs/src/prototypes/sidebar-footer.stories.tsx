import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@finances/ui'
import {
  ChevronRightIcon,
  ChevronsUpDownIcon,
  EllipsisVerticalIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  ListIcon,
  LogOutIcon,
  MenuIcon,
  PieChartIcon,
  SettingsIcon,
  TargetIcon,
  UploadIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * Prototypes of the sidebar footer (#352 the account entry, #353 a quick
 * sign-out), shown to the owner before one combination is built in
 * `apps/web`. Clickable mockups with a synthetic owner, not app code:
 * « Se déconnecter » only shows what would happen.
 *
 * Audit of the footer before (#300, « le compte = Réglages »):
 * - a round avatar on a `primary → info` gradient: nowhere else in the app;
 *   every other icon is a tinted square (settings rows, account badges,
 *   category icons);
 * - nothing says « Réglages » until hovered (folded: the tooltip only);
 * - the email is cut in the middle of the domain (« usertest@finances.t… »);
 * - signing out takes Réglages, a scroll and « Se déconnecter » (three
 *   steps on the phone).
 *
 * Account entry (#352)
 * A. Ligne de réglages (recommended): a gear on the primary tint, « Réglages »
 *    as the title and the name under it, then the chevron. Folded: the gear.
 * B. Compte puis réglages: the initials on the primary tint, the name, then
 *    « Compte et réglages »; a gear in place of the chevron. Folded: the
 *    initials with a small gear.
 * C. Deux parties: a small « Réglages » heading over the row, then the
 *    initials, the name and the email in full (wrapping after the @).
 *
 * Sign-out (#353)
 * A. Bouton à côté (recommended): an icon button « Se déconnecter » on the
 *    entry's row (44px, apart from it), under the entry when folded. One
 *    click on a computer, no confirmation; on the phone (the navigation
 *    sheet: menu, then the button) « Se déconnecter ? » first, since the
 *    button sits under the thumb.
 * B. Menu du compte: the entry opens a small menu (name and email,
 *    « Réglages », « Se déconnecter »); brings back the account menu #300
 *    removed.
 * C. Barre du haut (phone only): « ⋮ » in the top bar with « Réglages » and
 *    « Se déconnecter »; the computer keeps A.
 */
const meta: Meta = {
  title: 'Prototypes/Sidebar footer (#352, #353)',
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'desktop' },
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic owner and the prototype's own controls
 * ------------------------------------------------------------------------- */

const OWNER = { name: 'Camille Dupont', email: 'camille.dupont@exemple.test' }
const INITIALS = 'CD'

type Entry = 'A' | 'B' | 'C'
type SignOut = 'A' | 'B' | 'C'
type Frame = 'open' | 'folded' | 'phone'

const ENTRIES: { value: Entry; label: string }[] = [
  { value: 'A', label: 'A. Ligne de réglages' },
  { value: 'B', label: 'B. Compte puis réglages' },
  { value: 'C', label: 'C. Deux parties' },
]

const SIGN_OUTS: { value: SignOut; label: string }[] = [
  { value: 'A', label: 'A. Bouton à côté' },
  { value: 'B', label: 'B. Menu du compte' },
  { value: 'C', label: 'C. Barre du haut (téléphone)' },
]

/** The app's 22px root, so rem-sized mockups look like the app. */
function AppScale({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    const before = root.style.fontSize
    root.style.fontSize = '22px'
    return () => {
      root.style.fontSize = before
    }
  }, [])
  return <>{children}</>
}

const CHIP = cn(
  'border-input inline-flex h-11 shrink-0 items-center rounded-full border px-3',
  'text-sm font-medium whitespace-nowrap transition-colors',
  'data-[on=true]:border-primary data-[on=true]:bg-primary/10 data-[on=true]:text-primary',
)

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground w-28 text-xs">{label}</span>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={CHIP}
          data-on={option.value === value}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

/** 32px tinted square, like the settings rows (`SettingsList`). */
function Square({
  children,
  badge,
  className,
}: {
  children: ReactNode
  badge?: boolean
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-primary/12 text-primary relative flex size-[32px] shrink-0 items-center justify-center rounded-[8px] text-[13px] font-semibold [&>svg]:size-[18px]',
        className,
      )}
    >
      {children}
      {badge && (
        // Folded B / C: the initials say who, the gear says where.
        <span className="bg-sidebar text-muted-foreground absolute -right-1.5 -bottom-1.5 flex size-[18px] items-center justify-center rounded-full [&>svg]:size-[12px]!">
          <SettingsIcon />
        </span>
      )}
    </span>
  )
}

const ROW = cn(
  // 44px, like the app's menu rows (its rem is 22px).
  'hover:bg-sidebar-accent flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none',
  'focus-visible:ring-sidebar-ring focus-visible:ring-2',
)

/** Folded rail button: a square that fills the column (`--rail-button`). */
const RAIL = cn(
  'hover:bg-sidebar-accent mx-auto flex size-[52px] items-center justify-center rounded-md outline-none',
  'focus-visible:ring-sidebar-ring focus-visible:ring-2',
)

function RailTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/** The account entry of each direction, as a link to Réglages. */
function EntryRow({
  entry,
  frame,
  menu,
  onClick,
}: {
  entry: Entry
  frame: Frame
  /** Sign-out B: the entry opens the account menu. */
  menu: boolean
  onClick?: () => void
}) {
  const end = menu ? (
    <ChevronsUpDownIcon className="text-muted-foreground ml-auto size-4 shrink-0" />
  ) : entry === 'B' ? (
    <SettingsIcon className="text-muted-foreground ml-auto size-4 shrink-0" />
  ) : (
    <ChevronRightIcon className="text-muted-foreground ml-auto size-4 shrink-0" />
  )

  if (frame === 'folded') {
    return (
      <RailTip label={menu ? 'Compte' : 'Réglages'}>
        <button
          type="button"
          className={RAIL}
          aria-label={menu ? 'Compte' : `Réglages, ${OWNER.name}`}
          onClick={onClick}
        >
          {entry === 'A' ? (
            <Square className="size-[36px]">
              <SettingsIcon />
            </Square>
          ) : (
            <Square className="size-[36px]" badge>
              {INITIALS}
            </Square>
          )}
        </button>
      </RailTip>
    )
  }

  const text =
    entry === 'A' ? (
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block font-medium">Réglages</span>
        <span className="text-muted-foreground block text-xs break-normal">
          {OWNER.name}
        </span>
      </span>
    ) : entry === 'B' ? (
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block font-medium break-normal">{OWNER.name}</span>
        <span className="text-muted-foreground block text-xs">
          Compte et réglages
        </span>
      </span>
    ) : (
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block font-medium break-normal">{OWNER.name}</span>
        {/* The email in full, wrapping only after its @ (#325). */}
        <span className="text-muted-foreground block text-xs break-normal">
          {OWNER.email.split('@')[0]}
          <wbr />@{OWNER.email.split('@')[1]}
        </span>
      </span>
    )

  return (
    <button type="button" className={ROW} onClick={onClick}>
      <Square>{entry === 'A' ? <SettingsIcon /> : INITIALS}</Square>
      {text}
      {end}
    </button>
  )
}

/** Sign-out A: an icon button beside the entry, or under it when folded. */
function SignOutButton({
  frame,
  onClick,
}: {
  frame: Frame
  onClick: () => void
}) {
  const button = (
    <button
      type="button"
      aria-label="Se déconnecter"
      onClick={onClick}
      className={cn(
        frame === 'folded'
          ? RAIL
          : 'hover:bg-sidebar-accent flex size-8 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2',
        'text-muted-foreground hover:text-foreground [&>svg]:size-[18px]',
      )}
    >
      <LogOutIcon />
    </button>
  )
  // Phones have no hover: no tooltip, the confirmation names the action.
  if (frame === 'phone') return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={frame === 'folded' ? 'right' : 'top'}>
        Se déconnecter
      </TooltipContent>
    </Tooltip>
  )
}

/** Sign-out B: the account menu (popover on a computer, sheet on a phone). */
function AccountMenu({ phone }: { phone: boolean }) {
  return (
    <div
      className={cn(
        'bg-popover text-popover-foreground border shadow-lg',
        phone
          ? 'absolute inset-x-0 bottom-0 rounded-t-2xl p-3 pb-6'
          : 'absolute bottom-[calc(100%+0.25rem)] left-2 w-64 rounded-lg p-1',
      )}
    >
      <div className="px-2 py-2 leading-tight">
        <div className="font-medium">{OWNER.name}</div>
        <div className="text-muted-foreground text-xs break-normal">
          {OWNER.email.split('@')[0]}
          <wbr />@{OWNER.email.split('@')[1]}
        </div>
      </div>
      <div className="bg-border my-1 h-px" />
      <div className={ROW}>
        <SettingsIcon className="size-4" /> Réglages
      </div>
      <div className={ROW}>
        <LogOutIcon className="size-4" /> Se déconnecter
      </div>
    </div>
  )
}

/** Phones (A): « Se déconnecter ? » before ending the session. */
function Confirm({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background w-full rounded-xl border p-4 shadow-lg">
        <div className="font-semibold">Se déconnecter ?</div>
        <p className="text-muted-foreground mt-1 text-sm">
          Vous devrez vous reconnecter pour revoir vos comptes.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" outline onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={onClose}>Se déconnecter</Button>
        </div>
      </div>
    </div>
  )
}

const NAV = [
  { label: 'Tableau de bord', icon: LayoutDashboardIcon },
  { label: 'Dépenses', icon: PieChartIcon },
  { label: 'Opérations', icon: ListIcon },
  { label: 'Budget', icon: TargetIcon },
  { label: 'Comptes', icon: LandmarkIcon },
  { label: 'Import', icon: UploadIcon },
]

/** One sidebar (open, folded, or the phone's navigation sheet). */
function SidebarMock({
  frame,
  entry,
  signOut,
}: {
  frame: Frame
  entry: Entry
  signOut: SignOut
}) {
  const [confirming, setConfirming] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const folded = frame === 'folded'
  const menu = signOut === 'B'
  // C keeps A on a computer; on the phone sign-out lives in the top bar.
  const button = signOut === 'A' || (signOut === 'C' && frame !== 'phone')

  const signOutNow = () => {
    if (frame === 'phone') setConfirming(true)
    else setSignedOut(true)
  }

  return (
    <div
      className={cn(
        'bg-sidebar text-sidebar-foreground relative flex min-h-[560px] flex-col overflow-hidden rounded-xl border',
        frame === 'open' && 'w-[352px]',
        frame === 'folded' && 'w-[72px]',
        frame === 'phone' && 'w-[300px]',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 p-3 font-semibold',
          folded && 'justify-center',
        )}
      >
        <span className="bg-primary size-7 shrink-0 rounded-md" />
        {!folded && 'Finances'}
      </div>
      <div className="flex-1 space-y-0.5 p-2">
        {NAV.map(({ label, icon: Icon }) =>
          folded ? (
            <RailTip key={label} label={label}>
              <span className={cn(RAIL, '[&>svg]:size-[26px]')}>
                <Icon />
              </span>
            </RailTip>
          ) : (
            <div key={label} className={cn(ROW, '[&>svg]:size-[1.1rem]')}>
              <Icon /> {label}
            </div>
          ),
        )}
      </div>

      <div className="relative flex flex-col gap-1 p-2">
        {entry === 'C' && !folded && (
          <div className="text-muted-foreground px-2 pt-1 text-xs font-medium">
            Réglages
          </div>
        )}
        <div className={cn('flex gap-1', folded ? 'flex-col' : 'items-center')}>
          <EntryRow
            entry={entry}
            frame={frame}
            menu={menu}
            onClick={menu ? () => setMenuOpen((open) => !open) : undefined}
          />
          {button && <SignOutButton frame={frame} onClick={signOutNow} />}
        </div>
        {menu && menuOpen && frame !== 'phone' && <AccountMenu phone={false} />}
      </div>

      {menu && menuOpen && frame === 'phone' && (
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setMenuOpen(false)}
        >
          <AccountMenu phone />
        </div>
      )}
      {confirming && <Confirm onClose={() => setConfirming(false)} />}
      {signedOut && (
        <button
          type="button"
          className="bg-background/95 absolute inset-0 z-10 p-4 text-center text-sm"
          onClick={() => setSignedOut(false)}
        >
          Déconnecté → /auth
          <span className="text-muted-foreground block text-xs">
            (toucher pour revenir)
          </span>
        </button>
      )}
    </div>
  )
}

/** Sign-out C: the phone's top bar with its « ⋮ » menu, opened. */
function TopBarMock() {
  return (
    <div className="bg-background relative h-[560px] w-[300px] overflow-hidden rounded-xl border">
      <div className="flex h-12 items-center gap-2 border-b px-1">
        <span className="flex size-8 items-center justify-center">
          <MenuIcon className="size-5" />
        </span>
        <span className="bg-primary size-6 rounded-md" />
        <span className="ml-auto flex size-8 items-center justify-center">
          <EllipsisVerticalIcon className="size-5" />
        </span>
      </div>
      <div className="bg-popover absolute top-12 right-2 w-56 rounded-lg border p-1 shadow-lg">
        <div className={ROW}>
          <SettingsIcon className="size-4" /> Réglages
        </div>
        <div className={ROW}>
          <LogOutIcon className="size-4" /> Se déconnecter
        </div>
      </div>
      <p className="text-muted-foreground absolute inset-x-4 bottom-4 text-xs">
        Le « ⋮ » partagerait la barre avec les actions de la page (#246) : un
        menu de plus sur chaque page.
      </p>
    </div>
  )
}

function Frames({ entry, signOut }: { entry: Entry; signOut: SignOut }) {
  const frames: { frame: Frame; label: string }[] = [
    { frame: 'open', label: 'Ordinateur, menu ouvert' },
    { frame: 'folded', label: 'Replié' },
    { frame: 'phone', label: 'Téléphone, menu (feuille)' },
  ]
  return (
    <div className="flex flex-wrap items-start gap-4">
      {frames.map(({ frame, label }) => (
        <figure key={frame} className="space-y-2">
          <figcaption className="text-muted-foreground text-xs">
            {label}
          </figcaption>
          <SidebarMock frame={frame} entry={entry} signOut={signOut} />
        </figure>
      ))}
      {signOut === 'C' && (
        <figure className="space-y-2">
          <figcaption className="text-muted-foreground text-xs">
            Téléphone, barre du haut
          </figcaption>
          <TopBarMock />
        </figure>
      )}
    </div>
  )
}

/** Light then dark, side by side (keep the toolbar's theme on light). */
function Themes({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <section className="bg-background text-foreground rounded-xl p-4">
        <h3 className="mb-3 text-sm font-semibold">Clair</h3>
        {children}
      </section>
      <section className="dark bg-background text-foreground rounded-xl p-4">
        <h3 className="mb-3 text-sm font-semibold">Sombre</h3>
        {children}
      </section>
    </div>
  )
}

function Footer({
  initialEntry = 'A',
  initialSignOut = 'A',
}: {
  initialEntry?: Entry
  initialSignOut?: SignOut
}) {
  const [entry, setEntry] = useState<Entry>(initialEntry)
  const [signOut, setSignOut] = useState<SignOut>(initialSignOut)
  return (
    <AppScale>
      <TooltipProvider delayDuration={200}>
        <div className="bg-background text-foreground min-h-screen space-y-4 p-4">
          <div className="space-y-2">
            <Chips
              label="Entrée (#352)"
              options={ENTRIES}
              value={entry}
              onChange={setEntry}
            />
            <Chips
              label="Déconnexion (#353)"
              options={SIGN_OUTS}
              value={signOut}
              onChange={setSignOut}
            />
          </div>
          <Themes>
            <Frames entry={entry} signOut={signOut} />
          </Themes>
        </div>
      </TooltipProvider>
    </AppScale>
  )
}

/** The footer before: round gradient avatar, name, cut email, chevron. */
function Before() {
  return (
    <AppScale>
      <div className="bg-background text-foreground min-h-screen p-4">
        <Themes>
          <div className="flex flex-wrap items-end gap-4">
            <div className="bg-sidebar w-[352px] rounded-xl border p-2">
              <div className={ROW}>
                <span className="from-primary to-info text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold">
                  {INITIALS}
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate font-medium">{OWNER.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {OWNER.email}
                  </span>
                </span>
                <ChevronRightIcon className="text-muted-foreground size-4" />
              </div>
            </div>
            <div className="bg-sidebar w-[72px] rounded-xl border p-2">
              <span className="from-primary to-info text-primary-foreground mx-auto flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold">
                {INITIALS}
              </span>
            </div>
          </div>
        </Themes>
      </div>
    </AppScale>
  )
}

type Story = StoryObj

/** Recommended: entry A with sign-out A. Switch with the chips. */
export const Recommended: Story = { render: () => <Footer /> }

export const EntryBWithMenu: Story = {
  name: 'Entry B, sign-out B (account menu)',
  render: () => <Footer initialEntry="B" initialSignOut="B" />,
}

export const EntryCWithTopBar: Story = {
  name: 'Entry C, sign-out C (top bar)',
  render: () => <Footer initialEntry="C" initialSignOut="C" />,
}

export const BeforeFooter: Story = {
  name: 'Before (#300)',
  render: () => <Before />,
}
