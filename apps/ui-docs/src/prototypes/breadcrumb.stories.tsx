import type { Meta, StoryObj } from '@storybook/react-vite'
import { PeriodBar, PeriodBarLabel, cn } from '@finances/ui'
import {
  BitcoinIcon,
  CalendarCheckIcon,
  ChartPieIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  FingerprintIcon,
  HandCoinsIcon,
  KeyRoundIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MenuIcon,
  MonitorSmartphoneIcon,
  PiggyBankIcon,
  RepeatIcon,
  SettingsIcon,
  ShoppingCartIcon,
  TargetIcon,
  TrainFrontIcon,
  UploadIcon,
  UtensilsIcon,
  WalletIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

/**
 * Prototypes of the way back from a sub-page (#404): a breadcrumb instead of
 * the lone « ‹ Comptes » link of the header. Clickable-looking mockups with
 * synthetic data, not app code.
 *
 * Avant: today (#386). « ‹ Comptes » in the header, after the logo on a
 *   computer, in place of the logo on a phone; the page's title below.
 * A. En-tête, ‹ sur téléphone: on a computer the header shows the trail
 *   « Comptes › Compte courant » after the logo (the parent a link, the
 *   page as text); on a phone « ‹ Comptes » stays as today, the title just
 *   below saying where you are. The page's title is unchanged.
 * B. En-tête partout: the trail on every width; on a phone it takes the
 *   logo's place, the parent whole, the page cut with … when it doesn't fit.
 * C. Au-dessus du titre: the header is the same on every page (logo, ⋮,
 *   avatar); the trail opens the page, « Comptes › » small above the big
 *   title, which is its last step: the page is named once.
 *
 * Common: `<nav aria-label="Fil d'Ariane">` with an ordered list, the
 * separators `aria-hidden`, the current page `aria-current="page"`, the
 * parent link 44px high; the parent returns where it did (#324, `?month=`).
 */
const meta: Meta<FrameArgs> = {
  title: 'Prototypes/Fil d’Ariane (#404)',
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
      options: ['account', 'accountLong', 'operations', 'settings', 'contact'],
    },
    width: { control: 'inline-radio', options: [320, 390, 1280] },
  },
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic pages
 * ------------------------------------------------------------------------- */

type Direction = 'avant' | 'A' | 'B' | 'C'
type PageKey = 'account' | 'accountLong' | 'operations' | 'settings' | 'contact'

interface FrameArgs {
  direction: Direction
  page: PageKey
  width: number
}

type NavKey =
  | 'dashboard'
  | 'spending'
  | 'budget'
  | 'review'
  | 'accounts'
  | 'savings'
  | 'crypto'
  | 'owed'
  | 'subscriptions'
  | 'import'
  | 'settings'

interface PageInfo {
  parent: string
  title: string
  description?: string
  nav: NavKey
  /** The page has a « ⋮ » of actions. */
  actions: boolean
  /** A month page: the month bar under the header (#401). */
  month: boolean
}

const PAGES: Record<PageKey, PageInfo> = {
  account: {
    parent: 'Comptes',
    title: 'Compte courant',
    description: 'CIC',
    nav: 'accounts',
    actions: true,
    month: false,
  },
  accountLong: {
    parent: 'Épargne',
    title: 'Assurance vie Linxea Spirit 2',
    description: 'Spirica',
    nav: 'savings',
    actions: true,
    month: false,
  },
  operations: {
    parent: 'Dépenses',
    title: 'Opérations',
    nav: 'spending',
    actions: true,
    month: true,
  },
  settings: {
    parent: 'Réglages',
    title: 'Sécurité',
    nav: 'settings',
    actions: false,
    month: false,
  },
  contact: {
    parent: 'Entre proches',
    title: 'Camille',
    nav: 'owed',
    actions: true,
    month: false,
  },
}

const NAV: { title: string; items: [NavKey, string, LucideIcon][] }[] = [
  {
    title: 'Suivi',
    items: [
      ['dashboard', 'Tableau de bord', LayoutDashboardIcon],
      ['spending', 'Dépenses', ChartPieIcon],
      ['budget', 'Budget', TargetIcon],
      ['review', 'Revue du mois', CalendarCheckIcon],
    ],
  },
  {
    title: 'Patrimoine',
    items: [
      ['accounts', 'Comptes', LandmarkIcon],
      ['savings', 'Épargne', PiggyBankIcon],
      ['crypto', 'Crypto', BitcoinIcon],
      ['owed', 'Entre proches', HandCoinsIcon],
    ],
  },
  {
    title: 'Outils',
    items: [
      ['subscriptions', 'Abonnements', RepeatIcon],
      ['import', 'Import', UploadIcon],
    ],
  },
]

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

/** A 44px square button (`size-8` at the 22px root). */
function IconButton({
  label,
  children,
  filled,
}: {
  label: string
  children: ReactNode
  filled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center rounded-lg outline-none [&_svg]:size-[1.1rem]',
        'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        filled ? 'bg-secondary hover:bg-secondary/80' : 'hover:bg-muted/70',
      )}
    >
      {children}
    </button>
  )
}

function Avatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center">
      <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-full text-xs font-semibold">
        CD
      </span>
    </span>
  )
}

function Logo({ name = true }: { name?: boolean }) {
  return (
    <span className="flex h-8 shrink-0 items-center gap-2 rounded-lg px-1 font-semibold tracking-tight">
      <span className="from-primary size-6 rounded-md bg-gradient-to-br to-sky-400" />
      {name && 'Finances'}
    </span>
  )
}

/** Today's way back: « ‹ Comptes » (`PageBack`). */
function BackLink({ label }: { label: string }) {
  return (
    <a
      href="#back"
      onClick={(event) => event.preventDefault()}
      className="text-primary hover:bg-muted/60 focus-visible:ring-ring/50 flex h-8 min-w-0 items-center gap-0.5 rounded-lg pr-2 pl-1 text-base font-medium outline-none focus-visible:ring-[3px]"
    >
      <ChevronLeftIcon aria-hidden className="size-6 shrink-0" />
      <span className="truncate">{label}</span>
    </a>
  )
}

/**
 * The trail in the header (A on a computer, B everywhere): the parent a
 * link, `›`, the page as text cut with … The parent never shrinks.
 */
function HeaderTrail({ info, phone }: { info: PageInfo; phone: boolean }) {
  return (
    <nav aria-label="Fil d’Ariane" className="flex min-w-0">
      <ol
        className={cn(
          'flex min-w-0 items-center',
          phone ? 'text-sm' : 'text-base',
        )}
      >
        <li className="flex shrink-0 items-center">
          <a
            href="#back"
            onClick={(event) => event.preventDefault()}
            className={cn(
              'text-primary hover:bg-muted/60 focus-visible:ring-ring/50 flex h-8 items-center rounded-lg font-medium outline-none focus-visible:ring-[3px]',
              phone ? 'px-1' : 'px-2',
            )}
          >
            {info.parent}
          </a>
        </li>
        <li aria-hidden className="text-muted-foreground flex shrink-0">
          <ChevronRightIcon className="size-4" />
        </li>
        <li className="flex min-w-0 items-center">
          <span
            aria-current="page"
            className="text-foreground truncate px-1 font-medium"
          >
            {info.title}
          </span>
        </li>
      </ol>
    </nav>
  )
}

/**
 * C: the trail above the page's title, which is its last step. The parent
 * small, as a link, then the title as today.
 */
function TitleTrail({ info, phone }: { info: PageInfo; phone: boolean }) {
  return (
    <nav aria-label="Fil d’Ariane">
      <ol className="space-y-0">
        <li className="-ml-1 flex">
          <a
            href="#back"
            onClick={(event) => event.preventDefault()}
            className="text-primary hover:bg-muted/60 focus-visible:ring-ring/50 -my-1.5 flex h-8 items-center gap-0.5 rounded-lg px-1 text-sm font-medium outline-none focus-visible:ring-[3px]"
          >
            {phone && <ChevronLeftIcon aria-hidden className="size-4" />}
            {info.parent}
            {!phone && (
              <ChevronRightIcon
                aria-hidden
                className="text-muted-foreground size-4"
              />
            )}
          </a>
        </li>
        <li aria-current="page">
          <h1 className="text-xl font-semibold tracking-tight break-words @[600px]:text-2xl">
            {info.title}
          </h1>
        </li>
      </ol>
    </nav>
  )
}

/* ---------------------------------------------------------------------------
 * Header and sidebar
 * ------------------------------------------------------------------------- */

function Header({
  direction,
  info,
  phone,
}: {
  direction: Direction
  info: PageInfo
  phone: boolean
}) {
  let start: ReactNode
  if (phone) {
    start =
      direction === 'avant' || direction === 'A' ? (
        <BackLink label={info.parent} />
      ) : direction === 'B' ? (
        <HeaderTrail info={info} phone />
      ) : (
        <Logo />
      )
  } else {
    start = (
      <>
        <Logo />
        {direction !== 'C' && (
          <span className="ml-1 flex min-w-0 items-center border-l pl-2">
            {direction === 'avant' ? (
              <BackLink label={info.parent} />
            ) : (
              <HeaderTrail info={info} phone={false} />
            )}
          </span>
        )}
      </>
    )
  }
  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center border-b bg-(--header-bg) backdrop-blur-lg',
        phone ? 'gap-1 px-2' : 'gap-2 px-3',
      )}
    >
      {phone && (
        <IconButton label="Ouvrir le menu">
          <MenuIcon />
        </IconButton>
      )}
      {start}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {info.actions && (
          <IconButton label="Actions de la page" filled>
            <EllipsisVerticalIcon />
          </IconButton>
        )}
        <Avatar />
      </span>
    </header>
  )
}

function Sidebar({ active }: { active: NavKey }) {
  return (
    <nav className="bg-sidebar flex w-[12rem] shrink-0 flex-col overflow-y-auto border-r p-2 text-sm">
      <div className="flex-1 space-y-3">
        {NAV.map((group) => (
          <div key={group.title} className="space-y-0.5">
            <p className="text-muted-foreground px-2 py-1 text-xs">
              {group.title}
            </p>
            {group.items.map(([key, label, Icon]) => (
              <span
                key={key}
                className={cn(
                  'flex min-h-8 items-center gap-2 rounded-lg px-2',
                  key === active && 'bg-primary/10 text-primary font-medium',
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </span>
            ))}
          </div>
        ))}
      </div>
      <span
        className={cn(
          'flex min-h-8 items-center gap-2 rounded-lg px-2',
          active === 'settings' && 'bg-primary/10 text-primary font-medium',
        )}
      >
        <SettingsIcon aria-hidden className="size-4" /> Réglages
      </span>
    </nav>
  )
}

function MonthBar() {
  return (
    <div className="@container sticky top-0 z-10 flex h-12 items-center border-b bg-(--header-bg) px-2 backdrop-blur-lg">
      <PeriodBar
        aria-label="Mois"
        className="w-full"
        previous={{ label: 'Mois précédent', onClick: () => {} }}
        next={{ label: 'Mois suivant', onClick: () => {}, disabled: true }}
      >
        <PeriodBarLabel
          aria-label="Novembre 2026, choisir un mois"
          text="Novembre 2026"
          shortText="nov. 2026"
        />
      </PeriodBar>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Page bodies (synthetic)
 * ------------------------------------------------------------------------- */

function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-card text-card-foreground rounded-xl border p-4 shadow-xs',
        className,
      )}
    >
      {children}
    </div>
  )
}

const ROWS: [string, string, string, LucideIcon, string][] = [
  ['Carrefour Market', 'Courses', '−54,20 €', ShoppingCartIcon, '#16a34a'],
  ['SNCF Connect', 'Transports', '−39,00 €', TrainFrontIcon, '#2563eb'],
  ['Le Petit Zinc', 'Restaurants', '−28,50 €', UtensilsIcon, '#ea580c'],
  ['Salaire Exemple SA', 'Salaire', '+2 450,00 €', WalletIcon, '#059669'],
  ['Monoprix', 'Courses', '−17,85 €', ShoppingCartIcon, '#16a34a'],
]

function Rows({ count = 5 }: { count?: number }) {
  return (
    <ul className="divide-y">
      {ROWS.slice(0, count).map(([label, category, amount, Icon, color]) => (
        <li
          key={label}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${color}24`, color }}
          >
            <Icon aria-hidden className="size-4" />
          </span>
          <span className="min-w-[7rem] flex-1">
            <span className="block truncate text-sm font-medium">{label}</span>
            <span className="text-muted-foreground block text-xs">
              {category}
            </span>
          </span>
          <span
            className={cn(
              'ml-auto text-sm font-medium whitespace-nowrap',
              amount.startsWith('+') && 'text-success',
            )}
          >
            {amount}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Body({ page }: { page: PageKey }) {
  if (page === 'account' || page === 'accountLong') {
    const invest = page === 'accountLong'
    return (
      <>
        <Card className="space-y-1">
          <p className="text-muted-foreground text-xs">
            {invest ? 'Valeur' : 'Solde'}
          </p>
          <p className="text-2xl font-semibold tracking-tight">
            {invest ? '18 412,36 €' : '2 184,52 €'}
          </p>
          <p className="text-muted-foreground text-xs">
            {invest
              ? 'Au 31 oct. 2026 · +412,08 € depuis le 30 sept.'
              : 'À jour au 10 nov. · importé il y a 2 jours'}
          </p>
        </Card>
        <Card>
          <p className="mb-1 font-semibold">
            {invest ? 'Virements liés' : 'Dernières opérations'}
          </p>
          <Rows count={invest ? 2 : 5} />
        </Card>
      </>
    )
  }
  if (page === 'operations') {
    return (
      <>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Revenus', '+2 450 €'],
            ['Dépenses', '−1 386 €'],
            ['Net', '+1 064 €'],
          ].map(([label, value]) => (
            <Card key={label} className="px-2 py-2">
              <p className="text-muted-foreground text-xs">{label}</p>
              <p className="text-sm font-semibold whitespace-nowrap">{value}</p>
            </Card>
          ))}
        </div>
        <Card className="py-2">
          <p className="text-muted-foreground border-b pb-2 text-xs">
            18 opérations · les plus récentes
          </p>
          <Rows />
        </Card>
      </>
    )
  }
  if (page === 'settings') {
    return (
      <>
        {[
          [KeyRoundIcon, 'Mot de passe', 'Modifié il y a 3 mois'],
          [FingerprintIcon, 'Passkeys', '2 passkeys'],
          [MonitorSmartphoneIcon, 'Sessions', 'Safari · iPhone, et 1 autre'],
        ].map(([Icon, title, detail]) => {
          const I = Icon as LucideIcon
          return (
            <Card key={title as string} className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
                <I aria-hidden className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{title as string}</span>
                <span className="text-muted-foreground block text-xs">
                  {detail as string}
                </span>
              </span>
              <ChevronRightIcon className="text-muted-foreground size-4" />
            </Card>
          )
        })}
      </>
    )
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2">
        <Card>
          <p className="text-muted-foreground text-xs">Il vous doit</p>
          <p className="text-xl font-semibold">475,00 €</p>
        </Card>
        <Card>
          <p className="text-muted-foreground text-xs">Vous lui devez</p>
          <p className="text-xl font-semibold">30,00 €</p>
        </Card>
      </div>
      <Card>
        <p className="mb-1 font-semibold">À rembourser</p>
        <Rows count={3} />
      </Card>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * Frame
 * ------------------------------------------------------------------------- */

function Frame({ direction, page, width: rawWidth }: FrameArgs) {
  const width = Number(rawWidth)
  const phone = width < 768
  const info = PAGES[page]

  const title =
    direction === 'C' ? (
      <TitleTrail info={info} phone={phone} />
    ) : (
      <h1 className="text-xl font-semibold tracking-tight break-words @[600px]:text-2xl">
        {info.title}
      </h1>
    )

  return (
    <div
      data-frame
      style={{ width, height: phone ? 640 : 680 }}
      className="bg-background text-foreground relative flex shrink-0 flex-col overflow-hidden rounded-xl border shadow-sm"
    >
      <Header direction={direction} info={info} phone={phone} />
      <div className="flex min-h-0 flex-1">
        {!phone && <Sidebar active={info.nav} />}
        <main
          className={cn(
            '@container min-w-0 flex-1 overflow-y-auto',
            phone && '[scrollbar-width:none]',
          )}
        >
          {info.month && <MonthBar />}
          <div
            className={cn(
              'mx-auto w-full max-w-[64rem]',
              phone ? 'space-y-4 px-4 py-5' : 'space-y-5 px-6 py-8',
            )}
          >
            <header className="space-y-1">
              {title}
              {info.description && (
                <p className="text-muted-foreground text-xs @[600px]:text-sm">
                  {info.description}
                </p>
              )}
            </header>
            <Body page={page} />
          </div>
        </main>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

const LABELS: Record<Direction, string> = {
  avant: 'Avant',
  A: 'A. En-tête, ‹ sur téléphone',
  B: 'B. En-tête partout',
  C: 'C. Au-dessus du titre',
}

export const Prototype: StoryObj<FrameArgs> = {
  name: 'Une page',
  args: { direction: 'A', page: 'account', width: 390 },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 min-h-screen p-4">
        <Frame {...args} />
      </div>
    </AppScale>
  ),
}

/** Avant, A, B and C side by side, on one page and one width. */
export const SideBySide: StoryObj<FrameArgs> = {
  name: 'Côte à côte',
  args: { direction: 'A', page: 'account', width: 390 },
  argTypes: { direction: { table: { disable: true } } },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 flex min-h-screen flex-wrap gap-4 p-4">
        {(['avant', 'A', 'B', 'C'] as const).map((direction) => (
          <div key={direction} className="space-y-1.5">
            <p className="text-sm font-semibold">{LABELS[direction]}</p>
            <Frame {...args} direction={direction} />
          </div>
        ))}
      </div>
    </AppScale>
  ),
}

/** One direction on every page, at one width. */
export const EveryPage: StoryObj<FrameArgs> = {
  name: 'Toutes les pages',
  args: { direction: 'A', page: 'account', width: 390 },
  argTypes: { page: { table: { disable: true } } },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 flex min-h-screen flex-wrap gap-4 p-4">
        {(Object.keys(PAGES) as PageKey[]).map((page) => (
          <div key={page} className="space-y-1.5">
            <p className="text-sm font-semibold">
              {PAGES[page].parent} › {PAGES[page].title}
            </p>
            <Frame {...args} page={page} />
          </div>
        ))}
      </div>
    </AppScale>
  ),
}
