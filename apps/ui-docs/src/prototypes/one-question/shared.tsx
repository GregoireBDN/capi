import { Button, cn } from '@capi/ui'
import {
  BusIcon,
  ClapperboardIcon,
  EllipsisVerticalIcon,
  HeartPulseIcon,
  HouseIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  UtensilsIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Shared pieces of the « one question per page » prototypes (#434):
 * synthetic data for November 2026 (known until the 22nd), the app's frame,
 * small visual helpers. Not app code: the whole folder goes once the owner
 * has chosen.
 */

export type Width = 320 | 390 | 1280

export const WIDTH_ARG = {
  control: 'inline-radio',
  options: [320, 390, 1280],
} as const

/* ---------------------------------------------------------------------------
 * Money
 * ------------------------------------------------------------------------- */

const EUR_ROUND = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

/** Cents to « 1 235 € » (or « 1 234,56 € » when `exact`). */
export function euros(cents: number, exact = false): string {
  return (exact ? EUR : EUR_ROUND).format(cents / 100).replace('-', '−')
}

/* ---------------------------------------------------------------------------
 * Synthetic month: November 2026, statements imported until the 22nd
 * ------------------------------------------------------------------------- */

export const MONTH = 'Novembre'
export const KNOWN_DAY = 22
export const MONTH_DAYS = 30

export const COLORS = {
  income: 'var(--chart-income)',
  expense: 'var(--chart-expense)',
  savings: 'var(--chart-savings)',
  kept: 'var(--chart-delta-good)',
  good: 'var(--chart-delta-good)',
  warning: 'var(--chart-warning)',
  over: 'var(--chart-over)',
}

export const INCOME = { cents: 285000, previousCents: 285000 }
export const SAVINGS = { cents: 50000, previousCents: 40000 }

export interface Category {
  id: string
  name: string
  icon: LucideIcon
  color: string
  /** Spent this month, until the 22nd. */
  cents: number
  /** The same days of October. */
  previousCents: number
  /** The month's target, if any (envelope included). */
  targetCents?: number
}

export const CATEGORIES: Category[] = [
  {
    id: 'logement',
    name: 'Logement',
    icon: HouseIcon,
    color: 'var(--chart-1)',
    cents: 82000,
    previousCents: 82000,
    targetCents: 82000,
  },
  {
    id: 'courses',
    name: 'Courses',
    icon: ShoppingCartIcon,
    color: 'var(--chart-2)',
    cents: 38600,
    previousCents: 41200,
    targetCents: 50000,
  },
  {
    id: 'shopping',
    name: 'Shopping',
    icon: ShoppingBagIcon,
    color: 'var(--chart-3)',
    cents: 22400,
    previousCents: 9800,
    targetCents: 20000,
  },
  {
    id: 'restaurants',
    name: 'Restaurants',
    icon: UtensilsIcon,
    color: 'var(--chart-4)',
    cents: 21400,
    previousCents: 26000,
    targetCents: 18000,
  },
  {
    id: 'transports',
    name: 'Transports',
    icon: BusIcon,
    color: 'var(--chart-5)',
    cents: 13200,
    previousCents: 14800,
    targetCents: 15000,
  },
  {
    id: 'loisirs',
    name: 'Loisirs',
    icon: ClapperboardIcon,
    color: 'var(--chart-6)',
    cents: 9600,
    previousCents: 15000,
    targetCents: 15000,
  },
  {
    id: 'sante',
    name: 'Santé',
    icon: HeartPulseIcon,
    color: 'var(--chart-7)',
    cents: 4800,
    previousCents: 2500,
  },
]

export const EXPENSE = {
  cents: CATEGORIES.reduce((sum, c) => sum + c.cents, 0),
  previousCents: CATEGORIES.reduce((sum, c) => sum + c.previousCents, 0),
}

/** What stayed on the current accounts: income − expenses − set aside. */
export const KEPT_CENTS = INCOME.cents - EXPENSE.cents - SAVINGS.cents

/** The envelope that paid part of this month (#430's « ligne Enveloppe »). */
export const ENVELOPE = {
  name: 'Cadeaux de Noël',
  paidCents: 9000,
  putAsideCents: 30000,
  category: 'shopping',
}

export const PLANNED_INCOME_CENTS = 290000

export type Status = 'ok' | 'warning' | 'over'

/** A budget line's status: over its target, past 80 %, or fine. */
export function statusOf(category: Category): Status | null {
  if (category.targetCents === undefined) return null
  const target =
    category.targetCents +
    (category.id === ENVELOPE.category ? ENVELOPE.paidCents : 0)
  if (category.cents > target) return 'over'
  if (category.cents >= target * 0.8) return 'warning'
  return 'ok'
}

export function targetOf(category: Category): number {
  return (
    (category.targetCents ?? 0) +
    (category.id === ENVELOPE.category ? ENVELOPE.paidCents : 0)
  )
}

export const BUDGETED = CATEGORIES.filter((c) => c.targetCents !== undefined)
export const UNBUDGETED = CATEGORIES.filter((c) => c.targetCents === undefined)
export const TARGET_CENTS = BUDGETED.reduce((sum, c) => sum + targetOf(c), 0)
export const SPENT_BUDGETED_CENTS = BUDGETED.reduce(
  (sum, c) => sum + c.cents,
  0,
)
export const LEFT_CENTS = TARGET_CENTS - SPENT_BUDGETED_CENTS

export const STATUS_COLOR: Record<Status, string> = {
  ok: COLORS.good,
  warning: COLORS.warning,
  over: COLORS.over,
}

export interface Operation {
  day: string
  label: string
  category?: string
  cents: number
  review?: boolean
}

export const OPERATIONS: Operation[] = [
  {
    day: 'Sam. 22 nov.',
    label: 'CB CARREFOUR CITY',
    category: 'courses',
    cents: -2340,
  },
  {
    day: 'Sam. 22 nov.',
    label: 'CB LE PETIT ZINC',
    category: 'restaurants',
    cents: -4800,
    review: true,
  },
  {
    day: 'Ven. 21 nov.',
    label: 'PRLV SEPA ENERGIE PLUS',
    cents: -6200,
    review: true,
  },
  {
    day: 'Ven. 21 nov.',
    label: 'CB SNCF CONNECT',
    category: 'transports',
    cents: -3900,
  },
  { day: 'Jeu. 20 nov.', label: 'VIR M DUPONT', cents: 2500, review: true },
  {
    day: 'Jeu. 20 nov.',
    label: 'CB BOUTIQUE MODE',
    category: 'shopping',
    cents: -7900,
  },
  {
    day: 'Mer. 19 nov.',
    label: 'CB CINEMA LUMIERE',
    category: 'loisirs',
    cents: -1800,
  },
]

export const CATEGORY = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<string, Category>

export const REVIEW_COUNT = 5
export const UNCATEGORIZED_COUNT = 2
export const OPERATION_COUNT = 64

/* ---------------------------------------------------------------------------
 * Frame
 * ------------------------------------------------------------------------- */

const NAV = [
  'Tableau de bord',
  'Mouvements',
  'Budget',
  'Bilan du mois',
  'Abonnements',
  'Comptes',
  'Épargne',
]

/** The app's shell: a header on a phone, plus the sidebar on a computer. */
export function Frame({
  width,
  title,
  active,
  monthBar = true,
  tab,
  children,
}: {
  width: Width
  title: string
  active: string
  monthBar?: boolean
  /** Mouvements and Opérations are two tabs of one page (#498). */
  tab?: 'resume' | 'operations'
  children: ReactNode
}) {
  const computer = width >= 768
  return (
    <div
      className="bg-background text-foreground relative mx-auto flex min-h-screen flex-col overflow-hidden border-x"
      style={{ width }}
    >
      <header className="bg-background sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-3">
        {computer && (
          <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md text-xs font-bold">
            C
          </span>
        )}
        <span className="text-sm font-semibold">{title}</span>
        {monthBar && (
          <span className="bg-muted ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium">
            {MONTH}
          </span>
        )}
        <span className="ml-auto">
          <Button iconOnly variant="secondary" aria-label="Actions de la page">
            <EllipsisVerticalIcon />
          </Button>
        </span>
      </header>
      <div className="flex min-h-0 flex-1">
        {computer && (
          <nav
            aria-hidden
            className="bg-sidebar text-muted-foreground w-56 shrink-0 space-y-1 border-r p-3 text-sm"
          >
            {NAV.map((item) => (
              <p
                key={item}
                className={cn(
                  'rounded-md px-2 py-1.5',
                  item === active && 'bg-primary/10 text-primary font-medium',
                )}
              >
                {item}
              </p>
            ))}
          </nav>
        )}
        <main
          className={cn(
            '@container min-w-0 flex-1 space-y-4 overflow-y-auto',
            computer ? 'mx-auto max-w-3xl p-6' : 'px-4 py-4',
          )}
        >
          {tab && (
            <div className="-mt-1 flex gap-4 border-b text-sm">
              {(
                [
                  ['resume', 'Résumé'],
                  ['operations', 'Opérations'],
                ] as const
              ).map(([key, label]) => (
                <span
                  key={key}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-1.5 border-b-2 px-1',
                    key === tab
                      ? 'border-primary text-foreground font-medium'
                      : 'text-muted-foreground border-transparent',
                  )}
                >
                  {label}
                  {key === 'operations' && (
                    <span
                      className="grid size-5 place-items-center rounded-full text-[11px] font-semibold text-white"
                      style={{ background: COLORS.warning }}
                    >
                      {REVIEW_COUNT}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}

/** The page's question, one line with its icon (each direction shows it). */
export function Question({
  icon: Icon,
  children,
}: {
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
      <Icon aria-hidden className="size-4 shrink-0" />
      {children}
    </p>
  )
}

export function CategoryDot({
  category,
  size = 'md',
}: {
  category: Category
  size?: 'sm' | 'md' | 'lg'
}) {
  const Icon = category.icon
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full text-white',
        size === 'sm' && 'size-6 [&_svg]:size-3.5',
        size === 'md' && 'size-8 [&_svg]:size-4',
        size === 'lg' && 'size-10 [&_svg]:size-5',
      )}
      style={{ background: category.color }}
    >
      <Icon />
    </span>
  )
}

/** A thin bar: a share of a whole, or of a target with its overrun in red. */
export function Bar({
  value,
  max,
  color,
  className,
  marker,
}: {
  value: number
  max: number
  color: string
  className?: string
  /** A tick at this share (0–1): where the month is. */
  marker?: number
}) {
  const share = Math.min(1, value / max)
  return (
    <span
      className={cn(
        'bg-muted relative block h-2 overflow-hidden rounded-full',
        className,
      )}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${share * 100}%`, background: color }}
      />
      {marker !== undefined && (
        <span
          className="bg-foreground/60 absolute inset-y-[-2px] w-0.5"
          style={{ left: `${marker * 100}%` }}
        />
      )}
    </span>
  )
}

/** « ▲ 126 € » / « ▼ 26 € », green when it goes the good way. */
export function Delta({
  cents,
  increaseIsGood,
  className,
}: {
  cents: number
  increaseIsGood: boolean
  className?: string
}) {
  if (cents === 0)
    return <span className={cn('text-muted-foreground', className)}>=</span>
  const good = cents > 0 === increaseIsGood
  return (
    <span
      className={cn('whitespace-nowrap tabular-nums', className)}
      style={{ color: good ? COLORS.good : COLORS.over }}
    >
      {cents > 0 ? '▲' : '▼'} {euros(Math.abs(cents))}
    </span>
  )
}

/** Side by side on a computer: the three pages of a direction. */
export function Card({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <section className={cn('bg-card rounded-xl border p-3', className)}>
      {children}
    </section>
  )
}

/** A small link to the page that holds a figure: « Par catégorie › ». */
export function GoTo({
  icon: Icon,
  children,
}: {
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <span className="text-primary inline-flex min-h-11 items-center gap-1.5 text-sm font-medium">
      <Icon aria-hidden className="size-4" />
      {children}
      <span aria-hidden>›</span>
    </span>
  )
}
