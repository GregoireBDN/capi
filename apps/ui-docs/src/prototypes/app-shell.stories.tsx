import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  CategoryIcon,
  SegmentedControl,
  SegmentedControlItem,
  cn,
} from '@finances/ui'
import {
  ArrowLeftRightIcon,
  BitcoinIcon,
  CalendarCheckIcon,
  ChartPieIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  EllipsisVerticalIcon,
  HandCoinsIcon,
  InfoIcon,
  KeyRoundIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  ListFilterIcon,
  LogOutIcon,
  MenuIcon,
  MonitorSmartphoneIcon,
  PencilIcon,
  PiggyBankIcon,
  PlusIcon,
  RepeatIcon,
  SearchIcon,
  SettingsIcon,
  ShieldIcon,
  SparklesIcon,
  TagsIcon,
  TargetIcon,
  TriangleAlertIcon,
  UploadIcon,
  UserIcon,
  XIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * Prototypes of the app frame (#386): a header and a sidebar on the phone
 * and on a computer, the account, Réglages, Apparence and the sign-out
 * placed again. Clickable mockups with a synthetic owner and synthetic
 * figures, not app code: nothing is saved, nobody is signed out.
 *
 * Avant: what the app does today (thin top bar on phones, sidebar only from
 * 768px, Réglages and « Se déconnecter » at the sidebar's foot).
 *
 * A. Comme Azure DevOps: a header on every width. Phone: ☰ · logo (or
 *    « ‹ Comptes ») · page actions · avatar. Computer: ☰ (folds the
 *    sidebar) · logo · « Comptes › Livret A » · search · « + Opération » ·
 *    avatar. The sidebar holds the navigation only, in three groups, with
 *    Réglages at its foot. The avatar opens the account card (name, email,
 *    Apparence, Réglages, Se déconnecter).
 * B. A avec un menu ⋮: the rare global things (add, import, Revue du mois,
 *    Catégories, Règles, Claude et accès, search on the phone, help) go
 *    into ⋮; the sidebar keeps only the everyday pages. On the phone ⋮ also
 *    holds the page's other actions (« Cette page »), so the header has one
 *    ⋮, never two.
 * C. Un en-tête qui ne change jamais: the header carries only what is
 *    global (☰, logo, « + », avatar) and is the same on every page; the
 *    title, the way back and the page actions are in the page on every
 *    width.
 */
const meta: Meta<FrameArgs> = {
  title: 'Prototypes/App frame (#386)',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
  argTypes: {
    direction: {
      control: 'inline-radio',
      options: ['avant', 'A', 'B', 'C'],
    },
    page: {
      control: 'inline-radio',
      options: ['dashboard', 'operations', 'account', 'settings'],
    },
    width: { control: 'inline-radio', options: [320, 390, 1280] },
    overlay: {
      control: 'inline-radio',
      options: ['none', 'menu', 'account', 'more', 'add'],
    },
    folded: { control: 'boolean' },
  },
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic owner, pages and navigation
 * ------------------------------------------------------------------------- */

type Direction = 'avant' | 'A' | 'B' | 'C'
type PageKey = 'dashboard' | 'operations' | 'account' | 'settings'
/** What is open over the page: the ☰ drawer, the account card, ⋮, « + ». */
type Overlay = 'none' | 'menu' | 'account' | 'more' | 'add'

interface FrameArgs {
  direction: Direction
  page: PageKey
  width: number
  overlay: Overlay
  /** Computer: the sidebar folded down to its icons. */
  folded: boolean
}

const OWNER = { name: 'Camille Dupont', email: 'camille.dupont@exemple.test' }
const INITIALS = 'CD'
const REVIEW_COUNT = 12

type NavKey =
  | 'dashboard'
  | 'spending'
  | 'transactions'
  | 'budget'
  | 'review'
  | 'accounts'
  | 'savings'
  | 'crypto'
  | 'owed'
  | 'subscriptions'
  | 'import'
  | 'rules'
  | 'categories'
  | 'settings'

const NAV: Record<NavKey, { label: string; icon: LucideIcon }> = {
  dashboard: { label: 'Tableau de bord', icon: LayoutDashboardIcon },
  spending: { label: 'Dépenses', icon: ChartPieIcon },
  transactions: { label: 'Opérations', icon: ArrowLeftRightIcon },
  budget: { label: 'Budget', icon: TargetIcon },
  review: { label: 'Revue du mois', icon: CalendarCheckIcon },
  accounts: { label: 'Comptes', icon: LandmarkIcon },
  savings: { label: 'Épargne', icon: PiggyBankIcon },
  crypto: { label: 'Crypto', icon: BitcoinIcon },
  owed: { label: 'Entre proches', icon: HandCoinsIcon },
  subscriptions: { label: 'Abonnements', icon: RepeatIcon },
  import: { label: 'Import', icon: UploadIcon },
  rules: { label: 'Règles', icon: ListFilterIcon },
  categories: { label: 'Catégories', icon: TagsIcon },
  settings: { label: 'Réglages', icon: SettingsIcon },
}

interface NavGroup {
  title?: string
  items: NavKey[]
}

/** The sidebar of each direction: its groups, and what sits at its foot. */
const SIDEBARS: Record<
  Direction,
  { groups: NavGroup[]; foot: 'today' | 'settings' | 'none' }
> = {
  avant: {
    groups: [
      {
        items: [
          'dashboard',
          'spending',
          'transactions',
          'budget',
          'subscriptions',
          'savings',
          'crypto',
          'owed',
          'accounts',
          'import',
        ],
      },
    ],
    foot: 'today',
  },
  A: {
    groups: [
      {
        title: 'Suivi',
        items: ['dashboard', 'spending', 'transactions', 'budget', 'review'],
      },
      { title: 'Patrimoine', items: ['accounts', 'savings', 'crypto', 'owed'] },
      {
        title: 'Outils',
        items: ['subscriptions', 'import', 'rules', 'categories'],
      },
    ],
    foot: 'settings',
  },
  B: {
    groups: [
      {
        title: 'Suivi',
        items: [
          'dashboard',
          'spending',
          'transactions',
          'budget',
          'subscriptions',
        ],
      },
      { title: 'Patrimoine', items: ['accounts', 'savings', 'crypto', 'owed'] },
    ],
    foot: 'settings',
  },
  C: {
    groups: [
      {
        title: 'Suivi',
        items: ['dashboard', 'spending', 'transactions', 'budget', 'review'],
      },
      { title: 'Patrimoine', items: ['accounts', 'savings', 'crypto', 'owed'] },
      {
        title: 'Outils',
        items: ['subscriptions', 'import', 'rules', 'categories'],
      },
    ],
    foot: 'none',
  },
}

interface PageAction {
  label: string
  icon: LucideIcon
  primary?: boolean
}

interface PageDef {
  title: string
  description?: string
  nav: NavKey
  back?: string
  actions: PageAction[]
}

const PAGES: Record<PageKey, PageDef> = {
  dashboard: { title: 'Tableau de bord', nav: 'dashboard', actions: [] },
  operations: {
    title: 'Opérations',
    nav: 'transactions',
    actions: [
      { label: 'Ajouter une opération', icon: PlusIcon, primary: true },
      { label: 'Importer un relevé', icon: UploadIcon },
    ],
  },
  account: {
    title: 'Livret A',
    description: 'Banque Exemple',
    nav: 'accounts',
    back: 'Comptes',
    actions: [
      { label: 'Importer un relevé', icon: UploadIcon },
      { label: 'Ajouter une opération', icon: PlusIcon },
      { label: 'Modifier', icon: PencilIcon },
    ],
  },
  settings: { title: 'Réglages', nav: 'settings', actions: [] },
}

/* ---------------------------------------------------------------------------
 * Scale and small pieces
 * ------------------------------------------------------------------------- */

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

const ICON_BUTTON = cn(
  'relative flex size-8 shrink-0 items-center justify-center rounded-lg outline-none',
  'hover:bg-muted/60 focus-visible:ring-ring/50 focus-visible:ring-[3px]',
  '[&_svg]:size-[1.1rem]',
)

function IconButton({
  label,
  onClick,
  children,
  className,
  pressed,
  dot,
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  className?: string
  pressed?: boolean
  /** A count on the button (the transactions to review, on ☰). */
  dot?: number
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={pressed}
      onClick={onClick}
      className={cn(ICON_BUTTON, pressed && 'bg-muted', className)}
    >
      {children}
      {dot !== undefined && (
        <span
          aria-hidden
          className="bg-primary text-primary-foreground absolute top-1 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] leading-none font-semibold tabular-nums"
        >
          {dot}
        </span>
      )}
    </button>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex h-11 shrink-0 items-center gap-2 px-1">
      <LogoMark />
      {!compact && (
        <span className="font-semibold tracking-tight">Finances</span>
      )}
    </span>
  )
}

/** A stand-in for `/logo.svg` (the story has no public folder). */
function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'from-primary to-info flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-[13px] font-bold text-white',
        className,
      )}
    >
      €
    </span>
  )
}

function Avatar({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-primary text-primary-foreground flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' ? 'size-[32px] text-[13px]' : 'size-[56px] text-[20px]',
      )}
    >
      {INITIALS}
    </span>
  )
}

function BackLink({ label }: { label: string }) {
  return (
    <span className="text-primary flex h-11 min-w-0 items-center gap-0.5 rounded-lg pr-2 pl-1 text-base font-medium">
      <ChevronLeftIcon aria-hidden className="size-6 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  )
}

function BackChip({ label }: { label: string }) {
  return (
    <div className="mb-3 flex">
      <span className="bg-muted inline-flex h-9 items-center gap-1 rounded-full pr-3.5 pl-2 text-sm font-medium">
        <ChevronLeftIcon aria-hidden className="size-4" />
        {label}
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Header
 * ------------------------------------------------------------------------- */

interface ShellProps {
  direction: Direction
  page: PageDef
  phone: boolean
  overlay: Overlay
  setOverlay: (overlay: Overlay) => void
  folded: boolean
  setFolded: (folded: boolean) => void
  /** The frame's width, in px. */
  width: number
}

function toggle(
  overlay: Overlay,
  target: Overlay,
  setOverlay: (overlay: Overlay) => void,
) {
  setOverlay(overlay === target ? 'none' : target)
}

/** Page actions in a phone header: one icon, or several behind ⋮. */
function HeaderActions({
  actions,
  onMore,
}: {
  actions: PageAction[]
  onMore: () => void
}) {
  if (actions.length === 0) return null
  if (actions.length === 1) {
    const [only] = actions
    const Icon = only.icon
    return (
      <IconButton
        label={only.label}
        className={only.primary ? 'text-primary' : undefined}
      >
        <Icon />
      </IconButton>
    )
  }
  return (
    <IconButton label="Plus d’actions" onClick={onMore}>
      <EllipsisVerticalIcon />
    </IconButton>
  )
}

function AvatarButton({
  overlay,
  setOverlay,
}: Pick<ShellProps, 'overlay' | 'setOverlay'>) {
  return (
    <IconButton
      label={`Compte, ${OWNER.name}`}
      pressed={overlay === 'account'}
      onClick={() => toggle(overlay, 'account', setOverlay)}
      className="rounded-full"
    >
      <Avatar />
    </IconButton>
  )
}

function PhoneHeader(props: ShellProps) {
  const { direction, page, overlay, setOverlay } = props
  const menu = (
    <IconButton
      label="Ouvrir le menu"
      pressed={overlay === 'menu'}
      onClick={() => toggle(overlay, 'menu', setOverlay)}
      dot={direction === 'avant' ? undefined : REVIEW_COUNT}
    >
      <MenuIcon />
    </IconButton>
  )
  // C: the same header on every page, no back link nor page action.
  const main = page.actions.find((action) => action.primary)
  // Buttons on the right: at 320px the logo drops its name for three.
  const rightCount =
    direction === 'B'
      ? (main ? 1 : 0) + 2
      : direction === 'C'
        ? 2
        : (page.actions.length > 0 ? 1 : 0) + (direction === 'A' ? 1 : 0)
  const left =
    page.back && direction !== 'C' ? (
      <BackLink label={page.back} />
    ) : (
      <Brand compact={props.width < 360 && rightCount >= 3} />
    )

  let right: ReactNode
  if (direction === 'avant' || direction === 'A') {
    right = (
      <>
        <HeaderActions
          actions={page.actions}
          onMore={() => toggle(overlay, 'more', setOverlay)}
        />
        {direction === 'A' && <AvatarButton {...props} />}
      </>
    )
  } else if (direction === 'B') {
    // The page's main action as an icon, the others in the one ⋮.
    right = (
      <>
        {main && (
          <IconButton label={main.label} className="text-primary">
            <main.icon />
          </IconButton>
        )}
        <IconButton
          label="Plus"
          pressed={overlay === 'more'}
          onClick={() => toggle(overlay, 'more', setOverlay)}
        >
          <EllipsisVerticalIcon />
        </IconButton>
        <AvatarButton {...props} />
      </>
    )
  } else {
    right = (
      <>
        <IconButton
          label="Ajouter"
          pressed={overlay === 'add'}
          onClick={() => toggle(overlay, 'add', setOverlay)}
          className="text-primary"
        >
          <PlusIcon />
        </IconButton>
        <AvatarButton {...props} />
      </>
    )
  }

  return (
    <header className="bg-(--header-bg) relative z-20 flex h-12 shrink-0 items-center gap-1 border-b px-2 backdrop-blur-lg">
      {menu}
      {left}
      <div className="ml-auto flex items-center gap-0.5">{right}</div>
    </header>
  )
}

function SearchBox() {
  return (
    <span className="border-input bg-background text-muted-foreground flex h-9 w-[15rem] min-w-0 items-center gap-2 rounded-lg border px-2.5 text-sm">
      <SearchIcon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">Rechercher une opération</span>
    </span>
  )
}

function DesktopHeader(props: ShellProps) {
  const { direction, page, overlay, setOverlay, folded, setFolded } = props
  return (
    <header className="bg-(--header-bg) relative z-20 flex h-12 shrink-0 items-center gap-2 border-b px-3 backdrop-blur-lg">
      <IconButton
        label={folded ? 'Agrandir le menu' : 'Réduire le menu'}
        onClick={() => setFolded(!folded)}
      >
        <MenuIcon />
      </IconButton>
      <Brand />
      {direction !== 'C' && page.back && (
        // The way back on a computer: where the page sits, its parent a link.
        <nav
          aria-label="Fil d’Ariane"
          className="text-muted-foreground ml-3 flex min-w-0 items-center gap-1 border-l pl-4 text-sm"
        >
          <span className="text-primary font-medium">{page.back}</span>
          <ChevronRightIcon aria-hidden className="size-4" />
          <span className="text-foreground truncate font-medium">
            {page.title}
          </span>
        </nav>
      )}
      <div className="ml-auto flex items-center gap-2">
        {direction !== 'C' && <SearchBox />}
        {direction === 'C' ? (
          <Button
            variant="primary"
            iconStart={<PlusIcon />}
            iconEnd={<ChevronDownIcon />}
            aria-expanded={overlay === 'add'}
            onClick={() => toggle(overlay, 'add', setOverlay)}
          >
            Ajouter
          </Button>
        ) : (
          <Button variant="primary" iconStart={<PlusIcon />}>
            Opération
          </Button>
        )}
        {direction === 'B' && (
          <IconButton
            label="Plus"
            pressed={overlay === 'more'}
            onClick={() => toggle(overlay, 'more', setOverlay)}
          >
            <EllipsisVerticalIcon />
          </IconButton>
        )}
        <AvatarButton {...props} />
      </div>
    </header>
  )
}

/* ---------------------------------------------------------------------------
 * Sidebar
 * ------------------------------------------------------------------------- */

function NavRow({
  item,
  active,
  folded,
}: {
  item: NavKey
  active: boolean
  folded: boolean
}) {
  const { label, icon: Icon } = NAV[item]
  return (
    <span
      title={folded ? label : undefined}
      className={cn(
        'relative flex h-8 min-h-8 items-center gap-2 rounded-md px-2 text-sm',
        '[&>svg]:size-[1.1rem] [&>svg]:shrink-0',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
          : 'hover:bg-sidebar-accent/60',
        folded && 'mx-auto size-[52px] justify-center px-0 [&>svg]:size-6',
      )}
    >
      <Icon aria-hidden />
      {!folded && <span className="truncate">{label}</span>}
      {!folded && item === 'transactions' && (
        <span className="bg-primary text-primary-foreground absolute top-1/2 right-1 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full px-1 text-xs font-medium tabular-nums">
          {REVIEW_COUNT}
        </span>
      )}
      {!folded && item === 'owed' && (
        <span className="text-muted-foreground absolute top-1/2 right-2 -translate-y-1/2 text-xs tabular-nums">
          475 €
        </span>
      )}
      {folded && item === 'transactions' && (
        <span className="bg-primary absolute top-2 right-2 size-2 rounded-full" />
      )}
    </span>
  )
}

/** Today's foot: the Réglages entry and « Se déconnecter » (#352, #353). */
function TodayFoot({ folded, phone }: { folded: boolean; phone: boolean }) {
  if (folded) {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="flex size-[52px] items-center justify-center">
          <span className="bg-primary/12 text-primary flex size-[36px] items-center justify-center rounded-[8px]">
            <SettingsIcon className="size-[18px]" />
          </span>
        </span>
        <span className="text-muted-foreground flex size-[52px] items-center justify-center">
          <LogOutIcon className="size-5" />
        </span>
      </div>
    )
  }
  const entry = (
    <span className="flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm">
      <span className="bg-primary/12 text-primary flex size-[32px] shrink-0 items-center justify-center rounded-[8px]">
        <SettingsIcon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block font-medium">Réglages</span>
        <span className="text-muted-foreground block text-xs">
          {OWNER.name}
        </span>
      </span>
      <ChevronRightIcon className="text-muted-foreground size-4" />
    </span>
  )
  if (phone) {
    return (
      <div className="flex items-center gap-1">
        {entry}
        <span className="text-muted-foreground flex size-8 items-center justify-center">
          <LogOutIcon className="size-[1.1rem]" />
        </span>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      {entry}
      <span className="text-muted-foreground flex h-8 items-center gap-2 px-2 text-sm">
        <span className="flex w-[32px] justify-center">
          <LogOutIcon className="size-[18px]" />
        </span>
        Se déconnecter
      </span>
    </div>
  )
}

function SidebarBody({
  direction,
  active,
  folded,
  phone,
}: {
  direction: Direction
  active: NavKey
  folded: boolean
  phone: boolean
}) {
  const { groups, foot } = SIDEBARS[direction]
  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2"
      >
        {groups.map((group, index) => (
          <div key={group.title ?? index} className="space-y-0.5">
            {group.title &&
              (folded ? (
                index > 0 && <hr className="mx-3 my-2" />
              ) : (
                <p className="text-muted-foreground px-2 pt-1 pb-0.5 text-xs font-medium">
                  {group.title}
                </p>
              ))}
            {group.items.map((item) => (
              <NavRow
                key={item}
                item={item}
                active={item === active}
                folded={folded}
              />
            ))}
          </div>
        ))}
      </nav>
      {foot !== 'none' && (
        <div className="border-sidebar-border border-t p-2">
          {foot === 'today' ? (
            <TodayFoot folded={folded} phone={phone} />
          ) : (
            <NavRow
              item="settings"
              active={active === 'settings'}
              folded={folded}
            />
          )}
        </div>
      )}
    </>
  )
}

/** Computer: the column under the header (today: the column holds the brand). */
function DesktopSidebar({
  direction,
  active,
  folded,
}: {
  direction: Direction
  active: NavKey
  folded: boolean
}) {
  return (
    <aside
      className={cn(
        'bg-sidebar text-sidebar-foreground flex shrink-0 flex-col border-r',
        folded ? 'w-[72px]' : 'w-[352px]',
      )}
    >
      {direction === 'avant' && (
        <div className="flex items-center gap-2 p-2">
          <span className="flex min-h-11 flex-1 items-center gap-2 px-2">
            <LogoMark className={folded ? 'size-9' : 'size-7'} />
            {!folded && (
              <span className="font-semibold tracking-tight">Finances</span>
            )}
            {!folded && (
              <ChevronLeftIcon className="text-muted-foreground ml-auto size-[1.1rem]" />
            )}
          </span>
        </div>
      )}
      <SidebarBody
        direction={direction}
        active={active}
        folded={folded}
        phone={false}
      />
    </aside>
  )
}

/** Phone: the ☰ drawer. */
function Drawer({
  direction,
  active,
  onClose,
}: {
  direction: Direction
  active: NavKey
  onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-40">
      <button
        type="button"
        aria-label="Fermer le menu"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <aside className="bg-sidebar text-sidebar-foreground absolute inset-y-0 left-0 flex w-[min(85%,18rem)] flex-col border-r shadow-xl">
        <div className="flex items-center gap-1 border-b p-2">
          <Brand />
          <IconButton label="Fermer" onClick={onClose} className="ml-auto">
            <XIcon />
          </IconButton>
        </div>
        <SidebarBody
          direction={direction}
          active={active}
          folded={false}
          phone
        />
      </aside>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Menus: account card, ⋮, « + »
 * ------------------------------------------------------------------------- */

const MENU_ROW = cn(
  'flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left text-sm',
  'hover:bg-muted/60 [&>svg]:text-muted-foreground [&>svg]:size-[1.1rem] [&>svg]:shrink-0',
)

function Popover({
  phone,
  children,
  label,
  onClose,
  width = '20rem',
}: {
  phone: boolean
  children: ReactNode
  label: string
  onClose: () => void
  width?: string
}) {
  return (
    <div className="absolute inset-0 top-12 z-30">
      <button
        type="button"
        aria-label="Fermer"
        className={cn('absolute inset-0', phone && 'bg-black/30')}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={label}
        style={{ width: phone ? undefined : width }}
        className={cn(
          'bg-popover text-popover-foreground absolute top-2 overflow-hidden rounded-xl border shadow-xl',
          phone ? 'inset-x-2' : 'right-3',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function AccountCard() {
  const [theme, setTheme] = useState('auto')
  return (
    <>
      <div className="flex items-center gap-3 border-b p-4">
        <Avatar size="lg" />
        <div className="min-w-0 leading-tight">
          <p className="font-semibold break-normal">{OWNER.name}</p>
          <p className="text-muted-foreground text-xs">
            camille.dupont@
            <wbr />
            exemple.test
          </p>
        </div>
      </div>
      <div className="space-y-2 border-b p-3">
        <p className="text-muted-foreground text-xs font-medium">Apparence</p>
        <SegmentedControl
          value={theme}
          onValueChange={setTheme}
          aria-label="Apparence"
          fullWidth
        >
          <SegmentedControlItem value="light">Clair</SegmentedControlItem>
          <SegmentedControlItem value="dark">Sombre</SegmentedControlItem>
          <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
        </SegmentedControl>
      </div>
      <div className="p-1.5">
        <span className={MENU_ROW}>
          <SettingsIcon />
          Réglages
          <ChevronRightIcon className="ml-auto" />
        </span>
        <span className={MENU_ROW}>
          <LogOutIcon />
          Se déconnecter
        </span>
      </div>
    </>
  )
}

function MenuSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="border-b p-1.5 last:border-b-0">
      <p className="text-muted-foreground px-2 pt-1 pb-0.5 text-xs font-medium">
        {title}
      </p>
      {children}
    </div>
  )
}

function MenuRow({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className={MENU_ROW}>
      <Icon />
      {label}
    </span>
  )
}

/** Today and A: the page's actions behind ⋮ on a phone. */
function PageActionsMenu({ page }: { page: PageDef }) {
  return (
    <div className="p-1.5">
      {page.actions.map((action) => (
        <MenuRow key={action.label} icon={action.icon} label={action.label} />
      ))}
    </div>
  )
}

/** B: the one ⋮, the page's other actions first on a phone. */
function MoreMenu({ page, phone }: { page: PageDef; phone: boolean }) {
  const others = page.actions.filter((action) => !action.primary)
  const onPage = (label: string) =>
    page.actions.some((action) => action.label === label)
  return (
    <div className="max-h-[calc(100%-1rem)] overflow-y-auto">
      {phone && others.length > 0 && (
        <MenuSection title="Cette page">
          {others.map((action) => (
            <MenuRow
              key={action.label}
              icon={action.icon}
              label={action.label}
            />
          ))}
        </MenuSection>
      )}
      <MenuSection title="Partout">
        {/* What the page already offers is not repeated. */}
        {phone && !onPage('Ajouter une opération') && (
          <MenuRow icon={PlusIcon} label="Ajouter une opération" />
        )}
        {!onPage('Importer un relevé') && (
          <MenuRow icon={UploadIcon} label="Importer un relevé" />
        )}
        {phone && <MenuRow icon={SearchIcon} label="Rechercher" />}
      </MenuSection>
      <MenuSection title="Mois et classement">
        <MenuRow icon={CalendarCheckIcon} label="Revue du mois" />
        <MenuRow icon={TagsIcon} label="Catégories" />
        <MenuRow icon={ListFilterIcon} label="Règles" />
      </MenuSection>
      <MenuSection title="Aide">
        <MenuRow icon={SparklesIcon} label="Claude et accès" />
        <span className={MENU_ROW}>
          <InfoIcon />
          Version 1.42
          <span className="text-muted-foreground ml-auto text-xs">à jour</span>
        </span>
      </MenuSection>
    </div>
  )
}

/** C: « + », what can be added from any page. */
function AddMenu() {
  return (
    <div className="p-1.5">
      <MenuRow icon={PlusIcon} label="Ajouter une opération" />
      <MenuRow icon={HandCoinsIcon} label="Payé pour moi" />
      <MenuRow icon={UploadIcon} label="Importer un relevé" />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Pages (synthetic)
 * ------------------------------------------------------------------------- */

function PageTitle({
  direction,
  page,
  phone,
}: {
  direction: Direction
  page: PageDef
  phone: boolean
}) {
  // Where the way back and the actions are, per direction.
  const chip =
    page.back && (direction === 'C' || (direction === 'avant' && !phone))
  const inPage = direction === 'C' || !phone
  return (
    <div>
      {chip && page.back && <BackChip label={page.back} />}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-[min(100%,14rem)] flex-1 space-y-1">
          <h1
            className={cn(
              'font-semibold tracking-tight',
              phone ? 'text-xl' : 'text-2xl',
            )}
          >
            {page.title}
          </h1>
          {page.description && (
            <p
              className={cn(
                'text-muted-foreground',
                phone ? 'text-xs' : 'text-sm',
              )}
            >
              {page.description}
            </p>
          )}
        </div>
        {inPage &&
          page.actions.length > 0 &&
          (phone ? (
            // C on a phone: the actions as icons at the end of the title.
            <div className="flex shrink-0 items-center gap-0.5">
              {page.actions.slice(0, 2).map((action) => (
                <IconButton
                  key={action.label}
                  label={action.label}
                  className={cn(
                    'border',
                    action.primary &&
                      'bg-primary text-primary-foreground border-primary hover:bg-primary/90',
                  )}
                >
                  <action.icon />
                </IconButton>
              ))}
              {page.actions.length > 2 && (
                <IconButton label="Plus d’actions" className="border">
                  <EllipsisVerticalIcon />
                </IconButton>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {page.actions.map((action) => (
                <Button
                  key={action.label}
                  variant={action.primary ? 'primary' : 'secondary'}
                  outline={!action.primary}
                  iconStart={<action.icon />}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ))}
      </div>
    </div>
  )
}

const CARD = 'bg-card rounded-xl border p-4'

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'good'
}) {
  return (
    <div className="bg-muted/40 rounded-lg p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          'text-lg font-semibold whitespace-nowrap tabular-nums',
          tone === 'good' && 'text-chart-delta-good',
        )}
      >
        {value}
      </p>
    </div>
  )
}

function MonthBar({ search = false }: { search?: boolean }) {
  return (
    <div className="bg-card @container rounded-xl border p-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-11 flex-1 items-center rounded-lg border @[672px]:flex-none">
          <span className="flex size-8 items-center justify-center border-r">
            <ChevronLeftIcon className="size-4" />
          </span>
          <span className="flex-1 px-4 text-center text-sm font-medium whitespace-nowrap">
            <span className="@[420px]:hidden">nov. 2026</span>
            <span className="hidden @[420px]:inline">Novembre 2026</span>
          </span>
          <span className="flex size-8 items-center justify-center border-l">
            <ChevronRightIcon className="size-4" />
          </span>
        </div>
        {search && (
          <span className="border-input text-muted-foreground flex h-11 min-w-0 basis-full items-center gap-2 rounded-lg border px-3 text-sm @[672px]:flex-1 @[672px]:basis-auto">
            <SearchIcon className="size-4 shrink-0" />
            <span className="truncate">Rechercher</span>
          </span>
        )}
      </div>
      {search && (
        // Below 672px the filters fold behind « Filtres » (#264).
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="border-input inline-flex h-9 items-center gap-1 rounded-full border px-3 text-sm @[672px]:hidden">
            <ListFilterIcon className="size-3.5" />
            Filtres
          </span>
          {['Compte', 'Catégorie', 'Type'].map((chip) => (
            <span
              key={chip}
              className="border-input hidden h-9 items-center gap-1 rounded-full border px-3 text-sm @[672px]:inline-flex"
            >
              {chip}
              <ChevronDownIcon className="size-3.5" />
            </span>
          ))}
          <span className="border-primary bg-primary/10 text-primary inline-flex h-9 items-center rounded-full border px-3 text-sm">
            À revoir · {REVIEW_COUNT}
          </span>
        </div>
      )}
    </div>
  )
}

function DashboardBody() {
  return (
    <div className="@container space-y-4">
      <section className={cn(CARD, 'space-y-3')}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">Novembre 2026</h2>
          <span className="bg-muted rounded-full px-2 py-0.5 text-xs">
            En cours
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 @lg:grid-cols-3">
          <Tile label="Revenus" value="3 120 €" />
          <Tile label="Dépenses" value="1 845 €" />
          <Tile label="Épargné" value="1 275 € · 41 %" tone="good" />
        </div>
      </section>
      <section className={cn(CARD, 'space-y-3')}>
        <h2 className="font-semibold">Budget</h2>
        {[
          ['Courses', 'shopping-cart', '#4f9d69', 62],
          ['Restaurants', 'utensils', '#d9822b', 81],
        ].map(([name, icon, color, pct]) => (
          <div key={name} className="flex items-center gap-3">
            <CategoryIcon icon={String(icon)} color={String(color)} />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex justify-between gap-2 text-sm">
                <span>{name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {pct} %
                </span>
              </div>
              <div className="bg-muted h-2 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </section>
      <section className={CARD}>
        <h2 className="font-semibold">Comptes</h2>
        <p className="text-muted-foreground text-xs">Patrimoine à ce jour</p>
        <p className="text-2xl font-semibold tabular-nums">48 260 €</p>
      </section>
    </div>
  )
}

const ROWS = [
  ['Supermarché du coin', 'Courses', 'shopping-cart', '#4f9d69', '−42,80 €'],
  ['Boulangerie', 'Restaurants', 'utensils', '#d9822b', '−6,40 €'],
  ['Salaire', 'Salaire', 'banknote', '#2f7fd8', '+2 450,00 €'],
  ['Abonnement musique', 'Loisirs', 'music', '#9b59b6', '−10,99 €'],
] as const

function OperationsBody() {
  return (
    <div className="space-y-4">
      <MonthBar search />
      <div className="bg-card grid grid-cols-3 divide-x rounded-xl border text-center">
        {[
          ['Revenus', '3 120 €'],
          ['Dépenses', '1 845 €'],
          ['Net', '+1 275 €'],
        ].map(([label, value]) => (
          <div key={label} className="p-2">
            <p className="text-muted-foreground text-xs">{label}</p>
            <p
              className={cn(
                'text-sm font-semibold whitespace-nowrap tabular-nums',
                label === 'Net' && 'text-chart-delta-good',
              )}
            >
              {value}
            </p>
          </div>
        ))}
      </div>
      <div className="bg-card overflow-hidden rounded-xl border">
        <p className="bg-muted/50 text-muted-foreground px-4 py-1.5 text-xs font-medium">
          Jeudi 19 novembre
        </p>
        {ROWS.map(([label, category, icon, color, amount]) => (
          <div
            key={label}
            className="flex items-center gap-3 border-t px-4 py-2"
          >
            <CategoryIcon icon={icon} color={color} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium">{label}</p>
              <p className="text-muted-foreground text-xs">{category}</p>
            </div>
            <span
              className={cn(
                'text-sm whitespace-nowrap tabular-nums',
                amount.startsWith('+') && 'text-chart-delta-good',
              )}
            >
              {amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AccountBody() {
  return (
    <div className="@container space-y-4">
      <section className={cn(CARD, 'space-y-1')}>
        <p className="text-muted-foreground text-xs">Solde</p>
        <p className="text-2xl font-semibold tabular-nums">12 480,35 €</p>
        <p className="text-muted-foreground text-xs">
          À jour au 18 nov. · importé il y a 2 jours
        </p>
      </section>
      <section className={cn(CARD, 'space-y-3')}>
        <h2 className="font-semibold">Novembre</h2>
        <div className="grid grid-cols-1 gap-2 @lg:grid-cols-3">
          <Tile label="Entrées" value="+600 €" />
          <Tile label="Sorties" value="−0 €" />
          <Tile label="Variation" value="+600 €" tone="good" />
        </div>
      </section>
    </div>
  )
}

const SETTINGS_ROWS: { icon: LucideIcon; name: string; state: string }[][] = [
  [
    { icon: UserIcon, name: 'Compte', state: OWNER.name },
    { icon: MonitorSmartphoneIcon, name: 'Apparence', state: 'Auto' },
    { icon: ShieldIcon, name: 'Sécurité', state: '2 passkeys' },
  ],
  [
    { icon: TagsIcon, name: 'Catégories', state: '38 catégories' },
    { icon: ListFilterIcon, name: 'Règles', state: '54 règles' },
    { icon: KeyRoundIcon, name: 'Claude et accès', state: '1 accès actif' },
  ],
  [
    { icon: LogOutIcon, name: 'Se déconnecter', state: '' },
    { icon: TriangleAlertIcon, name: 'Zone dangereuse', state: '' },
  ],
]

function SettingsBody() {
  return (
    <div className="space-y-4">
      {SETTINGS_ROWS.map((group, index) => (
        <div key={index} className="bg-card divide-y rounded-xl border">
          {group.map(({ icon: Icon, name, state }) => (
            <div
              key={name}
              className="flex min-h-11 items-center gap-3 px-3 py-2"
            >
              <span className="bg-primary/12 text-primary flex size-[32px] shrink-0 items-center justify-center rounded-[8px]">
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-sm font-medium">{name}</span>
                {state && (
                  <span className="text-muted-foreground block text-xs">
                    {state}
                  </span>
                )}
              </span>
              <ChevronRightIcon className="text-muted-foreground size-4" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const BODIES: Record<PageKey, () => ReactNode> = {
  dashboard: DashboardBody,
  operations: OperationsBody,
  account: AccountBody,
  settings: SettingsBody,
}

/* ---------------------------------------------------------------------------
 * The frame
 * ------------------------------------------------------------------------- */

function Frame(args: FrameArgs) {
  const { direction } = args
  // URL args arrive as text.
  const width = Number(args.width)
  const phone = width < 768
  const page = PAGES[args.page]
  const [overlay, setOverlay] = useState<Overlay>(args.overlay)
  const [folded, setFolded] = useState(args.folded)
  useEffect(() => setOverlay(args.overlay), [args.overlay])
  useEffect(() => setFolded(args.folded), [args.folded])

  const shell: ShellProps = {
    direction,
    page,
    phone,
    overlay,
    setOverlay,
    folded,
    setFolded,
    width,
  }
  const Body = BODIES[args.page]
  const close = () => setOverlay('none')
  // Today a computer has no header at all.
  const header = phone ? (
    <PhoneHeader {...shell} />
  ) : direction === 'avant' ? null : (
    <DesktopHeader {...shell} />
  )

  let popover: ReactNode = null
  if (overlay === 'account' && direction !== 'avant') {
    popover = (
      <Popover phone={phone} label="Compte" onClose={close}>
        <AccountCard />
      </Popover>
    )
  } else if (overlay === 'more' && direction === 'B') {
    popover = (
      <Popover phone={phone} label="Plus" onClose={close} width="17rem">
        <MoreMenu page={page} phone={phone} />
      </Popover>
    )
  } else if (
    overlay === 'more' &&
    phone &&
    (direction === 'A' || direction === 'avant') &&
    page.actions.length > 1
  ) {
    popover = (
      <Popover phone={phone} label="Plus d’actions" onClose={close}>
        <PageActionsMenu page={page} />
      </Popover>
    )
  } else if (overlay === 'add' && direction === 'C') {
    popover = (
      <Popover phone={phone} label="Ajouter" onClose={close} width="16rem">
        <AddMenu />
      </Popover>
    )
  }

  return (
    <div
      data-frame
      style={{ width, height: phone ? 700 : 820 }}
      className="bg-background text-foreground relative flex flex-col overflow-hidden rounded-xl border shadow-sm"
    >
      {header}
      <div className="flex min-h-0 flex-1">
        {!phone && (
          <DesktopSidebar
            direction={direction}
            active={page.nav}
            folded={folded}
          />
        )}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div
            className={cn(
              'mx-auto w-full max-w-[64rem] space-y-6',
              phone ? 'px-4 py-6' : 'px-6 py-10',
            )}
          >
            <PageTitle direction={direction} page={page} phone={phone} />
            <Body />
          </div>
        </main>
      </div>
      {popover}
      {overlay === 'menu' && phone && (
        <Drawer direction={direction} active={page.nav} onClose={close} />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const Prototype: StoryObj<FrameArgs> = {
  name: 'Cadre',
  args: {
    direction: 'A',
    page: 'operations',
    width: 390,
    overlay: 'none',
    folded: false,
  },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 min-h-screen p-4">
        <Frame {...args} />
      </div>
    </AppScale>
  ),
}

type Place = Record<Direction, string>

/** Where every element goes, per direction (also in the PR). */
const PLACES: { element: string; place: Place }[] = [
  {
    element: 'Navigation',
    place: {
      avant: 'Une liste de 10 pages',
      A: '3 groupes : Suivi (Tableau de bord, Dépenses, Opérations, Budget, Revue du mois), Patrimoine (Comptes, Épargne, Crypto, Entre proches), Outils (Abonnements, Import, Règles, Catégories)',
      B: '2 groupes, les pages de tous les jours : Suivi (… Abonnements), Patrimoine ; le reste dans ⋮',
      C: 'Les 3 groupes de A',
    },
  },
  {
    element: '« À revoir »',
    place: {
      avant: 'Pastille sur Opérations',
      A: 'Pastille sur Opérations, et sur ☰ au téléphone',
      B: 'Comme A',
      C: 'Comme A',
    },
  },
  {
    element: 'Compte (qui est connecté)',
    place: {
      avant: 'Pied du menu (Réglages + nom)',
      A: 'Avatar dans l’en-tête → carte : nom, e-mail',
      B: 'Comme A',
      C: 'Comme A',
    },
  },
  {
    element: 'Réglages',
    place: {
      avant: 'Pied du menu',
      A: 'Pied du menu et carte du compte',
      B: 'Comme A ; Catégories, Règles, Claude et accès aussi dans ⋮',
      C: 'Carte du compte seulement',
    },
  },
  {
    element: 'Apparence',
    place: {
      avant: 'Réglages',
      A: 'Carte du compte (Clair · Sombre · Auto) et Réglages',
      B: 'Comme A',
      C: 'Comme A',
    },
  },
  {
    element: 'Se déconnecter',
    place: {
      avant: 'Pied du menu et Réglages',
      A: 'Carte du compte (téléphone : « Se déconnecter ? » d’abord) et Réglages',
      B: 'Comme A',
      C: 'Comme A',
    },
  },
  {
    element: 'Actions de la page, téléphone',
    place: {
      avant: 'Barre du haut (une icône, ou ⋮ si plusieurs)',
      A: 'En-tête, comme aujourd’hui',
      B: 'En-tête : l’action principale en icône, les autres dans ⋮ « Cette page »',
      C: 'Dans la page, au bout du titre',
    },
  },
  {
    element: 'Actions de la page, ordinateur',
    place: {
      avant: 'À côté du titre',
      A: 'À côté du titre',
      B: 'À côté du titre',
      C: 'À côté du titre',
    },
  },
  {
    element: 'Retour (« ‹ Comptes »)',
    place: {
      avant:
        'Téléphone : barre du haut ; ordinateur : pastille au-dessus du titre',
      A: 'Téléphone : en-tête ; ordinateur : fil « Comptes › Livret A » dans l’en-tête',
      B: 'Comme A',
      C: 'Pastille au-dessus du titre, partout',
    },
  },
  {
    element: 'Titre de la page, navigateur de mois',
    place: {
      avant: 'Dans la page ; mois dans MonthToolbar',
      A: 'Inchangés',
      B: 'Inchangés',
      C: 'Inchangés',
    },
  },
  {
    element: 'Ajout rapide',
    place: {
      avant: 'Actions des pages, enveloppes du tableau de bord',
      A: 'Ordinateur : « + Opération » dans l’en-tête',
      B: 'Ordinateur : « + Opération » ; téléphone : ⋮',
      C: '« + » dans l’en-tête partout : opération, payé pour moi, relevé',
    },
  },
  {
    element: 'Recherche',
    place: {
      avant: 'Opérations seulement',
      A: 'Ordinateur : champ dans l’en-tête (ouvre Opérations)',
      B: 'Ordinateur : champ ; téléphone : ⋮ « Rechercher »',
      C: 'Opérations seulement',
    },
  },
  {
    element: 'Replier le menu (ordinateur)',
    place: {
      avant: 'En-tête du menu, Cmd/Ctrl+B',
      A: '☰ de l’en-tête, Cmd/Ctrl+B',
      B: 'Comme A',
      C: 'Comme A',
    },
  },
  {
    element: 'Chargement, nouvelle version, hors ligne',
    place: {
      avant: 'Barre fine en haut, toast, page « Hors ligne »',
      A: 'Barre fine sous l’en-tête ; toast et page inchangés',
      B: 'Comme A',
      C: 'Comme A',
    },
  },
]

const DIRECTIONS: { key: Direction; label: string }[] = [
  { key: 'avant', label: 'Avant' },
  { key: 'A', label: 'A. Comme Azure DevOps' },
  { key: 'B', label: 'B. A avec ⋮' },
  { key: 'C', label: 'C. En-tête fixe' },
]

export const Places: StoryObj = {
  name: 'Où va chaque élément',
  render: () => (
    <AppScale>
      <div className="bg-background text-foreground min-h-screen p-6">
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 font-medium">Élément</th>
                {DIRECTIONS.map(({ key, label }) => (
                  <th key={key} className="p-2 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLACES.map(({ element, place }) => (
                <tr key={element} className="border-t align-top">
                  <th className="p-2 font-medium">{element}</th>
                  {DIRECTIONS.map(({ key }) => (
                    <td key={key} className="text-muted-foreground p-2 text-xs">
                      {place[key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground mt-3 flex items-center gap-1 text-xs">
          <CircleHelpIcon className="size-4" />
          Données fictives ; rien n’est enregistré.
        </p>
      </div>
    </AppScale>
  ),
}
