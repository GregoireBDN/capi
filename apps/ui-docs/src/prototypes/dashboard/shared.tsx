import { Card, cn } from '@capi/ui'
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BitcoinIcon,
  CalendarClockIcon,
  CalendarCheckIcon,
  ChartCandlestickIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  FileUpIcon,
  InboxIcon,
  LandmarkIcon,
  MenuIcon,
  NotebookPenIcon,
  PiggyBankIcon,
  ReceiptIcon,
  RepeatIcon,
  ShoppingCartIcon,
  TargetIcon,
  UmbrellaIcon,
  UtensilsIcon,
  WalletIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Shared pieces of the dashboard prototypes (#495): synthetic data, the
 * app's frame, the cards of today's dashboard and three new elements.
 * Not app code: the whole folder goes once the owner has chosen.
 */

export type Width = 320 | 390 | 1280

export const WIDTH_ARG = {
  control: 'inline-radio',
  options: [320, 390, 1280],
} as const

const EUR = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

/** Cents to « 1 234 € ». */
export function euros(cents: number): string {
  return EUR.format(cents / 100).replace('-', '−')
}

/* ---------------------------------------------------------------------------
 * Synthetic data
 * ------------------------------------------------------------------------- */

export interface Account {
  id: string
  name: string
  icon: LucideIcon
  /** Badge classes, the type's colour. */
  tone: string
  balanceCents: number
  /** « libre » when it holds envelopes. */
  freeCents?: number
  bank?: boolean
}

export const ACCOUNTS: Account[] = [
  {
    id: 'courant',
    name: 'Compte courant',
    icon: WalletIcon,
    tone: 'bg-chart-1/15 text-chart-1',
    balanceCents: 184_200,
    bank: true,
  },
  {
    id: 'livret',
    name: 'Livret A',
    icon: PiggyBankIcon,
    tone: 'bg-chart-3/15 text-chart-3',
    balanceCents: 860_000,
    freeCents: 120_000,
    bank: true,
  },
  {
    id: 'tickets',
    name: 'Titres-restaurant',
    icon: UtensilsIcon,
    tone: 'bg-chart-2/15 text-chart-2',
    balanceCents: 9_600,
  },
  {
    id: 'pea',
    name: 'PEA',
    icon: ChartCandlestickIcon,
    tone: 'bg-chart-7/15 text-chart-7',
    balanceCents: 1_420_000,
  },
  {
    id: 'av',
    name: 'Assurance vie',
    icon: UmbrellaIcon,
    tone: 'bg-chart-5/15 text-chart-5',
    balanceCents: 2_310_000,
  },
  {
    id: 'crypto',
    name: 'Crypto',
    icon: BitcoinIcon,
    tone: 'bg-chart-6/15 text-chart-6',
    balanceCents: 307_300,
  },
]

export const ACCOUNT = Object.fromEntries(
  ACCOUNTS.map((account) => [account.id, account]),
) as Record<string, Account>

/* ---------------------------------------------------------------------------
 * The catalogue
 * ------------------------------------------------------------------------- */

export type ElementType =
  | 'todo'
  | 'left'
  | 'forecast'
  | 'netWorth'
  | 'tracked'
  | 'balances'
  | 'owed'
  | 'upcoming'
  | 'month'
  | 'envelopes'
  | 'investments'
  | 'shortcuts'

export interface ElementInfo {
  type: ElementType
  name: string
  icon: LucideIcon
  /** Badge classes. */
  tone: string
  /** Shows accounts: the « Comptes » option. */
  accounts?: boolean
}

export const CATALOGUE: Record<ElementType, ElementInfo> = {
  todo: {
    type: 'todo',
    name: 'À faire',
    icon: InboxIcon,
    tone: 'bg-warning/20 text-warning-foreground dark:text-warning',
  },
  shortcuts: {
    type: 'shortcuts',
    name: 'Raccourcis',
    icon: ZapIcon,
    tone: 'bg-primary/10 text-primary',
  },
  left: {
    type: 'left',
    name: 'Reste à dépenser',
    icon: TargetIcon,
    tone: 'bg-primary/10 text-primary',
  },
  tracked: {
    type: 'tracked',
    name: 'Budgets suivis',
    icon: ShoppingCartIcon,
    tone: 'bg-chart-2/15 text-chart-2',
  },
  month: {
    type: 'month',
    name: 'Le mois',
    icon: ReceiptIcon,
    tone: 'bg-chart-4/15 text-chart-4',
    accounts: true,
  },
  upcoming: {
    type: 'upcoming',
    name: 'Prélèvements',
    icon: CalendarClockIcon,
    tone: 'bg-info/15 text-info-foreground dark:text-info',
    accounts: true,
  },
  forecast: {
    type: 'forecast',
    name: 'Fin de mois',
    icon: CalendarClockIcon,
    tone: 'bg-muted text-muted-foreground',
    accounts: true,
  },
  balances: {
    type: 'balances',
    name: 'Soldes',
    icon: WalletIcon,
    tone: 'bg-chart-1/15 text-chart-1',
    accounts: true,
  },
  netWorth: {
    type: 'netWorth',
    name: 'Patrimoine',
    icon: LandmarkIcon,
    tone: 'bg-primary/10 text-primary',
    accounts: true,
  },
  owed: {
    type: 'owed',
    name: 'Argent dû',
    icon: RepeatIcon,
    tone: 'bg-chart-delta-good/15 text-chart-delta-good',
  },
  envelopes: {
    type: 'envelopes',
    name: 'Enveloppes',
    icon: PiggyBankIcon,
    tone: 'bg-chart-3/15 text-chart-3',
  },
  investments: {
    type: 'investments',
    name: 'Placements',
    icon: ChartCandlestickIcon,
    tone: 'bg-chart-7/15 text-chart-7',
    accounts: true,
  },
}

export interface Placed {
  type: ElementType
  hidden?: boolean
  size?: 'small' | 'large'
  /** Chosen accounts; none = all. */
  accounts?: string[]
}

/** Today's dashboard: the default. */
export const DEFAULT_LAYOUT: Placed[] = [
  { type: 'todo', size: 'large' },
  { type: 'left', size: 'large' },
  { type: 'forecast', size: 'small' },
  { type: 'netWorth', size: 'small' },
  { type: 'tracked', size: 'large' },
]

/** An owner's layout: what the prototypes edit. */
export const MY_LAYOUT: Placed[] = [
  { type: 'todo', size: 'large' },
  {
    type: 'balances',
    size: 'small',
    accounts: ['courant', 'livret', 'tickets'],
  },
  { type: 'owed', size: 'small' },
  { type: 'left', size: 'large' },
  { type: 'upcoming', size: 'small', accounts: ['courant'] },
  { type: 'forecast', size: 'small' },
  { type: 'netWorth', hidden: true, size: 'small' },
  { type: 'tracked', hidden: true, size: 'large' },
]

/** The elements not placed yet, for « Ajouter ». */
export function missing(layout: Placed[]): ElementInfo[] {
  const placed = new Set(layout.map((element) => element.type))
  return Object.values(CATALOGUE).filter((info) => !placed.has(info.type))
}

/* ---------------------------------------------------------------------------
 * The frame
 * ------------------------------------------------------------------------- */

export function Frame({
  width,
  children,
  overlay,
  height,
  title = 'Tableau de bord',
  description = 'Jeudi 26 novembre',
  actions,
  bottom,
  back,
}: {
  width: Width
  children: ReactNode
  overlay?: ReactNode
  height?: number
  title?: ReactNode
  description?: ReactNode
  /** Replaces the page header's actions. */
  actions?: ReactNode
  /** A bar stuck to the bottom of the screen. */
  bottom?: ReactNode
  /** « ‹ Réglages » in place of the menu. */
  back?: string
}) {
  const computer = width >= 768
  return (
    <div
      className="bg-background text-foreground relative mx-auto flex flex-col overflow-hidden border-x"
      style={{ width, minHeight: height ?? 844, height }}
    >
      <header className="bg-background flex h-[2.6rem] shrink-0 items-center gap-2 border-b px-3">
        {back && !computer ? (
          <span className="text-primary inline-flex items-center gap-1 text-sm">
            ‹ {back}
          </span>
        ) : (
          <>
            {!computer && (
              <MenuIcon className="text-muted-foreground size-5" aria-hidden />
            )}
            <span className="flex items-center gap-1.5 font-semibold">
              <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md text-[0.6rem] font-bold">
                C
              </span>
              Capi
            </span>
          </>
        )}
        <span className="ml-auto" />
        {!computer && (
          <span className="bg-muted grid size-9 place-items-center rounded-lg">
            <EllipsisVerticalIcon className="size-4" aria-hidden />
          </span>
        )}
        <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-full text-xs font-semibold">
          CD
        </span>
      </header>
      <div className="flex min-h-0 flex-1">
        {computer && (
          <nav
            aria-hidden
            className="bg-sidebar text-muted-foreground w-52 shrink-0 space-y-1 border-r p-3 text-sm"
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
                  item === 'Tableau de bord' &&
                    'bg-sidebar-accent text-foreground font-medium',
                )}
              >
                {item}
              </p>
            ))}
          </nav>
        )}
        <main className="@container min-w-0 flex-1 overflow-hidden">
          <div
            className={cn(
              'space-y-3 px-3 pt-4 pb-6',
              computer && 'mx-auto max-w-4xl px-6',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[1.45rem] leading-tight font-bold tracking-tight">
                  {title}
                </h1>
                {description && (
                  <p className="text-muted-foreground text-sm">{description}</p>
                )}
              </div>
              {actions}
            </div>
            {children}
          </div>
        </main>
      </div>
      {bottom}
      {overlay}
    </div>
  )
}

/** A sheet from the bottom of the frame (a phone), or a centred panel. */
export function SheetMock({
  width,
  title,
  icon,
  children,
  footer,
}: {
  width: Width
  title: ReactNode
  icon?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const computer = width >= 768
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/40">
      <div
        className={cn(
          'bg-background flex max-h-[88%] w-full flex-col shadow-xl',
          computer
            ? 'mb-auto mt-16 max-w-md rounded-2xl'
            : 'rounded-t-[1.1rem]',
        )}
      >
        {!computer && (
          <span className="bg-muted-foreground/30 mx-auto mt-2 h-1 w-10 rounded-full" />
        )}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          {icon}
          <p className="flex-1 font-semibold">{title}</p>
          <span className="text-muted-foreground text-lg leading-none">✕</span>
        </div>
        <div className="space-y-4 overflow-hidden px-4 py-3">{children}</div>
        {footer && <div className="border-t px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Badge({
  icon: Icon,
  tone,
  size = 32,
}: {
  icon: LucideIcon
  tone: string
  size?: number
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        tone,
      )}
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: size / 2, height: size / 2 }} />
    </span>
  )
}

/* ---------------------------------------------------------------------------
 * The elements, as the dashboard shows them
 * ------------------------------------------------------------------------- */

function Row({
  icon,
  tone,
  title,
  detail,
  value,
  valueClass,
}: {
  icon: LucideIcon
  tone: string
  title: ReactNode
  detail?: ReactNode
  value?: ReactNode
  valueClass?: string
}) {
  return (
    <div className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
      <Badge icon={icon} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        {detail && (
          <span className="text-muted-foreground block truncate text-xs">
            {detail}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {value !== undefined && (
          <span
            className={cn(
              'font-semibold whitespace-nowrap tabular-nums',
              valueClass,
            )}
          >
            {value}
          </span>
        )}
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </span>
    </div>
  )
}

function CardTitle({
  children,
  more,
}: {
  children: ReactNode
  more?: ReactNode
}) {
  return (
    <p className="text-muted-foreground flex items-center justify-between px-2 pb-1 text-xs">
      {children}
      {more ?? <ChevronRightIcon aria-hidden className="size-4" />}
    </p>
  )
}

export function TodoCard() {
  return (
    <Card className="border-warning/50 min-w-0 gap-0 px-2 py-3">
      <CardTitle more={<span>2 autres ⌄</span>}>À faire</CardTitle>
      <Row
        icon={FileUpIcon}
        tone="bg-warning/20 text-warning-foreground dark:text-warning"
        title="Importer un relevé"
        detail="Dernier relevé au 18 nov."
      />
      <Row
        icon={NotebookPenIcon}
        tone="bg-warning/20 text-warning-foreground dark:text-warning"
        title="Clôturer octobre"
      />
    </Card>
  )
}

export function LeftCard() {
  return (
    <Card className="min-w-0 gap-2 px-4 py-3">
      <p className="text-muted-foreground flex items-center justify-between text-xs">
        Reste à dépenser en novembre
        <ChevronRightIcon aria-hidden className="size-4" />
      </p>
      <p className="flex flex-wrap items-end justify-between gap-x-3">
        <span className="text-[2rem] leading-tight font-semibold tracking-tight tabular-nums">
          {euros(52_400)}
        </span>
        <span className="text-chart-delta-good pb-1 text-xs font-medium">
          Dans le rythme
        </span>
      </p>
      <span className="bg-muted relative block h-3 rounded-full">
        <span className="bg-primary absolute inset-y-0 left-0 w-[76%] rounded-full" />
        <span className="bg-foreground absolute -inset-y-1 left-[83%] w-0.5 rounded" />
      </span>
      <p className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs tabular-nums">
        <span>
          {euros(168_600)} sur {euros(221_000)}
        </span>
        <span className="flex items-center gap-1">
          <CalendarCheckIcon className="size-3.5" aria-hidden /> À jour au 25
          nov.
        </span>
      </p>
    </Card>
  )
}

export function ForecastCard() {
  return (
    <Card className="min-w-0 gap-0 px-2 py-1.5">
      <Row
        icon={CalendarClockIcon}
        tone="bg-muted text-muted-foreground"
        title="Fin de mois"
        detail="Point bas 1 210 €"
        value={euros(161_800)}
      />
    </Card>
  )
}

export function NetWorthCard({ accounts }: { accounts?: number }) {
  return (
    <Card className="min-w-0 gap-0 px-2 py-1.5">
      <Row
        icon={LandmarkIcon}
        tone="bg-primary/10 text-primary"
        title={accounts ? `Patrimoine · ${accounts} comptes` : 'Patrimoine'}
        detail="+412 € depuis le 31 oct."
        value={euros(5_091_100)}
      />
    </Card>
  )
}

export function TrackedCard() {
  const lines = [
    { name: 'Courses', icon: ShoppingCartIcon, spent: 31_200, target: 45_000 },
    { name: 'Restaurants', icon: UtensilsIcon, spent: 14_800, target: 15_000 },
  ]
  return (
    <Card className="min-w-0 gap-2 px-4 py-3">
      <p className="text-muted-foreground text-xs">Budgets suivis</p>
      {lines.map((line) => {
        const ratio = line.spent / line.target
        return (
          <div key={line.name} className="space-y-1">
            <p className="flex items-center gap-2 text-sm">
              <line.icon className="text-muted-foreground size-4" aria-hidden />
              <span className="flex-1 font-medium">{line.name}</span>
              <span className="tabular-nums">
                {euros(line.target - line.spent)}
              </span>
              <span className="bg-muted grid size-7 place-items-center rounded-full text-base leading-none">
                +
              </span>
            </p>
            <span className="bg-muted block h-2 rounded-full">
              <span
                className={cn(
                  'block h-2 rounded-full',
                  ratio > 0.9 ? 'bg-chart-warning' : 'bg-primary',
                )}
                style={{ width: `${ratio * 100}%` }}
              />
            </span>
          </div>
        )
      })}
    </Card>
  )
}

/** New: « Soldes », one row per chosen account. */
export function BalancesCard({ accounts }: { accounts: string[] }) {
  return (
    <Card className="min-w-0 gap-0 px-2 py-2">
      <CardTitle>Soldes</CardTitle>
      {accounts.map((id) => {
        const account = ACCOUNT[id]
        return (
          <Row
            key={id}
            icon={account.icon}
            tone={account.tone}
            title={account.name}
            detail={
              account.freeCents !== undefined
                ? `${euros(account.freeCents)} libre`
                : undefined
            }
            value={euros(account.balanceCents)}
          />
        )
      })}
    </Card>
  )
}

/** New: « Argent dû », green owed to me, orange I owe. */
export function OwedCard() {
  const people = [
    { name: 'Léa', initials: 'L', cents: 4_250, toMe: true },
    { name: 'Hugo', initials: 'H', cents: 1_800, toMe: true },
    { name: 'Sam', initials: 'S', cents: 3_000, toMe: false },
  ]
  return (
    <Card className="min-w-0 gap-1 px-2 py-2">
      <CardTitle>Argent dû</CardTitle>
      <div className="grid grid-cols-2 gap-2 px-2 pb-1">
        <div className="bg-chart-delta-good/10 rounded-xl px-3 py-2">
          <ArrowDownLeftIcon
            className="text-chart-delta-good size-4"
            aria-label="On me doit"
          />
          <p className="text-chart-delta-good text-lg font-semibold tabular-nums">
            {euros(6_050)}
          </p>
        </div>
        <div className="bg-warning/15 rounded-xl px-3 py-2">
          <ArrowUpRightIcon
            className="text-warning-foreground dark:text-warning size-4"
            aria-label="Je dois"
          />
          <p className="text-warning-foreground dark:text-warning text-lg font-semibold tabular-nums">
            {euros(3_000)}
          </p>
        </div>
      </div>
      {people.map((person) => (
        <div
          key={person.name}
          className="flex min-h-10 items-center gap-3 px-2 text-sm"
        >
          <span
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
              person.toMe
                ? 'bg-chart-delta-good/15 text-chart-delta-good'
                : 'bg-warning/20 text-warning-foreground dark:text-warning',
            )}
          >
            {person.initials}
          </span>
          <span className="flex-1 font-medium">{person.name}</span>
          <span
            className={cn(
              'font-semibold tabular-nums',
              person.toMe
                ? 'text-chart-delta-good'
                : 'text-warning-foreground dark:text-warning',
            )}
          >
            {person.toMe ? '+' : '−'}
            {euros(person.cents)}
          </span>
        </div>
      ))}
    </Card>
  )
}

/** New: « Prochains prélèvements », the next debits with their day. */
export function UpcomingCard() {
  const debits = [
    { day: '28', month: 'nov.', name: 'Électricité', cents: 6_400 },
    { day: '1', month: 'déc.', name: 'Loyer', cents: 72_000 },
    { day: '3', month: 'déc.', name: 'Téléphone', cents: 1_599 },
  ]
  return (
    <Card className="min-w-0 gap-0 px-2 py-2">
      <CardTitle>Prélèvements · 7 j</CardTitle>
      {debits.map((debit) => (
        <div
          key={debit.name}
          className="flex min-h-11 items-center gap-3 px-2 text-sm"
        >
          <span className="bg-info/15 text-info-foreground dark:text-info flex size-[34px] shrink-0 flex-col items-center justify-center rounded-lg leading-none">
            <span className="text-sm font-bold">{debit.day}</span>
            <span className="text-[0.5rem]">{debit.month}</span>
          </span>
          <span className="flex-1 truncate font-medium">{debit.name}</span>
          <span className="font-semibold whitespace-nowrap tabular-nums">
            −{euros(debit.cents)}
          </span>
        </div>
      ))}
    </Card>
  )
}

export function ElementView({ element }: { element: Placed }) {
  switch (element.type) {
    case 'todo':
      return <TodoCard />
    case 'left':
      return <LeftCard />
    case 'forecast':
      return <ForecastCard />
    case 'netWorth':
      return <NetWorthCard accounts={element.accounts?.length} />
    case 'tracked':
      return <TrackedCard />
    case 'balances':
      return (
        <BalancesCard
          accounts={element.accounts ?? ACCOUNTS.map((account) => account.id)}
        />
      )
    case 'owed':
      return <OwedCard />
    case 'upcoming':
      return <UpcomingCard />
    default:
      return (
        <Card className="text-muted-foreground min-w-0 px-4 py-6 text-sm">
          {CATALOGUE[element.type].name}
        </Card>
      )
  }
}

/** The dashboard as the layout says: one column, two from `md`. */
export function Dashboard({
  layout,
  width,
}: {
  layout: Placed[]
  width: Width
}) {
  const computer = width >= 768
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)] items-start gap-3',
        computer && 'grid-cols-2',
      )}
    >
      {layout
        .filter((element) => !element.hidden)
        .map((element) => (
          <div
            key={element.type}
            className={cn(computer && element.size === 'large' && 'col-span-2')}
          >
            <ElementView element={element} />
          </div>
        ))}
    </div>
  )
}
