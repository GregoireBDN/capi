import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  CategoryIcon,
  SegmentedControl,
  SegmentedControlItem,
  Switch,
  cn,
} from '@finances/ui'
import {
  BitcoinIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarIcon,
  CalendarRangeIcon,
  ChartPieIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  ClockIcon,
  EllipsisVerticalIcon,
  HandCoinsIcon,
  HourglassIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MenuIcon,
  PiggyBankIcon,
  RepeatIcon,
  SearchIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  TargetIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

/**
 * Prototypes of the month navigation (#401): one way to move between months
 * on every month page, on the phone and on a computer. Clickable mockups with
 * synthetic figures, not app code.
 *
 * Avant: today. Five pages put the navigator ‹ | mois | › in a card with
 *   « Filtres » and the period note (`MonthToolbar`, #263); the dashboard puts
 *   it in the review card's header beside the status (#321).
 * A. Le mois en titre: the month is the page's big title (« Novembre 2026 ⌄ »
 *   opens the picker), ‹ › at the end of its line, the page's name above it
 *   in small, the period note under it. No box, no card.
 * B. Barre du mois: on the phone, a bar glued under the app header, in its
 *   colours, that stays on screen while the page scrolls (‹ · month · › ·
 *   Filtres). On a computer the month sits in the app header itself.
 * C. Bande de mois: the months as a row of pills under the title, the one
 *   shown filled, swiped sideways; 📅 opens the picker for older years.
 *
 * Common to A, B and C: swipe the page sideways to change month on a phone,
 * ← / → on a keyboard, the picker (a bottom sheet on the phone, a popover on
 * a computer) with the months that have data, « Mois en cours », « Dernières
 * données » and « Toutes les dates » on Opérations; filters behind
 * « Filtres » on phones, as chips on a computer; `?month=` unchanged.
 */
const meta: Meta<FrameArgs> = {
  title: 'Prototypes/Navigation entre les mois (#401)',
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
      options: ['spending', 'dashboard', 'operations'],
    },
    width: { control: 'inline-radio', options: [320, 390, 1280] },
    overlay: {
      control: 'inline-radio',
      options: ['none', 'picker', 'filters'],
    },
    scrolled: { control: 'boolean' },
    month: {
      control: 'inline-radio',
      options: ['2026-11', '2026-10', '2026-06', 'all'],
    },
  },
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic months and figures
 * ------------------------------------------------------------------------- */

type Direction = 'avant' | 'A' | 'B' | 'C'
type PageKey = 'spending' | 'dashboard' | 'operations'
type Overlay = 'none' | 'picker' | 'filters'

interface FrameArgs {
  direction: Direction
  page: PageKey
  width: number
  overlay: Overlay
  /** The page scrolled down (shows what stays on screen). */
  scrolled: boolean
  /** `YYYY-MM`, or `all` (Opérations only). */
  month: string
}

const CURRENT = '2026-11'
const FIRST_DATA = '2025-09'
/** The bank data stops on the 10th of the current month. */
const DATA_UNTIL_DAY = 10

function shift(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number]
  const index = y * 12 + (m - 1) + delta
  const year = Math.floor(index / 12)
  return `${year}-${String((index % 12) + 1).padStart(2, '0')}`
}

const MONTHS_WITH_DATA = (() => {
  const months: string[] = []
  for (let m = FIRST_DATA; m <= CURRENT; m = shift(m, 1)) months.push(m)
  return new Set(months)
})()

const longMonth = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const shortMonth = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const abbreviation = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  timeZone: 'UTC',
})

const asDate = (month: string) => new Date(`${month}-01T00:00:00Z`)
const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)
/** "Novembre 2026" */
const formatMonth = (month: string) =>
  capitalize(longMonth.format(asDate(month)))
/** "nov. 2026" */
const formatShort = (month: string) => shortMonth.format(asDate(month))
/** "nov." */
const formatAbbr = (month: string) => abbreviation.format(asDate(month))

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
const wholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const fmt = (cents: number) => euros.format(cents / 100)
const fmt0 = (cents: number) => wholeEuros.format(Math.round(cents / 100))

/** A stable pseudo-random number per month, so figures move with it. */
function seed(month: string, salt: number): number {
  let h = salt * 2654435761
  for (const c of month) h = (h ^ c.charCodeAt(0)) * 16777619
  return Math.abs(h % 1000) / 1000
}

function periodNote(month: string, compared: boolean): string | null {
  if (month !== CURRENT) return null
  return compared
    ? `Mois en cours : données jusqu’au ${DATA_UNTIL_DAY} nov., comparées au 1–${DATA_UNTIL_DAY} oct.`
    : `Mois en cours : données jusqu’au ${DATA_UNTIL_DAY} nov.`
}

interface MonthStatus {
  label: string
  icon: LucideIcon
  className: string
}

function monthStatus(month: string): MonthStatus {
  if (month === CURRENT)
    return {
      label: 'En cours',
      icon: HourglassIcon,
      className: 'bg-info/15 text-info-foreground dark:text-info',
    }
  if (month === shift(CURRENT, -1))
    return {
      label: 'À clôturer',
      icon: ClockIcon,
      className: 'bg-warning/20 text-warning-foreground dark:text-warning',
    }
  return {
    label: 'Clôturé',
    icon: CircleCheckIcon,
    className: 'bg-success/15 text-success-foreground dark:text-success',
  }
}

const PAGES: Record<
  PageKey,
  { title: string; description: string; nav: NavKey; compared: boolean }
> = {
  spending: {
    title: 'Dépenses',
    description: 'Où part votre argent, catégorie par catégorie.',
    nav: 'spending',
    compared: true,
  },
  dashboard: {
    title: 'Tableau de bord',
    description: 'Votre patrimoine et le bilan du mois.',
    nav: 'dashboard',
    compared: false,
  },
  operations: {
    title: 'Opérations',
    description: 'Filtrez, recherchez et corrigez vos opérations.',
    nav: 'spending',
    compared: true,
  },
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

/** A 44px square ghost button (`size-8` at the 22px root). */
const ICON_BUTTON = cn(
  'relative flex size-8 shrink-0 items-center justify-center rounded-lg outline-none',
  'hover:bg-muted/70 focus-visible:ring-ring/50 focus-visible:ring-[3px]',
  'disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[1.1rem]',
)

function IconButton({
  label,
  onClick,
  disabled,
  children,
  className,
  badge,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
  badge?: number
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(ICON_BUTTON, className)}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold">
          {badge}
        </span>
      )}
    </button>
  )
}

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
        'bg-card text-card-foreground rounded-xl border shadow-xs',
        className,
      )}
    >
      {children}
    </div>
  )
}

function Note({ text, className }: { text: string; className?: string }) {
  return (
    <p
      className={cn(
        'text-muted-foreground flex items-start gap-1.5 text-xs',
        className,
      )}
    >
      <CalendarClockIcon aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>{text}</span>
    </p>
  )
}

function StatusBadge({
  month,
  compact,
}: {
  month: string
  /** The icon alone (its word as the accessible name). */
  compact?: boolean
}) {
  const status = monthStatus(month)
  const Icon = status.icon
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full text-sm font-medium',
        compact ? 'size-8 justify-center' : 'h-8 px-3',
        status.className,
      )}
      title={status.label}
    >
      <Icon aria-hidden className="size-4" />
      <span className={compact ? 'sr-only' : undefined}>{status.label}</span>
    </span>
  )
}

/**
 * The month's name: the long one (« Novembre 2026 ») in containers from
 * `wideAt` px, else « Nov. 2026 ».
 */
function MonthName({
  month,
  wideAt = 340,
}: {
  month: string
  wideAt?: 340 | 420
}) {
  return (
    <>
      <span
        className={cn(
          'hidden',
          wideAt === 340 ? '@[340px]:inline' : '@[420px]:inline',
        )}
      >
        {formatMonth(month)}
      </span>
      <span className={wideAt === 340 ? '@[340px]:hidden' : '@[420px]:hidden'}>
        {capitalize(formatShort(month))}
      </span>
    </>
  )
}

/** "Novembre" */
const monthOnly = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  timeZone: 'UTC',
})

/* ---------------------------------------------------------------------------
 * Navigation state shared by every direction
 * ------------------------------------------------------------------------- */

interface Nav {
  month: string
  all: boolean
  canNext: boolean
  previous: () => void
  next: () => void
  select: (month: string) => void
  selectAll: (() => void) | undefined
  openPicker: () => void
  openFilters: () => void
  activeFilters: number
}

/* ---------------------------------------------------------------------------
 * The picker (shared): a year of months, those with data marked, shortcuts
 * ------------------------------------------------------------------------- */

function MonthPicker({ nav, onClose }: { nav: Nav; onClose: () => void }) {
  const [year, setYear] = useState(Number(nav.month.slice(0, 4)))
  const maxYear = Number(CURRENT.slice(0, 4))
  const minYear = Number(FIRST_DATA.slice(0, 4))
  const pick = (month: string) => {
    nav.select(month)
    onClose()
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <IconButton
          label="Année précédente"
          disabled={year <= minYear}
          onClick={() => setYear(year - 1)}
        >
          <ChevronLeftIcon />
        </IconButton>
        <p className="text-base font-semibold">{year}</p>
        <IconButton
          label="Année suivante"
          disabled={year >= maxYear}
          onClick={() => setYear(year + 1)}
        >
          <ChevronRightIcon />
        </IconButton>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {Array.from({ length: 12 }, (_, i) => {
          const value = `${year}-${String(i + 1).padStart(2, '0')}`
          const selected = !nav.all && value === nav.month
          const data = MONTHS_WITH_DATA.has(value)
          return (
            <button
              key={value}
              type="button"
              disabled={value > CURRENT}
              onClick={() => pick(value)}
              className={cn(
                'flex min-h-8 flex-col items-center justify-center rounded-md text-sm capitalize disabled:opacity-35',
                selected
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : data
                    ? 'hover:bg-muted font-medium'
                    : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {formatAbbr(value)}
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 size-1 rounded-full',
                  data
                    ? selected
                      ? 'bg-primary-foreground'
                      : 'bg-primary'
                    : 'bg-transparent',
                )}
              />
            </button>
          )
        })}
      </div>
      <div className="grid gap-1.5 border-t pt-2.5">
        <button
          type="button"
          onClick={() => pick(CURRENT)}
          className="hover:bg-muted flex min-h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
        >
          <CalendarIcon aria-hidden className="size-4" /> Mois en cours
        </button>
        {nav.selectAll && (
          <button
            type="button"
            onClick={() => {
              nav.selectAll?.()
              onClose()
            }}
            className={cn(
              'flex min-h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium',
              nav.all
                ? 'border-primary bg-primary/10 text-primary'
                : 'hover:bg-muted',
            )}
          >
            <CalendarRangeIcon aria-hidden className="size-4" /> Toutes les
            dates
          </button>
        )}
      </div>
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <span aria-hidden className="bg-primary size-1 rounded-full" />
        Mois avec des opérations
      </p>
    </div>
  )
}

/** Phone: a bottom sheet over the frame. Computer: a popover at `anchor`. */
function Overlay({
  phone,
  title,
  onClose,
  anchor,
  children,
}: {
  phone: boolean
  title: string
  onClose: () => void
  anchor?: string
  children: ReactNode
}) {
  return (
    <div className="absolute inset-0 z-40">
      <button
        type="button"
        aria-label="Fermer"
        onClick={onClose}
        className={cn('absolute inset-0', phone && 'bg-black/40')}
      />
      <div
        role="dialog"
        aria-label={title}
        className={cn(
          'bg-popover text-popover-foreground absolute border shadow-lg',
          phone
            ? 'inset-x-0 bottom-0 rounded-t-xl px-4 pt-3 pb-6'
            : 'w-[15rem] rounded-xl p-3',
        )}
        style={phone ? undefined : { top: '7rem', left: anchor ?? '15rem' }}
      >
        {phone && (
          <div className="mb-2 flex items-center justify-between">
            <p className="text-base font-semibold">{title}</p>
            <IconButton label="Fermer" onClick={onClose}>
              <XIcon />
            </IconButton>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

function FilterSheetBody({ page }: { page: PageKey }) {
  const [average, setAverage] = useState('6')
  return (
    <div className="space-y-4 text-sm">
      <label className="grid gap-1.5">
        <span className="font-medium">Compte</span>
        <span className="flex min-h-8 items-center justify-between rounded-lg border px-3">
          Tous les comptes <ChevronDownIcon aria-hidden className="size-4" />
        </span>
      </label>
      {page === 'spending' ? (
        <div className="grid gap-1.5">
          <span className="font-medium">Moyenne sur</span>
          <SegmentedControl
            fullWidth
            aria-label="Moyenne sur"
            value={average}
            onValueChange={setAverage}
          >
            <SegmentedControlItem value="3">3 mois</SegmentedControlItem>
            <SegmentedControlItem value="6">6 mois</SegmentedControlItem>
            <SegmentedControlItem value="12">12 mois</SegmentedControlItem>
          </SegmentedControl>
        </div>
      ) : (
        <label className="grid gap-1.5">
          <span className="font-medium">Catégorie</span>
          <span className="flex min-h-8 items-center justify-between rounded-lg border px-3">
            Toutes <ChevronDownIcon aria-hidden className="size-4" />
          </span>
        </label>
      )}
      <label className="flex min-h-8 items-center justify-between gap-3">
        <span className="font-medium">Ponctuelles seulement</span>
        <Switch />
      </label>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Avant: today's navigator (`PeriodStepper` in `MonthToolbar`)
 * ------------------------------------------------------------------------- */

function Stepper({ nav, className }: { nav: Nav; className?: string }) {
  return (
    <div
      className={cn(
        'bg-card flex min-w-0 items-stretch rounded-lg border shadow-xs',
        className,
      )}
    >
      <IconButton
        label="Mois précédent"
        onClick={nav.previous}
        disabled={nav.all}
        className="rounded-none rounded-s-lg"
      >
        <ChevronLeftIcon />
      </IconButton>
      <button
        type="button"
        onClick={nav.openPicker}
        className="hover:bg-muted/70 min-w-0 grow border-x px-2.5 text-base font-semibold whitespace-nowrap"
      >
        {nav.all ? 'Toutes les dates' : <MonthName month={nav.month} />}
      </button>
      <IconButton
        label="Mois suivant"
        onClick={nav.next}
        disabled={!nav.canNext}
        className="rounded-none rounded-e-lg"
      >
        <ChevronRightIcon />
      </IconButton>
    </div>
  )
}

function FiltersSquare({ nav }: { nav: Nav }) {
  return (
    <IconButton
      label="Filtres"
      onClick={nav.openFilters}
      badge={nav.activeFilters}
      className="border-border/80 border"
    >
      <SlidersHorizontalIcon />
    </IconButton>
  )
}

function SearchField({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'bg-card text-muted-foreground flex min-h-8 min-w-0 items-center gap-2 rounded-lg border px-3 text-base',
        className,
      )}
    >
      <SearchIcon aria-hidden className="size-4 shrink-0" />
      <span className="truncate">Rechercher un libellé…</span>
    </div>
  )
}

function FilterChips() {
  return (
    <div className="flex flex-wrap gap-2">
      {['Compte', 'Catégorie', 'Type'].map((label) => (
        <span
          key={label}
          className="flex min-h-8 items-center gap-1 rounded-full border border-dashed px-3 text-sm"
        >
          {label} <ChevronDownIcon aria-hidden className="size-3.5" />
        </span>
      ))}
      <span className="flex min-h-8 items-center rounded-full border border-dashed px-3 text-sm">
        À revoir
      </span>
    </div>
  )
}

function SpendingChips() {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="flex min-h-8 items-center gap-1 rounded-full border border-dashed px-3 text-sm">
        Compte <ChevronDownIcon aria-hidden className="size-3.5" />
      </span>
      <span className="flex min-h-8 items-center gap-1 rounded-full border px-3 text-sm">
        Moyenne : 6 mois <ChevronDownIcon aria-hidden className="size-3.5" />
      </span>
      <span className="flex min-h-8 items-center rounded-full border border-dashed px-3 text-sm">
        Ponctuelles
      </span>
    </div>
  )
}

function BeforeToolbar({
  nav,
  page,
  phone,
}: {
  nav: Nav
  page: PageKey
  phone: boolean
}) {
  const note = nav.all ? null : periodNote(nav.month, PAGES[page].compared)
  if (page === 'dashboard') return null
  return (
    <Card className="@container space-y-2 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Stepper nav={nav} className={phone ? 'flex-1' : 'w-fit flex-none'} />
        {page === 'operations' && (
          <SearchField className={phone ? 'order-last basis-full' : 'flex-1'} />
        )}
        {phone ? (
          <FiltersSquare nav={nav} />
        ) : (
          page === 'spending' && (
            <div className="ml-auto">
              <SpendingChips />
            </div>
          )
        )}
      </div>
      {!phone && page === 'operations' && <FilterChips />}
      {note && <Note text={note} className="border-t px-1 pt-2" />}
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * A. Le mois en titre
 * ------------------------------------------------------------------------- */

function TitleMonth({
  nav,
  page,
  phone,
}: {
  nav: Nav
  page: PageKey
  phone: boolean
}) {
  const note = nav.all ? null : periodNote(nav.month, PAGES[page].compared)
  return (
    <header className="@container space-y-1">
      {/* The page's name, small: the month is what changes. */}
      <div className="flex min-h-8 items-center gap-2">
        <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {PAGES[page].title}
          {!nav.all && ` · ${nav.month.slice(0, 4)}`}
        </p>
        {page === 'dashboard' && !nav.all && (
          <StatusBadge month={nav.month} compact={phone} />
        )}
        {page === 'spending' &&
          (phone ? <FiltersPill nav={nav} /> : <SpendingChips />)}
      </div>
      <div className="flex items-center gap-1">
        <h1 className="min-w-0 flex-1">
          <button
            type="button"
            onClick={nav.openPicker}
            aria-label={`${nav.all ? 'Toutes les dates' : formatMonth(nav.month)}, choisir un mois`}
            className="hover:bg-muted/60 -ml-1 flex min-h-8 max-w-full items-center gap-0.5 rounded-lg px-1 text-left text-[1.3rem] font-semibold tracking-tight whitespace-nowrap @[340px]:text-2xl @[600px]:text-[1.75rem]"
          >
            <span className="truncate">
              {nav.all ? (
                <span className="text-xl">Toutes les dates</span>
              ) : (
                capitalize(monthOnly.format(asDate(nav.month)))
              )}
            </span>
            {/* Under 340px (320px phones) the name needs the room. */}
            <ChevronDownIcon
              aria-hidden
              className="text-muted-foreground hidden size-5 shrink-0 @[340px]:block"
            />
          </button>
        </h1>
        <IconButton
          label="Mois précédent"
          onClick={nav.previous}
          disabled={nav.all}
        >
          <ChevronLeftIcon />
        </IconButton>
        <IconButton
          label="Mois suivant"
          onClick={nav.next}
          disabled={!nav.canNext}
        >
          <ChevronRightIcon />
        </IconButton>
      </div>
      {note && <Note text={note} />}
    </header>
  )
}

/** « Filtres » as a pill sized to its label (phones). */
function FiltersPill({ nav }: { nav: Nav }) {
  return (
    <button
      type="button"
      onClick={nav.openFilters}
      className="hover:bg-muted relative flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-sm font-medium"
    >
      <SlidersHorizontalIcon aria-hidden className="size-4" />
      Filtres
      {nav.activeFilters > 0 && (
        <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs">
          {nav.activeFilters}
        </span>
      )}
    </button>
  )
}

/* ---------------------------------------------------------------------------
 * B. Barre du mois
 * ------------------------------------------------------------------------- */

/** Phone: glued under the app header, in its colours, sticky. */
function MonthBar({ nav }: { nav: Nav }) {
  return (
    <div className="@container sticky top-0 z-10 flex h-12 items-center gap-1 border-b bg-(--header-bg) px-2 backdrop-blur-lg">
      <IconButton
        label="Mois précédent"
        onClick={nav.previous}
        disabled={nav.all}
      >
        <ChevronLeftIcon />
      </IconButton>
      <button
        type="button"
        onClick={nav.openPicker}
        className="hover:bg-muted/60 flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-base font-semibold whitespace-nowrap"
      >
        <span className="truncate">
          {nav.all ? (
            'Toutes les dates'
          ) : (
            <MonthName month={nav.month} wideAt={420} />
          )}
        </span>
        <ChevronDownIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </button>
      <IconButton
        label="Mois suivant"
        onClick={nav.next}
        disabled={!nav.canNext}
      >
        <ChevronRightIcon />
      </IconButton>
    </div>
  )
}

/** Computer: in the app header, between the logo and ⋮. */
function HeaderMonth({ nav }: { nav: Nav }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton
        label="Mois précédent"
        onClick={nav.previous}
        disabled={nav.all}
      >
        <ChevronLeftIcon />
      </IconButton>
      <button
        type="button"
        onClick={nav.openPicker}
        className="hover:bg-muted/60 flex min-h-8 min-w-[10rem] items-center justify-center gap-1 rounded-lg px-2 text-base font-semibold whitespace-nowrap"
      >
        {nav.all ? 'Toutes les dates' : formatMonth(nav.month)}
        <ChevronDownIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </button>
      <IconButton
        label="Mois suivant"
        onClick={nav.next}
        disabled={!nav.canNext}
      >
        <ChevronRightIcon />
      </IconButton>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * C. Bande de mois
 * ------------------------------------------------------------------------- */

function MonthStrip({
  nav,
  page,
  phone,
}: {
  nav: Nav
  page: PageKey
  phone: boolean
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const months = [...MONTHS_WITH_DATA]
  // Keep the month shown in view, centred.
  useEffect(() => {
    // After the 22px root is applied (`AppScale`).
    const frame = requestAnimationFrame(() => {
      const box = scroller.current
      const pill = box?.querySelector<HTMLElement>('[aria-current="true"]')
      if (!box || !pill) return
      box.scrollTo({
        left: pill.offsetLeft - box.clientWidth / 2 + pill.clientWidth / 2,
        behavior: 'smooth',
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [nav.month, nav.all])
  const note = nav.all ? null : periodNote(nav.month, PAGES[page].compared)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {!phone && (
          <IconButton
            label="Mois précédent"
            onClick={nav.previous}
            disabled={nav.all}
          >
            <ChevronLeftIcon />
          </IconButton>
        )}
        <div
          ref={scroller}
          role="tablist"
          aria-label="Mois"
          className="relative flex min-w-0 flex-1 snap-x items-center gap-1 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,black_1.25rem,black_calc(100%-1.25rem),transparent)] px-3"
        >
          {nav.selectAll && (
            <Pill selected={nav.all} onClick={nav.selectAll}>
              Toutes
            </Pill>
          )}
          {months.map((month) => (
            <span key={month} className="flex shrink-0 items-center gap-1">
              {month.endsWith('-01') && (
                <span className="text-muted-foreground px-1 text-xs font-semibold">
                  {month.slice(0, 4)}
                </span>
              )}
              <Pill
                selected={!nav.all && month === nav.month}
                onClick={() => nav.select(month)}
              >
                {formatAbbr(month)}
                {month === CURRENT && (
                  <span className="sr-only"> (mois en cours)</span>
                )}
              </Pill>
            </span>
          ))}
        </div>
        {!phone && (
          <IconButton
            label="Mois suivant"
            onClick={nav.next}
            disabled={!nav.canNext}
          >
            <ChevronRightIcon />
          </IconButton>
        )}
        <IconButton label="Choisir un mois" onClick={nav.openPicker}>
          <CalendarIcon />
        </IconButton>
      </div>
      {note && <Note text={note} />}
      {!phone && page === 'spending' && <SpendingChips />}
    </div>
  )
}

function Pill({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-current={selected ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-h-8 shrink-0 snap-center items-center rounded-full px-3 text-sm font-medium whitespace-nowrap capitalize',
        selected
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground/80 hover:bg-muted',
      )}
    >
      {children}
    </button>
  )
}

/* ---------------------------------------------------------------------------
 * Page bodies (synthetic)
 * ------------------------------------------------------------------------- */

const CATEGORIES = [
  { name: 'Courses', icon: 'shopping-cart', color: '#16a34a', share: 0.34 },
  { name: 'Logement', icon: 'house', color: '#2563eb', share: 0.27 },
  { name: 'Restaurants', icon: 'utensils', color: '#ea580c', share: 0.16 },
  { name: 'Transports', icon: 'train-front', color: '#7c3aed', share: 0.13 },
  { name: 'Loisirs', icon: 'ticket', color: '#db2777', share: 0.1 },
]

function spentCents(month: string): number {
  const full = 140000 + Math.round(seed(month, 1) * 60000)
  return month === CURRENT ? Math.round(full * 0.36) : full
}

function SpendingBody({ month, all }: { month: string; all: boolean }) {
  if (all) return null
  const spent = spentCents(month)
  const previous = spentCents(shift(month, -1)) * (month === CURRENT ? 0.36 : 1)
  const delta = spent - previous
  return (
    <div className="space-y-4">
      <div className="@container grid gap-3 @[36rem]:grid-cols-2">
        <Card className="p-4">
          <p className="text-muted-foreground text-sm">Dépensé</p>
          <p className="text-[1.6rem] font-semibold tabular-nums">
            {fmt(spent)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-muted-foreground text-sm">
            Écart avec le mois d’avant
          </p>
          <p
            className={cn(
              'text-[1.6rem] font-semibold tabular-nums',
              delta <= 0 ? 'text-chart-delta-good' : 'text-chart-delta-bad',
            )}
          >
            {delta > 0 ? '+' : ''}
            {fmt(delta)}
          </p>
        </Card>
      </div>
      <Card className="divide-y">
        {CATEGORIES.map((category) => (
          <div
            key={category.name}
            className="flex items-center gap-3 px-4 py-3"
          >
            <CategoryIcon icon={category.icon} color={category.color} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{category.name}</p>
              <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${category.share * 250}%`,
                    maxWidth: '100%',
                    backgroundColor: category.color,
                  }}
                />
              </div>
            </div>
            <p className="text-sm font-medium whitespace-nowrap tabular-nums">
              {fmt(Math.round(spent * category.share))}
            </p>
          </div>
        ))}
      </Card>
    </div>
  )
}

function DashboardBody({
  month,
  before,
  nav,
}: {
  month: string
  before: boolean
  nav: Nav
}) {
  const income = month === CURRENT ? 68900 : 300000 + seed(month, 3) * 40000
  const expenses = spentCents(month) + 7800
  const saved = income - expenses
  return (
    <div className="space-y-4">
      <Card className="@container">
        {before && (
          <div className="flex items-center gap-2 p-4 pb-0">
            <Stepper nav={nav} className="flex-auto" />
            <StatusBadge month={month} compact />
          </div>
        )}
        <div className="space-y-4 p-4">
          {before && periodNote(month, false) && (
            <Note text={periodNote(month, false) ?? ''} />
          )}
          <div className="grid gap-2 @[36rem]:grid-cols-3">
            {[
              ['Revenus', income],
              ['Dépenses', expenses],
              ['Épargné', saved],
            ].map(([label, value]) => (
              <div key={label} className="bg-muted/60 rounded-lg p-3">
                <p className="text-muted-foreground text-sm">{label}</p>
                <p
                  className={cn(
                    'text-xl font-semibold tabular-nums',
                    Number(value) < 0 && 'text-destructive',
                  )}
                >
                  {fmt0(Number(value))}
                </p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Budget</p>
            <div className="bg-muted relative h-2.5 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{
                  width: `${Math.min(100, (expenses / 222500) * 100)}%`,
                }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {fmt0(expenses)} sur 2 225 € · reste{' '}
              {fmt0(Math.max(0, 222500 - expenses))}
            </p>
          </div>
        </div>
      </Card>
      <Card className="space-y-2 p-4">
        <p className="font-semibold">Comptes</p>
        <p className="text-muted-foreground text-xs">Patrimoine à ce jour</p>
        <p className="text-xl font-semibold tabular-nums">48 312 €</p>
      </Card>
    </div>
  )
}

const ROWS = [
  {
    label: 'Carrefour Market',
    icon: 'shopping-cart',
    color: '#16a34a',
    cents: -4237,
  },
  {
    label: 'SNCF Connect',
    icon: 'train-front',
    color: '#7c3aed',
    cents: -2900,
  },
  {
    label: 'Boulangerie du coin',
    icon: 'utensils',
    color: '#ea580c',
    cents: -680,
  },
  {
    label: 'Virement Livret A',
    icon: 'arrow-left-right',
    color: '#64748b',
    cents: -20000,
  },
  { label: 'Cinéma', icon: 'ticket', color: '#db2777', cents: -1150 },
]

function OperationsBody({
  month,
  all,
  phone,
  direction,
}: {
  month: string
  all: boolean
  phone: boolean
  direction: Direction
}) {
  const days = all ? ['10 nov.', '8 nov.', '29 oct.'] : dayLabels(month)
  return (
    <div className="space-y-3">
      {direction !== 'avant' && (
        <div className="flex items-center gap-2">
          <SearchField className="flex-1" />
          {phone && (
            <IconButton label="Filtres" className="border-border/80 border">
              <SlidersHorizontalIcon />
            </IconButton>
          )}
        </div>
      )}
      {direction !== 'avant' && !phone && <FilterChips />}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-sm">
        <span>
          Revenus <b className="tabular-nums">{fmt(68900)}</b>
        </span>
        <span>
          Dépenses <b className="tabular-nums">{fmt(spentCents(month))}</b>
        </span>
      </div>
      <Card className="overflow-clip">
        {days.map((day, d) => (
          <div key={day}>
            <p className="bg-muted/60 text-muted-foreground px-4 py-1.5 text-xs font-semibold">
              {day}
            </p>
            {ROWS.slice(d, d + 2).map((row) => (
              <div
                key={row.label}
                className="flex items-center gap-3 border-t px-4 py-2.5 first:border-t-0"
              >
                <CategoryIcon icon={row.icon} color={row.color} />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.label}
                </p>
                <p className="text-sm font-medium whitespace-nowrap tabular-nums">
                  {fmt(row.cents)}
                </p>
              </div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  )
}

function dayLabels(month: string): string[] {
  const abbr = formatAbbr(month)
  return month === CURRENT
    ? [`10 ${abbr}`, `8 ${abbr}`, `5 ${abbr}`]
    : [`28 ${abbr}`, `21 ${abbr}`, `14 ${abbr}`]
}

/* ---------------------------------------------------------------------------
 * Frame
 * ------------------------------------------------------------------------- */

/** Swipe sideways on the page to change month (phones). */
function useSwipe(onPrevious: () => void, onNext: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return {
    onPointerDown: (event: ReactPointerEvent) => {
      start.current = { x: event.clientX, y: event.clientY }
    },
    onPointerUp: (event: ReactPointerEvent) => {
      const from = start.current
      start.current = null
      if (!from) return
      const dx = event.clientX - from.x
      const dy = event.clientY - from.y
      if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return
      if (dx > 0) onPrevious()
      else onNext()
    },
  }
}

function PhoneHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-(--header-bg) px-2 backdrop-blur-lg">
      <IconButton label="Ouvrir le menu" badge={7}>
        <MenuIcon />
      </IconButton>
      <span className="flex items-center gap-2 px-1 font-semibold tracking-tight">
        <span className="from-primary size-6 rounded-md bg-gradient-to-br to-sky-400" />
        Finances
      </span>
      <span className="ml-auto flex items-center gap-1">
        <IconButton label="Actions de la page">
          <EllipsisVerticalIcon />
        </IconButton>
        <Avatar />
      </span>
    </header>
  )
}

function Avatar() {
  return (
    <span className="bg-primary text-primary-foreground ml-1 flex size-7 items-center justify-center rounded-full text-xs font-semibold">
      CD
    </span>
  )
}

function DesktopHeader({ center }: { center?: ReactNode }) {
  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b bg-(--header-bg) px-3">
      <span className="flex items-center gap-2 px-1 font-semibold tracking-tight">
        <span className="from-primary size-6 rounded-md bg-gradient-to-br to-sky-400" />
        Finances
      </span>
      <span>{center}</span>
      <span className="flex items-center justify-end gap-2">
        <IconButton label="Actions de la page">
          <EllipsisVerticalIcon />
        </IconButton>
        <Avatar />
      </span>
    </header>
  )
}

function DesktopSidebar({ active }: { active: NavKey }) {
  return (
    <nav className="bg-sidebar w-[12rem] shrink-0 space-y-3 overflow-y-auto border-r p-2 text-sm">
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
      <span className="flex min-h-8 items-center gap-2 rounded-lg border-t px-2 pt-2">
        <SettingsIcon aria-hidden className="size-4" /> Réglages
      </span>
    </nav>
  )
}

function Frame(args: FrameArgs) {
  const { direction, page } = args
  const width = Number(args.width)
  const phone = width < 768
  const operations = page === 'operations'
  const [month, setMonth] = useState(
    args.month === 'all' ? CURRENT : args.month,
  )
  const [all, setAll] = useState(args.month === 'all' && operations)
  const [overlay, setOverlay] = useState<Overlay>(args.overlay)
  const main = useRef<HTMLElement>(null)
  useEffect(() => setOverlay(args.overlay), [args.overlay])
  useEffect(() => {
    setMonth(args.month === 'all' ? CURRENT : args.month)
    setAll(args.month === 'all' && operations)
  }, [args.month, operations])
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (main.current) main.current.scrollTop = args.scrolled ? 320 : 0
    })
    return () => cancelAnimationFrame(frame)
  }, [args.scrolled, direction, page, width])

  const nav: Nav = {
    month,
    all,
    canNext: !all && month < CURRENT,
    previous: () => {
      if (!all) setMonth(shift(month, -1))
    },
    next: () => {
      if (!all && month < CURRENT) setMonth(shift(month, 1))
    },
    select: (target) => {
      setAll(false)
      setMonth(target)
    },
    selectAll: operations ? () => setAll(true) : undefined,
    openPicker: () => setOverlay('picker'),
    openFilters: () => setOverlay('filters'),
    activeFilters: 0,
  }

  // ← / → move the month, as in the app.
  const latest = useRef(nav)
  latest.current = nav
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select')) return
      if (event.key === 'ArrowLeft') latest.current.previous()
      if (event.key === 'ArrowRight') latest.current.next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const swipe = useSwipe(nav.previous, nav.next)
  const close = () => setOverlay('none')
  const info = PAGES[page]
  const note = all ? null : periodNote(month, info.compared)

  let top: ReactNode
  if (direction === 'avant') {
    top = (
      <>
        <PageTitle title={info.title} description={info.description} />
        <BeforeToolbar nav={nav} page={page} phone={phone} />
      </>
    )
  } else if (direction === 'A') {
    top = <TitleMonth nav={nav} page={page} phone={phone} />
  } else if (direction === 'B') {
    top = (
      <>
        <PageTitle
          title={info.title}
          description={note ? undefined : phone ? undefined : info.description}
          end={
            page === 'dashboard' && !all ? (
              <StatusBadge month={month} compact={phone} />
            ) : phone && page === 'spending' ? (
              <FiltersPill nav={nav} />
            ) : undefined
          }
        />
        {note && <Note text={note} />}
        {!phone && page === 'spending' && <SpendingChips />}
      </>
    )
  } else {
    top = (
      <>
        <PageTitle
          title={info.title}
          end={
            page === 'dashboard' && !all ? (
              <StatusBadge month={month} compact={phone} />
            ) : phone && page === 'spending' ? (
              <FiltersPill nav={nav} />
            ) : undefined
          }
        />
        <MonthStrip nav={nav} page={page} phone={phone} />
      </>
    )
  }

  const body =
    page === 'spending' ? (
      <SpendingBody month={month} all={all} />
    ) : page === 'dashboard' ? (
      <DashboardBody month={month} before={direction === 'avant'} nav={nav} />
    ) : (
      <OperationsBody
        month={month}
        all={all}
        phone={phone}
        direction={direction}
      />
    )

  return (
    <div
      data-frame
      style={{ width, height: phone ? 700 : 760 }}
      className="bg-background text-foreground relative flex shrink-0 flex-col overflow-hidden rounded-xl border shadow-sm"
    >
      {phone ? (
        <PhoneHeader />
      ) : (
        <DesktopHeader
          center={direction === 'B' ? <HeaderMonth nav={nav} /> : undefined}
        />
      )}
      <div className="flex min-h-0 flex-1">
        {!phone && <DesktopSidebar active={info.nav} />}
        <main
          ref={main}
          className={cn(
            '@container min-w-0 flex-1 overflow-y-auto',
            // Phones show no scrollbar beside the page.
            phone && '[scrollbar-width:none]',
          )}
          {...(phone && direction !== 'avant' ? swipe : {})}
        >
          {phone && direction === 'B' && <MonthBar nav={nav} />}
          <div
            className={cn(
              'mx-auto w-full max-w-[64rem]',
              phone ? 'space-y-5 px-4 py-5' : 'space-y-6 px-6 py-8',
            )}
          >
            <div className="space-y-3">{top}</div>
            {body}
          </div>
        </main>
      </div>
      {overlay === 'picker' && (
        <Overlay
          phone={phone}
          title="Choisir un mois"
          onClose={close}
          anchor={direction === 'B' ? `${width / 22 / 2 - 7.5}rem` : undefined}
        >
          <MonthPicker nav={nav} onClose={close} />
        </Overlay>
      )}
      {overlay === 'filters' && phone && (
        <Overlay phone title="Filtres" onClose={close}>
          <FilterSheetBody page={page} />
        </Overlay>
      )}
    </div>
  )
}

function PageTitle({
  title,
  description,
  end,
}: {
  title: string
  description?: string
  /** At the end of the title's row (the month's status, « Filtres »). */
  end?: ReactNode
}) {
  return (
    <header className="space-y-1">
      {/* What sits at its end goes below the title when both don't fit. */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-[1_0_auto] text-xl font-semibold tracking-tight whitespace-nowrap @[600px]:text-2xl">
          {title}
        </h1>
        {end}
      </div>
      {description && (
        <p className="text-muted-foreground text-xs @[600px]:text-sm">
          {description}
        </p>
      )}
    </header>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const Prototype: StoryObj<FrameArgs> = {
  name: 'Une page',
  args: {
    direction: 'A',
    page: 'spending',
    width: 390,
    overlay: 'none',
    scrolled: false,
    month: CURRENT,
  },
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
  args: {
    direction: 'A',
    page: 'spending',
    width: 390,
    overlay: 'none',
    scrolled: false,
    month: CURRENT,
  },
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

const LABELS: Record<Direction, string> = {
  avant: 'Avant',
  A: 'A. Le mois en titre',
  B: 'B. Barre du mois',
  C: 'C. Bande de mois',
}
