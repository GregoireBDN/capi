/**
 * Synthetic data and pieces shared by the #359 prototypes (shared costs with
 * a partner). Not app code: the app builds the chosen directions in
 * `apps/web`, and this file goes with the prototypes once the owner chooses.
 */
import { CategoryIcon, cn, formatEuros, formatWholeEuros } from '@finances/ui'
import { useEffect, type ReactNode } from 'react'

/* ---------------------------------------------------------------------------
 * Synthetic data (November 2026, data up to the 20th)
 * ------------------------------------------------------------------------- */

export const PARTNER = 'Camille'

export interface Category {
  name: string
  icon: string
  color: string
}

export const CATEGORIES = {
  rent: { name: 'Loyer', icon: 'house', color: '#dc2626' },
  energy: { name: 'Énergie', icon: 'zap', color: '#ea580c' },
  groceries: { name: 'Courses', icon: 'shopping-cart', color: '#d97706' },
  subscriptions: { name: 'Abonnements', icon: 'repeat', color: '#7c3aed' },
  insurance: { name: 'Assurances', icon: 'shield', color: '#4f46e5' },
  refunds: { name: 'Remboursements', icon: 'undo-2', color: '#059669' },
} satisfies Record<string, Category>

export type CategoryKey = keyof typeof CATEGORIES

/** A shared expense: what the owner paid and the partner's share of it. */
export interface SharedCost {
  id: string
  label: string
  category: CategoryKey
  /** `YYYY-MM-DD`, a calendar date. */
  date: string
  /** What the owner paid, cents. */
  paidCents: number
  /** The partner's share (50 % half to even), cents. */
  shareCents: number
  /** Already paid back by linked refunds, cents. */
  repaidCents: number
  /** From a shared recurring item. */
  recurring: boolean
}

/** Every shared cost not fully paid back, oldest first. */
export const UNPAID: SharedCost[] = [
  {
    id: 'c1',
    label: 'Courses Carrefour',
    category: 'groceries',
    date: '2026-10-28',
    paidCents: 5_210,
    shareCents: 2_605,
    repaidCents: 0,
    recurring: false,
  },
  {
    id: 'c2',
    label: 'Loyer',
    category: 'rent',
    date: '2026-11-01',
    paidCents: 80_000,
    shareCents: 40_000,
    repaidCents: 20_000,
    recurring: true,
  },
  {
    id: 'c3',
    label: 'EDF',
    category: 'energy',
    date: '2026-11-05',
    paidCents: 12_000,
    shareCents: 6_000,
    repaidCents: 0,
    recurring: true,
  },
  {
    id: 'c4',
    label: 'Assurance habitation',
    category: 'insurance',
    date: '2026-11-08',
    paidCents: 2_400,
    shareCents: 1_200,
    repaidCents: 0,
    recurring: true,
  },
  {
    id: 'c5',
    label: 'Netflix',
    category: 'subscriptions',
    date: '2026-11-12',
    paidCents: 1_798,
    shareCents: 899,
    repaidCents: 0,
    recurring: true,
  },
  {
    id: 'c6',
    label: 'Courses Monoprix',
    category: 'groceries',
    date: '2026-11-14',
    paidCents: 8_640,
    shareCents: 4_320,
    repaidCents: 0,
    recurring: false,
  },
]

export const leftOf = (cost: SharedCost) => cost.shareCents - cost.repaidCents

/** November: the share of every shared cost booked in it. */
export const MONTH = {
  label: 'novembre 2026',
  short: 'Novembre',
  expectedCents: 52_419,
  receivedCents: 20_000,
  owedCents: 32_419,
}

/** Cumulated from the start date the owner chose. */
export const SINCE = {
  label: 'Depuis le 1 sept.',
  start: '2026-09-01',
  expectedCents: 151_222,
  receivedCents: 116_198,
  owedCents: 35_024,
}

/** One line of November's statement: a share (+) or a refund (−). */
export interface LedgerLine {
  date: string
  label: string
  category: CategoryKey
  /** + what the partner owes from it, − what a refund paid back. */
  cents: number
  note?: string
}

export const LEDGER: LedgerLine[] = [
  {
    date: '2026-11-01',
    label: 'Loyer',
    category: 'rent',
    cents: 40_000,
    note: 'sur 800,00 €',
  },
  {
    date: '2026-11-05',
    label: 'EDF',
    category: 'energy',
    cents: 6_000,
    note: 'sur 120,00 €',
  },
  {
    date: '2026-11-08',
    label: 'Assurance habitation',
    category: 'insurance',
    cents: 1_200,
    note: 'sur 24,00 €',
  },
  {
    date: '2026-11-10',
    label: `Virement de ${PARTNER}`,
    category: 'refunds',
    cents: -20_000,
    note: 'pour le loyer',
  },
  {
    date: '2026-11-12',
    label: 'Netflix',
    category: 'subscriptions',
    cents: 899,
    note: 'sur 17,98 €',
  },
  {
    date: '2026-11-14',
    label: 'Courses Monoprix',
    category: 'groceries',
    cents: 4_320,
    note: 'sur 86,40 €',
  },
]

/** Carried over from before November (the October groceries). */
export const CARRIED_CENTS = 2_605

/** The shared recurring items' next charges, December. */
export const NEXT = {
  label: 'Décembre',
  totalCents: 48_099,
  items: [
    {
      label: 'Loyer',
      category: 'rent',
      date: '2026-12-01',
      shareCents: 40_000,
    },
    { label: 'EDF', category: 'energy', date: '2026-12-05', shareCents: 6_000 },
    {
      label: 'Assurance habitation',
      category: 'insurance',
      date: '2026-12-08',
      shareCents: 1_200,
    },
    {
      label: 'Netflix',
      category: 'subscriptions',
      date: '2026-12-12',
      shareCents: 899,
    },
  ] satisfies {
    label: string
    category: CategoryKey
    date: string
    shareCents: number
  }[],
}

/** The incoming transfer the « Lier un remboursement » flow starts from. */
export const REFUND = {
  label: 'VIR SEPA CAMILLE M',
  display: `Virement de ${PARTNER}`,
  date: '2026-11-19',
  amountCents: 30_000,
}

/**
 * The suggestion for it: the oldest costs not paid back whose remaining
 * amounts come closest to 300 € without going over (26,05 + 200 + 60 + 12 =
 * 298,05 €); Netflix would go over. 1,95 € stay in « Remboursements ».
 */
export const SUGGESTED_IDS = ['c1', 'c2', 'c3', 'c4']

/* ---------------------------------------------------------------------------
 * Formatting
 * ------------------------------------------------------------------------- */

export const euros = (cents: number) => formatEuros(cents)
export const wholeEuros = (cents: number) => formatWholeEuros(cents)

const dayFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
/** `2026-11-05` → « 5 nov. », never through a time zone. */
export const day = (date: string) =>
  dayFormat.format(new Date(`${date}T00:00:00Z`))

/**
 * « 12,5 » → 1250. Exact text to cents (no float), null when it isn't an
 * amount.
 */
export function parseCents(text: string): number | null {
  const match = /^(\d{1,7})(?:[,.](\d{0,2}))?$/.exec(text.replace(/\s/g, ''))
  if (!match) return null
  const [, whole, fraction = ''] = match
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

/** 1250 → « 12,50 » (the amount fields' text). */
export const centsText = (cents: number) =>
  `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`

/* ---------------------------------------------------------------------------
 * Shared pieces
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

/** The story's title, its description, then the mockup at phone widths. */
export function Widths({
  title,
  description,
  widths = [320, 375, 430],
  children,
}: {
  title: string
  description: ReactNode
  widths?: number[]
  children: ReactNode
}) {
  return (
    <AppScale>
      <div className="bg-muted/40 text-foreground min-h-svh p-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="text-muted-foreground mb-4 max-w-[40rem] space-y-1 text-xs">
          {description}
        </div>
        <div className="flex items-start gap-6 overflow-x-auto pb-4">
          {widths.map((width) => (
            <div key={width} className="shrink-0" style={{ width }}>
              <p className="text-muted-foreground mb-2 px-4 text-xs">
                {width}px
              </p>
              <div className="bg-background border-x px-4 py-4">{children}</div>
            </div>
          ))}
        </div>
      </div>
    </AppScale>
  )
}

/** A dashboard-like card: title, optional status and « Voir … › ». */
export function MockCard({
  title,
  status,
  link,
  children,
  className,
}: {
  title: ReactNode
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
      <header className="flex items-start gap-x-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold break-normal">{title}</h2>
          {status && (
            <p className="text-muted-foreground mt-0.5 text-sm">{status}</p>
          )}
        </div>
        {link && (
          <a
            href="#"
            onClick={(event) => event.preventDefault()}
            className="text-muted-foreground hover:text-foreground relative inline-flex min-h-11 shrink-0 items-center gap-0.5 text-sm font-medium whitespace-nowrap"
          >
            {link} ›
          </a>
        )}
      </header>
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
  className,
}: {
  label: string
  value: string
  note?: ReactNode
  tone?: 'good' | 'bad' | 'warning'
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-muted/50 flex min-w-0 flex-col items-start rounded-xl px-3 py-2.5',
        className,
      )}
    >
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          'text-[clamp(1rem,11cqi,1.35rem)] font-semibold whitespace-nowrap tabular-nums',
          tone === 'good' && 'text-chart-delta-good',
          tone === 'bad' && 'text-chart-delta-bad',
          tone === 'warning' && 'text-warning-foreground dark:text-warning',
        )}
      >
        {value}
      </p>
      {note && <p className="text-muted-foreground text-xs">{note}</p>}
    </div>
  )
}

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

/** A progress bar: `value` of `max`, in the primary or the good colour. */
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
