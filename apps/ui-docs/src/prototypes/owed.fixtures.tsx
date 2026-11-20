/**
 * Synthetic data and pieces shared by the #359 prototypes (sharing an
 * expense, money owed to the owner). Not app code: this file goes with the
 * prototypes once the owner chooses.
 */
import { Button, CategoryIcon, cn, formatEuros } from '@finances/ui'
import { ChevronLeftIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

/* ---------------------------------------------------------------------------
 * Synthetic data (today: 20 Nov 2026)
 * ------------------------------------------------------------------------- */

export const TODAY = '2026-11-20'

export const CATEGORIES = {
  rent: { name: 'Loyer', icon: 'house', color: '#dc2626' },
  energy: { name: 'Énergie', icon: 'zap', color: '#ea580c' },
  groceries: { name: 'Courses', icon: 'shopping-cart', color: '#d97706' },
  restaurants: { name: 'Restaurants', icon: 'utensils', color: '#e11d48' },
  leisure: { name: 'Sorties', icon: 'ticket', color: '#0891b2' },
  transport: { name: 'Transports', icon: 'bus', color: '#0284c7' },
  refunds: { name: 'Remboursements', icon: 'undo-2', color: '#059669' },
} as const

export type CategoryKey = keyof typeof CATEGORIES

export interface Contact {
  id: string
  name: string
  color: string
}

export const CONTACTS: Contact[] = [
  { id: 'camille', name: 'Camille', color: '#db2777' },
  { id: 'sam', name: 'Sam', color: '#059669' },
  { id: 'julie', name: 'Julie', color: '#d97706' },
  { id: 'alex', name: 'Alex', color: '#2563eb' },
]

export const contactOf = (id: string) =>
  CONTACTS.find((contact) => contact.id === id) ?? {
    id,
    name: id,
    color: '#64748b',
  }

export type OwedState = 'open' | 'repaid' | 'forgiven'

/** What one person owes on one expense (a receivable). */
export interface OwedItem {
  id: string
  contactId: string
  label: string
  category: CategoryKey
  /** The expense's day, `YYYY-MM-DD`. */
  date: string
  /** What the owner paid. */
  expenseCents: number
  /** What this person owes on it. */
  owedCents: number
  /** Linked repayments (or « réglé autrement »). */
  receivedCents: number
  state: OwedState
  /** Day it was repaid or let go. */
  closedOn?: string
  /** From a shared recurring item. */
  recurring?: boolean
  note?: string
}

export const ITEMS: OwedItem[] = [
  // Open, oldest first.
  {
    id: 's1',
    contactId: 'sam',
    label: 'Concert',
    category: 'leisure',
    date: '2026-10-12',
    expenseCents: 13_500,
    owedCents: 4_500,
    receivedCents: 0,
    state: 'open',
  },
  {
    id: 'c1',
    contactId: 'camille',
    label: 'Loyer',
    category: 'rent',
    date: '2026-11-01',
    expenseCents: 80_000,
    owedCents: 40_000,
    receivedCents: 30_000,
    state: 'open',
    recurring: true,
  },
  {
    id: 'j1',
    contactId: 'julie',
    label: 'Billets de train',
    category: 'transport',
    date: '2026-11-02',
    expenseCents: 12_800,
    owedCents: 6_400,
    receivedCents: 0,
    state: 'open',
  },
  {
    id: 'c2',
    contactId: 'camille',
    label: 'EDF',
    category: 'energy',
    date: '2026-11-05',
    expenseCents: 12_000,
    owedCents: 6_000,
    receivedCents: 0,
    state: 'open',
    recurring: true,
  },
  {
    id: 's2',
    contactId: 'sam',
    label: 'Le Comptoir',
    category: 'restaurants',
    date: '2026-11-08',
    expenseCents: 9_000,
    owedCents: 3_000,
    receivedCents: 0,
    state: 'open',
  },
  {
    id: 'c3',
    contactId: 'camille',
    label: 'Courses Monoprix',
    category: 'groceries',
    date: '2026-11-14',
    expenseCents: 8_640,
    owedCents: 4_320,
    receivedCents: 0,
    state: 'open',
  },
  // Closed: kept in the history.
  {
    id: 'a1',
    contactId: 'alex',
    label: 'Le Comptoir',
    category: 'restaurants',
    date: '2026-11-08',
    expenseCents: 9_000,
    owedCents: 3_000,
    receivedCents: 3_000,
    state: 'repaid',
    closedOn: '2026-11-12',
  },
  {
    id: 'c5',
    contactId: 'camille',
    label: 'EDF',
    category: 'energy',
    date: '2026-10-05',
    expenseCents: 12_000,
    owedCents: 6_000,
    receivedCents: 6_000,
    state: 'repaid',
    closedOn: '2026-10-09',
    recurring: true,
  },
  {
    id: 'c4',
    contactId: 'camille',
    label: 'Loyer',
    category: 'rent',
    date: '2026-10-01',
    expenseCents: 80_000,
    owedCents: 40_000,
    receivedCents: 40_000,
    state: 'repaid',
    closedOn: '2026-10-09',
    recurring: true,
  },
  {
    id: 's3',
    contactId: 'sam',
    label: 'Cinéma',
    category: 'leisure',
    date: '2026-09-20',
    expenseCents: 2_400,
    owedCents: 1_200,
    receivedCents: 0,
    state: 'forgiven',
    closedOn: '2026-10-25',
    note: 'Tant pis',
  },
]

export const leftOf = (item: OwedItem) => item.owedCents - item.receivedCents

export const openItems = (contactId?: string) =>
  ITEMS.filter(
    (item) =>
      item.state === 'open' && (!contactId || item.contactId === contactId),
  )

export const closedItems = (contactId: string) =>
  ITEMS.filter(
    (item) => item.state !== 'open' && item.contactId === contactId,
  ).sort((a, b) => (b.closedOn ?? '').localeCompare(a.closedOn ?? ''))

export const owedBy = (contactId: string) =>
  openItems(contactId).reduce((sum, item) => sum + leftOf(item), 0)

/** 342,20 €: what is owed now, all contacts. */
export const TOTAL_OWED_CENTS = openItems().reduce(
  (sum, item) => sum + leftOf(item),
  0,
)

/** Contacts who owe something, the most owed first. */
export const DEBTORS = CONTACTS.filter(
  (contact) => owedBy(contact.id) > 0,
).sort((a, b) => owedBy(b.id) - owedBy(a.id))

/** All-time totals for a contact: advanced, repaid, let go. */
export function totalsOf(contactId: string) {
  const items = ITEMS.filter((item) => item.contactId === contactId)
  return {
    advancedCents: items.reduce((sum, item) => sum + item.owedCents, 0),
    repaidCents: items.reduce((sum, item) => sum + item.receivedCents, 0),
    forgivenCents: items
      .filter((item) => item.state === 'forgiven')
      .reduce((sum, item) => sum + item.owedCents - item.receivedCents, 0),
  }
}

/** Camille's shared recurring items, what to expect in November. */
export const EXPECTED = {
  contactId: 'camille',
  month: 'novembre',
  items: [
    { label: 'Loyer', category: 'rent' as CategoryKey, cents: 40_000 },
    { label: 'EDF', category: 'energy' as CategoryKey, cents: 6_000 },
  ],
  totalCents: 46_000,
  receivedCents: 30_000,
}

/** The incoming transfer of the repayment flow. */
export const TRANSFER = {
  label: 'VIR SEPA CAMILLE M',
  display: 'Virement de Camille',
  date: '2026-11-19',
  amountCents: 17_000,
  /** Guessed from the contact's bank labels. */
  guessedContactId: 'camille',
}

/** The expense of the « Partager » screen. */
export const EXPENSE = {
  label: 'Pizzeria Da Marco',
  category: 'restaurants' as CategoryKey,
  date: '2026-11-18',
  amountCents: 9_500,
}

/* ---------------------------------------------------------------------------
 * Money and dates
 * ------------------------------------------------------------------------- */

export const euros = (cents: number) => formatEuros(cents)

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
/** `2026-11-05` → « 5 nov. », never through a time zone. */
export const day = (date: string) =>
  dayFormat.format(new Date(`${date}T00:00:00Z`))

/** Whole days from `date` to today (calendar dates, UTC). */
export const ageInDays = (date: string) =>
  Math.round(
    (Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
      86_400_000,
  )

/** Integer division rounded half to even. */
export function divideHalfEven(cents: number, parts: number): number {
  const quotient = Math.floor(cents / parts)
  const remainder = cents - quotient * parts
  if (remainder * 2 > parts) return quotient + 1
  if (remainder * 2 === parts) return quotient + (quotient % 2)
  return quotient
}

/** « 12,5 » → 1250: exact text to cents (no float), null if not an amount. */
export function parseCents(text: string): number | null {
  const match = /^(\d{1,7})(?:[,.](\d{0,2}))?$/.exec(text.replace(/\s/g, ''))
  if (!match) return null
  const [, whole, fraction = ''] = match
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

/** 1250 → « 12,50 » (an amount field's text). */
export const centsText = (cents: number) =>
  `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`

/** Accepts only what can become an amount, as `AmountField` does. */
export const isAmountText = (text: string) =>
  /^[\d\s]*([,.]\d{0,2})?$/.test(text)

/* ---------------------------------------------------------------------------
 * Frames
 * ------------------------------------------------------------------------- */

/** The app's 22px root, so rem-sized mockups look like the app. */
export function AppScale({ children }: { children: ReactNode }) {
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

export interface Panel {
  caption: string
  width?: number
  node: ReactNode
}

/** The story's title and description, then its panels side by side. */
export function Panels({
  title,
  description,
  panels,
}: {
  title: string
  description: ReactNode
  panels: Panel[]
}) {
  return (
    <AppScale>
      <div className="bg-muted/40 text-foreground min-h-svh p-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="text-muted-foreground mb-4 max-w-[44rem] space-y-1 text-xs">
          {description}
        </div>
        <div className="flex items-start gap-6 overflow-x-auto pb-4">
          {panels.map((panel) => (
            <div
              key={panel.caption}
              className="shrink-0"
              style={{ width: panel.width ?? 375 }}
            >
              <p className="text-muted-foreground mb-2 px-4 text-xs">
                {panel.caption}
              </p>
              {panel.node}
            </div>
          ))}
        </div>
      </div>
    </AppScale>
  )
}

/** A page as drawn on a phone: background, side gutter. */
export function PageFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background @container min-h-[38rem] space-y-4 border-x px-4 py-4">
      {children}
    </div>
  )
}

/** `PageHeader`: « ‹ back » above the title, an optional description. */
export function PageTitle({
  title,
  back,
  description,
}: {
  title: string
  back?: string
  description?: string
}) {
  return (
    <div className="space-y-1">
      {back && (
        <p className="text-muted-foreground flex min-h-11 items-center text-sm">
          <ChevronLeftIcon aria-hidden className="size-4" />
          {back}
        </p>
      )}
      <h1 className="text-xl font-semibold">{title}</h1>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
    </div>
  )
}

/** A bottom sheet as drawn on a phone, its footer kept at its end. */
export function SheetFrame({
  children,
  footer,
}: {
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="bg-background flex min-h-[38rem] flex-col rounded-t-2xl border shadow-lg">
      <span
        aria-hidden
        className="bg-muted-foreground/30 mx-auto mt-2 block h-1 w-10 rounded-full"
      />
      <div className="flex-1 space-y-3 p-4">{children}</div>
      {footer && <div className="space-y-2 border-t p-4">{footer}</div>}
    </div>
  )
}

export function ScreenHeader({
  title,
  onBack,
  step,
}: {
  title: string
  onBack?: () => void
  step?: string
}) {
  return (
    <div className="flex min-h-11 items-center gap-2">
      {onBack && (
        <Button
          ghost
          variant="secondary"
          size="sm"
          className="-ml-2 min-h-11"
          onClick={onBack}
        >
          <ChevronLeftIcon aria-hidden />
          Retour
        </Button>
      )}
      <p className="min-w-0 flex-1 font-semibold break-normal">{title}</p>
      {step && (
        <p className="text-muted-foreground text-xs whitespace-nowrap">
          {step}
        </p>
      )}
    </div>
  )
}

/** A card of the app: border, padding, a title and an optional status. */
export function MockCard({
  title,
  status,
  link,
  children,
  className,
}: {
  title?: ReactNode
  status?: ReactNode
  link?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'bg-card text-card-foreground @container space-y-4 rounded-xl border p-4',
        className,
      )}
    >
      {title && (
        <header className="flex items-start gap-x-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold break-normal">{title}</h2>
            {status && (
              <p className="text-muted-foreground mt-0.5 text-sm">{status}</p>
            )}
          </div>
          {link && (
            <span className="text-muted-foreground inline-flex min-h-11 shrink-0 items-center text-sm font-medium whitespace-nowrap">
              {link} ›
            </span>
          )}
        </header>
      )}
      {children}
    </section>
  )
}

/** The app's `FigureTile` (apps/web), without its router link. */
export function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: ReactNode
  tone?: 'good' | 'warning' | 'muted'
}) {
  return (
    <div className="bg-muted/50 flex min-w-0 flex-col items-start rounded-xl px-3 py-2.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          'text-[clamp(1rem,11cqi,1.35rem)] font-semibold whitespace-nowrap tabular-nums',
          tone === 'good' && 'text-chart-delta-good',
          tone === 'warning' && 'text-warning-foreground dark:text-warning',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {value}
      </p>
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Small pieces
 * ------------------------------------------------------------------------- */

export function CategoryOf({
  category,
  size = 'md',
}: {
  category: CategoryKey
  size?: 'sm' | 'md'
}) {
  const { icon, color } = CATEGORIES[category]
  return <CategoryIcon icon={icon} color={color} size={size} />
}

/** A contact's initial on a disc tinted with its colour. */
export function Avatar({
  contact,
  size = 'md',
}: {
  contact: Contact
  size?: 'sm' | 'md'
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'md' ? 'size-[32px] text-sm' : 'size-[22px] text-[11px]',
      )}
      style={{
        color: `color-mix(in oklab, ${contact.color} 82%, var(--foreground))`,
        backgroundColor: `color-mix(in srgb, ${contact.color} 16%, transparent)`,
      }}
    >
      {contact.name.slice(0, 1).toUpperCase()}
    </span>
  )
}

/** A progress bar: `value` of `max`, good once full. */
export function Bar({
  value,
  max,
  className,
}: {
  value: number
  max: number
  className?: string
}) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <span
      aria-hidden
      className={cn(
        'bg-muted block h-2 overflow-hidden rounded-full',
        className,
      )}
    >
      <span
        className={cn(
          'block h-full rounded-full',
          ratio >= 1 ? 'bg-chart-delta-good' : 'bg-primary',
        )}
        style={{ width: `${ratio * 100}%` }}
      />
    </span>
  )
}

/** « Remboursé le 9 oct. » / « Abandonné le 25 oct. » in its tone. */
export function StateText({ item }: { item: OwedItem }) {
  if (item.state === 'open') return null
  return (
    <span
      className={cn(
        'text-xs whitespace-nowrap',
        item.state === 'repaid'
          ? 'text-chart-delta-good'
          : 'text-muted-foreground',
      )}
    >
      {item.state === 'repaid' ? 'Remboursé' : 'Abandonné'} le{' '}
      {day(item.closedOn ?? item.date)}
    </span>
  )
}

/** The fake toast every saved change shows (« Annuler »). */
export function ToastLine({ text }: { text: string }) {
  return (
    <div className="bg-foreground text-background flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-sm shadow-md">
      <span className="min-w-0 break-normal">{text}</span>
      <span className="font-semibold whitespace-nowrap">Annuler</span>
    </div>
  )
}
