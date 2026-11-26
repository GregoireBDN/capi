import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card, cn } from '@capi/ui'
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  HouseIcon,
  PiggyBankIcon,
  PlaneIcon,
  PlusIcon,
  ShoppingCartIcon,
  TrainFrontIcon,
  UmbrellaIcon,
  UtensilsIcon,
  ZapIcon,
  BanknoteIcon,
  CarIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * #495, four dashboard cards the owner found unclear or dull: « Fin de
 * mois », « Budgets suivis », « Le mois » and « Enveloppes ». Three
 * directions each, mockups with synthetic data, not app code (deleted once
 * the owner has chosen).
 */
const meta: Meta<Args> = {
  title: 'Prototypes/Cartes tableau de bord (#495)',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
  argTypes: { width: { control: 'inline-radio', options: [320, 390] } },
  args: { width: 390 },
}
export default meta

interface Args {
  width: 320 | 390
}
type Story = StoryObj<Args>

const eur = (cents: number) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(cents / 100)
const signed = (cents: number) =>
  `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${eur(Math.abs(cents))}`

function Page({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div
      className="bg-background text-foreground min-h-screen px-4 py-4"
      style={{ width }}
    >
      <div className="space-y-5">{children}</div>
    </div>
  )
}

function Option({
  letter,
  name,
  children,
}: {
  letter: string
  name: string
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-muted-foreground px-1 text-xs font-semibold tracking-wide uppercase">
        {letter}. {name}
      </h3>
      {children}
    </section>
  )
}

function Header({
  title,
  value,
  icon,
}: {
  title: string
  value?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 px-4 pt-3.5">
      {icon}
      <h2 className="flex-1 text-sm font-semibold">{title}</h2>
      {value}
      <ChevronRightIcon aria-hidden className="text-muted-foreground size-4" />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Fin de mois
 * ------------------------------------------------------------------------- */

// Known until 15 nov., projected to the 30th: down to 3 127 € on the 27th,
// the salary on the 28th.
const CURVE = [
  3920, 3880, 3790, 3750, 3700, 3610, 3560, 3500, 3440, 3390, 3330, 3270, 3127,
  5877, 5829, 5805,
].map((euros) => euros * 100)
const TODAY_INDEX = 11 // the 26th
const LOW_INDEX = 12
const UPCOMING = [
  { day: 27, name: 'Électricité', cents: -6_200, icon: ZapIcon },
  { day: 28, name: 'Salaire', cents: 275_000, icon: BanknoteIcon },
  { day: 29, name: 'Assurance auto', cents: -4_800, icon: CarIcon },
]

function Sparkline({ height = 64 }: { height?: number }) {
  const w = 300
  const min = Math.min(...CURVE) * 0.92
  const max = Math.max(...CURVE) * 1.04
  const x = (i: number) => (i / (CURVE.length - 1)) * w
  const y = (v: number) => height - ((v - min) / (max - min)) * height
  const line = CURVE.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      className="block h-16 w-full overflow-visible"
    >
      <defs>
        <linearGradient id="fdm" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill="url(#fdm)" />
      <path
        d={line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      <line
        x1={x(TODAY_INDEX)}
        x2={x(TODAY_INDEX)}
        y1="0"
        y2={height}
        stroke="var(--muted-foreground)"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function ForecastCurve() {
  const low = CURVE[LOW_INDEX]
  return (
    <Card className="gap-0 p-0">
      <Header
        title="Fin de mois"
        icon={
          <CalendarClockIcon aria-hidden className="text-primary size-[18px]" />
        }
        value={
          <span className="text-lg font-bold tabular-nums">
            {eur(CURVE.at(-1)!)}
          </span>
        }
      />
      <div className="relative px-4 pt-2 pb-1">
        <Sparkline />
        <span
          className="bg-warning text-warning-foreground absolute -translate-x-1/2 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold whitespace-nowrap tabular-nums"
          style={{
            left: `calc(1rem + ${(LOW_INDEX / (CURVE.length - 1)) * 100}% - ${(LOW_INDEX / (CURVE.length - 1)) * 2}rem)`,
            bottom: '0.1rem',
          }}
        >
          ↓ {eur(low)} le 27
        </span>
      </div>
      <div className="text-muted-foreground flex justify-between px-4 pb-3 text-[0.65rem]">
        <span>16 nov.</span>
        <span>aujourd’hui</span>
        <span>30 nov.</span>
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3.5">
        <Chip tone="bad" icon={ArrowUpRightIcon}>
          {eur(126_000)} à payer
        </Chip>
        <Chip tone="good" icon={ArrowDownLeftIcon}>
          {eur(275_000)} à recevoir
        </Chip>
      </div>
    </Card>
  )
}

function Chip({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'good' | 'bad'
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium whitespace-nowrap tabular-nums',
        tone === 'good'
          ? 'bg-chart-income/15 text-chart-delta-good'
          : 'bg-chart-expense/15 text-chart-delta-bad',
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  )
}

function ForecastPath() {
  const steps = [
    { label: 'Aujourd’hui', value: CURVE[TODAY_INDEX], dot: 'bg-primary' },
    { label: 'Point bas · 27', value: CURVE[LOW_INDEX], dot: 'bg-warning' },
    { label: 'Fin · 30', value: CURVE.at(-1)!, dot: 'bg-chart-income' },
  ]
  return (
    <Card className="gap-0 p-0">
      <Header
        title="Fin de mois"
        icon={
          <CalendarClockIcon aria-hidden className="text-primary size-[18px]" />
        }
      />
      <div className="relative grid grid-cols-3 px-4 pt-4 pb-4">
        <span
          aria-hidden
          className="bg-muted absolute top-[1.35rem] right-[16.6%] left-[16.6%] h-1 rounded-full"
        />
        {steps.map((step, i) => (
          <div
            key={step.label}
            className="relative flex flex-col items-center gap-1 text-center"
          >
            <span
              className={cn('ring-card size-3.5 rounded-full ring-4', step.dot)}
            />
            <span
              className={cn(
                'mt-1 font-bold whitespace-nowrap tabular-nums',
                i === 2 ? 'text-lg' : 'text-sm',
              )}
            >
              {eur(step.value)}
            </span>
            <span className="text-muted-foreground text-[0.65rem] whitespace-nowrap">
              {step.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 px-4 pb-3.5">
        <Chip tone="bad" icon={ArrowUpRightIcon}>
          {eur(126_000)}
        </Chip>
        <Chip tone="good" icon={ArrowDownLeftIcon}>
          {eur(275_000)}
        </Chip>
      </div>
    </Card>
  )
}

function ForecastUpcoming() {
  return (
    <Card className="gap-0 p-0">
      <Header
        title="Fin de mois"
        icon={
          <CalendarClockIcon aria-hidden className="text-primary size-[18px]" />
        }
        value={
          <span className="text-right">
            <span className="block text-lg leading-tight font-bold tabular-nums">
              {eur(CURVE.at(-1)!)}
            </span>
          </span>
        }
      />
      <p className="text-muted-foreground px-4 text-xs">
        Point bas{' '}
        <span className="text-warning-foreground dark:text-warning font-semibold">
          {eur(CURVE[LOW_INDEX])}
        </span>{' '}
        le 27
      </p>
      <ul className="px-2 pt-2 pb-2">
        {UPCOMING.map((item) => (
          <li
            key={item.name}
            className="flex min-h-[44px] items-center gap-3 rounded-lg px-2"
          >
            <span className="bg-info/15 text-info-foreground dark:text-info flex size-[34px] shrink-0 flex-col items-center justify-center rounded-lg leading-none">
              <span className="text-sm font-bold">{item.day}</span>
              <span className="text-[0.5rem]">nov.</span>
            </span>
            <item.icon
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
            <span className="min-w-0 flex-1 truncate text-sm">{item.name}</span>
            <span
              className={cn(
                'text-sm font-semibold whitespace-nowrap tabular-nums',
                item.cents > 0 && 'text-chart-delta-good',
              )}
            >
              {signed(item.cents)}
            </span>
          </li>
        ))}
        <li className="text-muted-foreground flex min-h-[36px] items-center gap-3 px-2 text-xs">
          <span className="w-[34px] text-center">≈</span>
          <span className="flex-1">Dépenses courantes</span>
          <span className="tabular-nums">−{eur(56_000)}</span>
        </li>
      </ul>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * Budgets suivis
 * ------------------------------------------------------------------------- */

const BUDGETS = [
  {
    name: 'Courses',
    icon: ShoppingCartIcon,
    color: '#c26a1e',
    left: 31_600,
    spent: 18_400,
    target: 50_000,
    pace: 0.87,
  },
  {
    name: 'Restaurants & cafés',
    icon: UtensilsIcon,
    color: '#a07a12',
    left: 5_100,
    spent: 14_900,
    target: 20_000,
    pace: 0.87,
  },
  {
    name: 'Transport',
    icon: TrainFrontIcon,
    color: '#2f7a9a',
    left: 15_000,
    spent: 0,
    target: 15_000,
    pace: 0.87,
  },
]

function Badge({
  icon: Icon,
  color,
  size = 32,
}: {
  icon: LucideIcon
  color: string
  size?: number
}) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        color,
        background: `color-mix(in srgb, ${color} 16%, transparent)`,
      }}
    >
      <Icon style={{ width: size / 2, height: size / 2 }} />
    </span>
  )
}

function Bar({
  ratio,
  pace,
  color = 'var(--primary)',
}: {
  ratio: number
  pace?: number
  color?: string
}) {
  return (
    <span className="bg-muted relative block h-1.5 rounded-full">
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${Math.min(ratio, 1) * 100}%`, background: color }}
      />
      {pace !== undefined && (
        <span
          className="bg-foreground absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded"
          style={{ left: `${pace * 100}%` }}
        />
      )}
    </span>
  )
}

function BudgetsTwoZones() {
  return (
    <Card className="gap-0 px-2 pt-3 pb-2">
      <div className="flex items-baseline justify-between px-2 pb-1">
        <h2 className="text-sm font-semibold">Budgets suivis</h2>
        <span className="text-muted-foreground flex items-center text-xs">
          Budget <ChevronRightIcon className="size-3.5" />
        </span>
      </div>
      <ul>
        {BUDGETS.map((b) => (
          <li key={b.name} className="flex items-center gap-2">
            <span className="hover:bg-muted/60 flex min-h-[48px] min-w-0 flex-1 items-center gap-3 rounded-lg px-2">
              <Badge icon={b.icon} color={b.color} />
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{b.name}</span>
                  <span className="text-xs font-medium whitespace-nowrap tabular-nums">
                    {eur(b.left)}
                  </span>
                </span>
                <Bar ratio={b.spent / b.target} pace={b.pace} />
              </span>
            </span>
            <span className="bg-primary text-primary-foreground mr-1 grid size-[36px] shrink-0 place-items-center rounded-full shadow-sm">
              <PlusIcon className="size-[18px]" strokeWidth={2.75} />
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground px-2 pt-1 text-[0.65rem]">
        La ligne ouvre le détail · « + » ajoute une dépense
      </p>
    </Card>
  )
}

function Ring({
  ratio,
  color,
  size = 64,
  stroke = 5,
  children,
}: {
  ratio: number
  color: string
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.min(ratio, 1)} ${c}`}
        />
      </svg>
      {children}
    </span>
  )
}

function BudgetsTiles() {
  return (
    <Card className="gap-0 px-3 pt-3 pb-3">
      <div className="flex items-baseline justify-between px-1 pb-2">
        <h2 className="text-sm font-semibold">Budgets suivis</h2>
        <span className="text-muted-foreground flex items-center text-xs">
          Budget <ChevronRightIcon className="size-3.5" />
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {BUDGETS.map((b) => (
          <span
            key={b.name}
            className="bg-muted/50 relative flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1.5 pt-2.5 pb-2 text-center"
          >
            <Ring ratio={1 - b.spent / b.target} color={b.color} size={56}>
              <b.icon
                aria-hidden
                className="size-5"
                style={{ color: b.color }}
              />
            </Ring>
            <span className="text-sm font-bold whitespace-nowrap tabular-nums">
              {eur(b.left)}
            </span>
            <span className="text-muted-foreground line-clamp-2 text-[0.65rem] leading-tight break-normal">
              {b.name}
            </span>
            <span className="bg-primary text-primary-foreground absolute top-1.5 right-1.5 grid size-[24px] place-items-center rounded-full shadow-sm">
              <PlusIcon className="size-3.5" strokeWidth={3} />
            </span>
          </span>
        ))}
      </div>
      <p className="text-muted-foreground px-1 pt-2 text-[0.65rem]">
        L’anneau = ce qui reste · la tuile ajoute une dépense
      </p>
    </Card>
  )
}

function BudgetsOneButton() {
  return (
    <Card className="gap-0 px-2 pt-3 pb-3">
      <div className="flex items-baseline justify-between px-2 pb-1">
        <h2 className="text-sm font-semibold">Budgets suivis</h2>
        <span className="text-muted-foreground flex items-center text-xs">
          Budget <ChevronRightIcon className="size-3.5" />
        </span>
      </div>
      <ul>
        {BUDGETS.map((b) => (
          <li
            key={b.name}
            className="flex min-h-[44px] items-center gap-3 px-2"
          >
            <Badge icon={b.icon} color={b.color} />
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{b.name}</span>
                <span className="text-xs font-medium whitespace-nowrap tabular-nums">
                  {eur(b.left)}
                </span>
              </span>
              <Bar ratio={b.spent / b.target} pace={b.pace} />
            </span>
            <ChevronRightIcon
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
          </li>
        ))}
      </ul>
      <div className="px-2 pt-2">
        <span className="bg-primary text-primary-foreground flex min-h-[44px] items-center justify-center gap-2 rounded-xl text-sm font-semibold">
          <PlusIcon className="size-[18px]" strokeWidth={2.75} />
          Dépense
        </span>
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * Le mois
 * ------------------------------------------------------------------------- */

const MONTH = {
  income: 68_900,
  expense: 148_900,
  incomeBefore: 19_800,
  expenseBefore: 196_100,
}
const saved = MONTH.income - MONTH.expense

function MonthBalance() {
  const max = Math.max(
    MONTH.income,
    MONTH.expense,
    MONTH.incomeBefore,
    MONTH.expenseBefore,
  )
  const rows = [
    {
      label: 'Revenus',
      icon: ArrowDownLeftIcon,
      value: MONTH.income,
      before: MONTH.incomeBefore,
      color: 'var(--chart-income)',
      delta: MONTH.income - MONTH.incomeBefore,
      good: true,
    },
    {
      label: 'Dépenses',
      icon: ArrowUpRightIcon,
      value: MONTH.expense,
      before: MONTH.expenseBefore,
      color: 'var(--chart-expense)',
      delta: MONTH.expense - MONTH.expenseBefore,
      good: true,
    },
  ]
  return (
    <Card className="gap-0 p-0">
      <Header title="Novembre" />
      <div className="space-y-3 px-4 pt-3 pb-3">
        {rows.map((row) => (
          <div key={row.label} className="space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span
                className="grid size-[24px] place-items-center rounded-full"
                style={{
                  color: row.color,
                  background: `color-mix(in srgb, ${row.color} 18%, transparent)`,
                }}
              >
                <row.icon className="size-3.5" strokeWidth={2.5} />
              </span>
              <span className="flex-1 font-medium">{row.label}</span>
              <span className="font-bold tabular-nums">{eur(row.value)}</span>
            </div>
            <span className="bg-muted relative block h-3 rounded-full">
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${(row.value / max) * 100}%`,
                  background: row.color,
                }}
              />
              <span
                className="bg-foreground/60 absolute -inset-y-0.5 w-0.5 rounded"
                style={{ left: `${(row.before / max) * 100}%` }}
                title="octobre"
              />
            </span>
          </div>
        ))}
      </div>
      <div className="bg-chart-expense/10 mx-3 mb-3 flex items-center gap-2 rounded-xl px-3 py-2.5">
        <PiggyBankIcon aria-hidden className="text-chart-delta-bad size-5" />
        <span className="flex-1 text-sm font-medium">Épargne</span>
        <span className="text-chart-delta-bad text-lg font-bold tabular-nums">
          {signed(saved)}
        </span>
      </div>
      <p className="text-muted-foreground px-4 pb-3 text-[0.65rem]">
        ▏ = octobre au même jour
      </p>
    </Card>
  )
}

function MonthBig() {
  return (
    <Card className="gap-0 p-0">
      <Header title="Novembre" />
      <div className="flex flex-col items-center px-4 pt-3 pb-2 text-center">
        <span className="bg-chart-expense/15 text-chart-delta-bad grid size-[48px] place-items-center rounded-2xl">
          <PiggyBankIcon className="size-6" />
        </span>
        <span className="text-chart-delta-bad mt-2 text-3xl font-bold tabular-nums">
          {signed(saved)}
        </span>
        <span className="text-muted-foreground text-xs">
          épargnés ·{' '}
          <span className="text-chart-delta-good font-semibold">
            {signed(saved - (MONTH.incomeBefore - MONTH.expenseBefore))}
          </span>{' '}
          vs oct.
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3 pt-2 pb-3">
        <div className="bg-chart-income/10 flex items-center gap-2 rounded-xl px-3 py-2">
          <ArrowDownLeftIcon
            className="text-chart-delta-good size-5 shrink-0"
            strokeWidth={2.5}
          />
          <span className="min-w-0">
            <span className="block font-bold tabular-nums">
              {eur(MONTH.income)}
            </span>
            <span className="text-chart-delta-good block text-[0.65rem] tabular-nums">
              ▲ {eur(MONTH.income - MONTH.incomeBefore)}
            </span>
          </span>
        </div>
        <div className="bg-chart-expense/10 flex items-center gap-2 rounded-xl px-3 py-2">
          <ArrowUpRightIcon
            className="text-chart-delta-bad size-5 shrink-0"
            strokeWidth={2.5}
          />
          <span className="min-w-0">
            <span className="block font-bold tabular-nums">
              {eur(MONTH.expense)}
            </span>
            <span className="text-chart-delta-good block text-[0.65rem] tabular-nums">
              ▼ {eur(MONTH.expenseBefore - MONTH.expense)}
            </span>
          </span>
        </div>
      </div>
    </Card>
  )
}

function MonthColumns() {
  const max = Math.max(
    MONTH.income,
    MONTH.expense,
    MONTH.incomeBefore,
    MONTH.expenseBefore,
  )
  const groups = [
    {
      label: 'Revenus',
      color: 'var(--chart-income)',
      before: MONTH.incomeBefore,
      now: MONTH.income,
    },
    {
      label: 'Dépenses',
      color: 'var(--chart-expense)',
      before: MONTH.expenseBefore,
      now: MONTH.expense,
    },
  ]
  const H = 96
  return (
    <Card className="gap-0 p-0">
      <Header
        title="Novembre"
        value={
          <span className="text-chart-delta-bad flex items-center gap-1 text-sm font-bold tabular-nums">
            <PiggyBankIcon className="size-4" /> {signed(saved)}
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-4 px-6 pt-4 pb-2">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col items-center gap-1.5">
            <div className="flex items-end gap-2" style={{ height: H }}>
              <span className="flex flex-col items-center gap-1">
                <span className="text-muted-foreground text-[0.6rem] tabular-nums">
                  {eur(g.before)}
                </span>
                <span
                  className="w-7 rounded-t-md opacity-30"
                  style={{
                    height: (g.before / max) * (H - 18),
                    background: g.color,
                  }}
                />
              </span>
              <span className="flex flex-col items-center gap-1">
                <span className="text-xs font-bold tabular-nums">
                  {eur(g.now)}
                </span>
                <span
                  className="w-7 rounded-t-md"
                  style={{
                    height: (g.now / max) * (H - 18),
                    background: g.color,
                  }}
                />
              </span>
            </div>
            <span className="text-xs font-medium">{g.label}</span>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground px-4 pb-3 text-center text-[0.65rem]">
        clair = octobre au même jour · foncé = novembre
      </p>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * Enveloppes
 * ------------------------------------------------------------------------- */

const ENVELOPES = [
  {
    name: 'Vacances d’été',
    icon: PlaneIcon,
    color: '#c9407a',
    total: 108_000,
    target: 180_000,
    monthly: 10_300,
  },
  {
    name: 'Apport immobilier',
    icon: HouseIcon,
    color: '#3e8a4a',
    total: 400_000,
    target: 5_000_000,
    monthly: 76_700,
  },
  {
    name: 'Imprévus',
    icon: UmbrellaIcon,
    color: '#3a83c0',
    total: 350_000,
    target: 600_000,
    monthly: null,
  },
]

function EnvelopesRows() {
  return (
    <Card className="gap-0 p-0">
      <Header title="Enveloppes" />
      <ul className="space-y-1 px-2 pt-2 pb-3">
        {ENVELOPES.map((e) => (
          <li
            key={e.name}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5"
          >
            <Badge icon={e.icon} color={e.color} size={36} />
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{e.name}</span>
                <span className="font-bold whitespace-nowrap tabular-nums">
                  {eur(e.total)}
                </span>
              </span>
              <span className="bg-muted block h-2 rounded-full">
                <span
                  className="block h-2 rounded-full"
                  style={{
                    width: `${(e.total / e.target) * 100}%`,
                    background: e.color,
                  }}
                />
              </span>
              <span className="text-muted-foreground flex justify-between text-[0.65rem] tabular-nums">
                <span>
                  {Math.round((e.total / e.target) * 100)} % de {eur(e.target)}
                </span>
                {e.monthly && <span>+{eur(e.monthly)} / mois</span>}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function EnvelopesRings() {
  return (
    <Card className="gap-0 p-0">
      <Header title="Enveloppes" />
      <div className="grid grid-cols-3 gap-2 px-3 pt-3 pb-3.5">
        {ENVELOPES.map((e) => (
          <div
            key={e.name}
            className="flex min-w-0 flex-col items-center gap-1 text-center"
          >
            <Ring
              ratio={e.total / e.target}
              color={e.color}
              size={64}
              stroke={6}
            >
              <e.icon
                aria-hidden
                className="size-6"
                style={{ color: e.color }}
              />
            </Ring>
            <span className="text-sm font-bold whitespace-nowrap tabular-nums">
              {eur(e.total)}
            </span>
            <span className="text-muted-foreground w-full truncate text-[0.65rem]">
              {e.name}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function EnvelopesJars() {
  const H = 84
  return (
    <Card className="gap-0 p-0">
      <Header title="Enveloppes" />
      <div className="grid grid-cols-3 gap-3 px-4 pt-3 pb-3.5">
        {ENVELOPES.map((e) => {
          const ratio = e.total / e.target
          return (
            <div
              key={e.name}
              className="flex min-w-0 flex-col items-center gap-1 text-center"
            >
              <span
                className="relative w-full overflow-hidden rounded-2xl"
                style={{
                  height: H,
                  background: `color-mix(in srgb, ${e.color} 10%, transparent)`,
                }}
              >
                <span
                  className="absolute inset-x-0 bottom-0"
                  style={{
                    height: `${Math.max(ratio, 0.06) * 100}%`,
                    background: `color-mix(in srgb, ${e.color} 55%, transparent)`,
                  }}
                />
                <span className="absolute inset-x-0 top-2 grid place-items-center">
                  <e.icon
                    aria-hidden
                    className="size-5"
                    style={{ color: e.color }}
                  />
                </span>
                <span className="absolute inset-x-0 bottom-1.5 text-[0.65rem] font-bold tabular-nums">
                  {Math.round(ratio * 100)} %
                </span>
              </span>
              <span className="text-sm font-bold whitespace-nowrap tabular-nums">
                {eur(e.total)}
              </span>
              <span className="text-muted-foreground w-full truncate text-[0.65rem]">
                {e.name}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const FinDeMois: Story = {
  name: 'Fin de mois',
  render: ({ width }) => (
    <Page width={width}>
      <Option letter="A" name="Courbe">
        <ForecastCurve />
      </Option>
      <Option letter="B" name="Trajet">
        <ForecastPath />
      </Option>
      <Option letter="C" name="À venir">
        <ForecastUpcoming />
      </Option>
    </Page>
  ),
}

export const BudgetsSuivis: Story = {
  name: 'Budgets suivis',
  render: ({ width }) => (
    <Page width={width}>
      <Option letter="A" name="Deux zones">
        <BudgetsTwoZones />
      </Option>
      <Option letter="B" name="Tuiles « + »">
        <BudgetsTiles />
      </Option>
      <Option letter="C" name="Un seul bouton">
        <BudgetsOneButton />
      </Option>
    </Page>
  ),
}

export const LeMois: Story = {
  name: 'Le mois',
  render: ({ width }) => (
    <Page width={width}>
      <Option letter="A" name="Balance">
        <MonthBalance />
      </Option>
      <Option letter="B" name="Grand chiffre">
        <MonthBig />
      </Option>
      <Option letter="C" name="Colonnes">
        <MonthColumns />
      </Option>
    </Page>
  ),
}

export const Enveloppes: Story = {
  name: 'Enveloppes',
  render: ({ width }) => (
    <Page width={width}>
      <Option letter="A" name="Lignes">
        <EnvelopesRows />
      </Option>
      <Option letter="B" name="Anneaux">
        <EnvelopesRings />
      </Option>
      <Option letter="C" name="Bocaux">
        <EnvelopesJars />
      </Option>
    </Page>
  ),
}
