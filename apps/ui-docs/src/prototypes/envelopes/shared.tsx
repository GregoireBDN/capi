import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
} from '@finances/ui'
import {
  BikeIcon,
  ChevronLeftIcon,
  EllipsisVerticalIcon,
  HouseIcon,
  PlaneIcon,
  ShieldIcon,
  WalletIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Shared pieces of the envelope prototypes (#428): synthetic data, the
 * app's frame (header, sidebar on a computer), cards, rows, the stacked bar.
 * Not app code: the whole folder goes once the owner has chosen.
 */

export type Width = 320 | 390 | 1280

export const WIDTH_ARG = {
  control: 'inline-radio',
  options: [320, 390, 1280],
} as const

/* ---------------------------------------------------------------------------
 * Money
 * ------------------------------------------------------------------------- */

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
const EUR_ROUND = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

/** Cents to « 1 234,56 € » (or « 1 235 € » when `round`). */
export function euros(cents: number, round = false): string {
  return (round ? EUR_ROUND : EUR).format(cents / 100).replace('-', '−')
}

export function percent(basisPoints: number): string {
  return `${Math.round(basisPoints / 100)} %`
}

/* ---------------------------------------------------------------------------
 * Synthetic data: three accounts, four envelopes, on 22 Nov 2026
 * ------------------------------------------------------------------------- */

export interface Envelope {
  id: string
  name: string
  icon: LucideIcon
  /** A CSS colour: the envelope's segment, dot and tint. */
  color: string
  targetCents?: number
  /** « 1 juil. 2027 » */
  due?: string
  /** Months left until the due date, this one included. */
  monthsLeft?: number
  categories: string[]
}

export const ENVELOPES: Envelope[] = [
  {
    id: 'japon',
    name: 'Voyage au Japon',
    icon: PlaneIcon,
    color: 'var(--chart-5)',
    targetCents: 400000,
    due: '1 juil. 2027',
    monthsLeft: 7,
    categories: ['Voyages', 'Restaurants'],
  },
  {
    id: 'apport',
    name: 'Apport immobilier',
    icon: HouseIcon,
    color: 'var(--chart-1)',
    targetCents: 3000000,
    due: '31 déc. 2028',
    monthsLeft: 25,
    categories: [],
  },
  {
    id: 'velo',
    name: 'Nouveau vélo',
    icon: BikeIcon,
    color: 'var(--chart-3)',
    targetCents: 120000,
    categories: ['Sport'],
  },
  {
    id: 'imprevus',
    name: 'Imprévus',
    icon: ShieldIcon,
    color: 'var(--chart-4)',
    targetCents: 300000,
    categories: [],
  },
]

export const ENVELOPE = Object.fromEntries(
  ENVELOPES.map((envelope) => [envelope.id, envelope]),
) as Record<string, Envelope>

export interface Account {
  id: string
  name: string
  institution: string
  balanceCents: number
  /** Each envelope's amount on this account. */
  allocations: { envelopeId: string; cents: number }[]
  /** The split key: basis points per envelope, the rest « libre ». */
  key: { envelopeId: string; basisPoints: number }[]
}

export const ACCOUNTS: Account[] = [
  {
    id: 'livret',
    name: 'Livret A',
    institution: 'Banque Exemple',
    balanceCents: 860000,
    allocations: [
      { envelopeId: 'apport', cents: 520000 },
      { envelopeId: 'japon', cents: 190000 },
      { envelopeId: 'velo', cents: 30000 },
    ],
    key: [
      { envelopeId: 'apport', basisPoints: 5000 },
      { envelopeId: 'japon', basisPoints: 3000 },
      { envelopeId: 'velo', basisPoints: 1000 },
    ],
  },
  {
    id: 'courant',
    name: 'Compte courant',
    institution: 'Banque Exemple',
    balanceCents: 324018,
    allocations: [
      { envelopeId: 'japon', cents: 55000 },
      { envelopeId: 'velo', cents: 40000 },
    ],
    key: [
      { envelopeId: 'japon', basisPoints: 2000 },
      { envelopeId: 'velo', basisPoints: 2000 },
    ],
  },
  {
    id: 'ldds',
    name: 'LDDS',
    institution: 'Banque Exemple',
    balanceCents: 215000,
    allocations: [
      { envelopeId: 'apport', cents: 150000 },
      { envelopeId: 'imprevus', cents: 65000 },
    ],
    key: [{ envelopeId: 'imprevus', basisPoints: 10000 }],
  },
]

export const ACCOUNT = Object.fromEntries(
  ACCOUNTS.map((account) => [account.id, account]),
) as Record<string, Account>

export function allocatedCents(account: Account): number {
  return account.allocations.reduce((sum, a) => sum + a.cents, 0)
}

export function freeCents(account: Account): number {
  return account.balanceCents - allocatedCents(account)
}

/** An envelope's amount on each account, largest first. */
export function shares(envelopeId: string) {
  return ACCOUNTS.flatMap((account) =>
    account.allocations
      .filter((a) => a.envelopeId === envelopeId)
      .map((a) => ({ account, cents: a.cents })),
  ).sort((a, b) => b.cents - a.cents)
}

export function envelopeTotal(envelopeId: string): number {
  return shares(envelopeId).reduce((sum, s) => sum + s.cents, 0)
}

/** What still has to be put aside each month to reach the target on time. */
export function monthlyNeed(envelope: Envelope): number | undefined {
  if (!envelope.targetCents || !envelope.monthsLeft) return undefined
  const left = envelope.targetCents - envelopeTotal(envelope.id)
  return Math.max(0, Math.ceil(left / envelope.monthsLeft))
}

/** The last eight month ends of « Voyage au Japon », per account (cents). */
export const JAPON_HISTORY = [
  { month: 'avr.', livret: 60000, courant: 0 },
  { month: 'mai', livret: 75000, courant: 10000 },
  { month: 'juin', livret: 90000, courant: 20000 },
  { month: 'juil.', livret: 105000, courant: 25000 },
  { month: 'août', livret: 125000, courant: 35000 },
  { month: 'sept.', livret: 145000, courant: 40000 },
  { month: 'oct.', livret: 165000, courant: 50000 },
  { month: 'nov.', livret: 190000, courant: 55000 },
]

export const FREE_COLOR = 'var(--muted-foreground)'
export const FREE_ICON = WalletIcon

/* ---------------------------------------------------------------------------
 * The frame: header, sidebar on a computer, the page's title
 * ------------------------------------------------------------------------- */

export function Frame({
  width,
  back,
  crumbs,
  active = 'Comptes',
  title,
  description,
  children,
  overlay,
  height,
}: {
  width: Width
  back?: string
  crumbs: string[]
  active?: string
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  overlay?: ReactNode
  /** A fixed height, for flows whose buttons stay at the bottom. */
  height?: number
}) {
  const computer = width >= 768
  return (
    <div
      className="bg-background text-foreground relative mx-auto flex min-h-screen flex-col overflow-hidden border-x"
      style={{ width, minHeight: height, height }}
    >
      <header className="bg-background sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-3">
        {computer && (
          <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md text-xs font-bold">
            F
          </span>
        )}
        {computer ? (
          <span className="text-muted-foreground text-sm">
            {crumbs.map((crumb, i) => (
              <span key={crumb}>
                {i > 0 && ' › '}
                <span
                  className={cn(i === crumbs.length - 1 && 'text-foreground')}
                >
                  {crumb}
                </span>
              </span>
            ))}
          </span>
        ) : back ? (
          <span className="text-primary inline-flex items-center gap-0.5 text-sm">
            <ChevronLeftIcon className="size-4" aria-hidden /> {back}
          </span>
        ) : (
          <span className="text-sm font-semibold">{crumbs.at(-1)}</span>
        )}
        <span className="ml-auto">
          <Button iconOnly variant="secondary" aria-label="Actions de la page">
            <EllipsisVerticalIcon />
          </Button>
        </span>
        <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-full text-xs font-semibold">
          CD
        </span>
      </header>
      <div className="flex min-h-0 flex-1">
        {computer && (
          <nav
            aria-hidden
            className="bg-sidebar text-muted-foreground w-56 shrink-0 space-y-1 border-r p-3 text-sm"
          >
            {[
              'Tableau de bord',
              'Mouvements',
              'Budget',
              'Enveloppes',
              'Bilan du mois',
              'Abonnements',
              'Comptes',
              'Épargne',
              'Dépenses partagées',
            ].map((item) => (
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
            '@container min-w-0 flex-1 space-y-6 overflow-y-auto',
            computer ? 'p-6' : 'px-4 py-4',
          )}
        >
          {(title || description) && (
            <div>
              {title && (
                <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
              )}
              {description && (
                <p className="text-muted-foreground text-sm">{description}</p>
              )}
            </div>
          )}
          {children}
        </main>
      </div>
      {overlay}
    </div>
  )
}

/** A full-screen panel on a phone, a centred window on a computer. */
export function Screen({
  width,
  title,
  onClose,
  children,
  footer,
}: {
  width: Width
  title: string
  onClose?: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const computer = width >= 768
  const inner = (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button
          iconOnly
          variant="secondary"
          className="rounded-full"
          aria-label="Fermer"
          onClick={onClose}
        >
          <XIcon />
        </Button>
        <p className="flex-1 text-center font-semibold">{title}</p>
        <span className="size-9" />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {children}
      </div>
      {footer && (
        <div className="flex shrink-0 gap-2 border-t px-4 py-3">{footer}</div>
      )}
    </>
  )
  if (!computer)
    return (
      <div
        role="dialog"
        aria-label={title}
        className="bg-background absolute inset-0 z-20 flex flex-col"
      >
        {inner}
      </div>
    )
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/40 p-6">
      <div
        role="dialog"
        aria-label={title}
        className="bg-background flex max-h-full w-full max-w-lg flex-col rounded-xl shadow-lg"
      >
        {inner}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Small pieces
 * ------------------------------------------------------------------------- */

export function SimpleCard({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('min-w-0', className)}>
      {title && (
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          {action}
        </CardHeader>
      )}
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

export function Dot({
  color,
  className,
}: {
  color: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ background: color }}
    />
  )
}

/** An envelope's icon on a tint of its colour. */
export function EnvelopeIcon({
  envelope,
  size = 'md',
}: {
  envelope: { icon: LucideIcon; color: string }
  size?: 'sm' | 'md' | 'lg'
}) {
  const Icon = envelope.icon
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full',
        size === 'sm' && 'size-7 [&_svg]:size-3.5',
        size === 'md' && 'size-9 [&_svg]:size-4',
        size === 'lg' && 'size-14 [&_svg]:size-7',
      )}
      style={{
        background: `color-mix(in oklch, ${envelope.color} 18%, transparent)`,
        color: envelope.color,
      }}
    >
      <Icon />
    </span>
  )
}

export interface Segment {
  id: string
  label: string
  cents: number
  color: string
  /** Hatched: « libre », or what is missing. */
  hatched?: boolean
}

/** One stacked bar: every envelope, then « libre ». */
export function StackedBar({
  segments,
  className,
  tall = false,
}: {
  segments: Segment[]
  className?: string
  tall?: boolean
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.cents), 0)
  return (
    <div
      role="img"
      aria-label={segments
        .map((s) => `${s.label} ${euros(s.cents, true)}`)
        .join(', ')}
      className={cn(
        'bg-muted flex w-full gap-0.5 overflow-hidden rounded-full',
        tall ? 'h-4' : 'h-2.5',
        className,
      )}
    >
      {segments
        .filter((s) => s.cents > 0)
        .map((s) => (
          <span
            key={s.id}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(s.cents / total) * 100}%`,
              background: s.hatched
                ? `repeating-linear-gradient(135deg, color-mix(in oklch, ${s.color} 35%, transparent) 0 4px, transparent 4px 8px)`
                : s.color,
            }}
          />
        ))}
    </div>
  )
}

export function accountSegments(account: Account): Segment[] {
  return [
    ...account.allocations.map((a) => ({
      id: a.envelopeId,
      label: ENVELOPE[a.envelopeId].name,
      cents: a.cents,
      color: ENVELOPE[a.envelopeId].color,
    })),
    {
      id: 'libre',
      label: 'Libre',
      cents: freeCents(account),
      color: FREE_COLOR,
      hatched: true,
    },
  ]
}

/** label … value, one line, the value never broken. */
export function Line({
  label,
  value,
  sub,
  leading,
  tone,
  strong,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  leading?: ReactNode
  tone?: 'good' | 'bad' | 'muted' | 'warning'
  strong?: boolean
}) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
      {leading}
      <div className="min-w-[7rem] flex-1">
        <p className={cn('break-normal', strong && 'font-medium')}>{label}</p>
        {sub && <p className="text-muted-foreground text-sm">{sub}</p>}
      </div>
      <p
        className={cn(
          'ml-auto font-medium whitespace-nowrap tabular-nums',
          tone === 'good' && 'text-chart-delta-good',
          tone === 'bad' && 'text-chart-delta-bad',
          tone === 'muted' && 'text-muted-foreground',
          tone === 'warning' && 'text-warning-foreground dark:text-warning',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** A figure tile: value over a two-word label. */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad'
}) {
  return (
    <div className="bg-muted/60 min-w-0 rounded-md p-3">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p
        className={cn(
          'text-lg font-semibold whitespace-nowrap tabular-nums',
          tone === 'good' && 'text-chart-delta-good',
          tone === 'bad' && 'text-chart-delta-bad',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** A thin progress bar, a mark where the pace should be. */
export function Gauge({
  value,
  max,
  color,
  mark,
  extra,
  extraColor,
}: {
  value: number
  max: number
  color: string
  /** Where the pace should be, in the same unit. */
  mark?: number
  /** A second part after `value` (what an envelope adds). */
  extra?: number
  extraColor?: string
}) {
  const scale = Math.max(max, value + (extra ?? 0))
  return (
    <div className="bg-muted relative h-2.5 w-full overflow-hidden rounded-full">
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${(value / scale) * 100}%`, background: color }}
      />
      {extra !== undefined && (
        <span
          className="absolute inset-y-0"
          style={{
            left: `${(value / scale) * 100}%`,
            width: `${(extra / scale) * 100}%`,
            background: extraColor,
          }}
        />
      )}
      {mark !== undefined && (
        <span
          className="bg-foreground absolute inset-y-0 w-0.5"
          style={{ left: `${(mark / scale) * 100}%` }}
        />
      )}
    </div>
  )
}

/** Labelled phone-size frames side by side, for the « Côte à côte » stories. */
export function SideBySide({
  items,
}: {
  items: { label: string; node: ReactNode }[]
}) {
  return (
    <div className="flex items-start gap-6 p-6">
      {items.map((item) => (
        <div key={item.label} className="shrink-0 space-y-2">
          <p className="text-muted-foreground text-sm font-medium">
            {item.label}
          </p>
          {item.node}
        </div>
      ))}
    </div>
  )
}
