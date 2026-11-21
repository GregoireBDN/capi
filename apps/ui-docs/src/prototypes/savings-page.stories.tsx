import type { Meta, StoryObj } from '@storybook/react-vite'
import { cn } from '@finances/ui'
import {
  BitcoinIcon,
  BriefcaseIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  CalendarIcon,
  CalendarXIcon,
  ChartLineIcon,
  ChartPieIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  HandCoinsIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  MenuIcon,
  PiggyBankIcon,
  RepeatIcon,
  SettingsIcon,
  TargetIcon,
  UmbrellaIcon,
  UploadIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * Prototype of the Épargne page (#407): direction « A. Jauge », chosen by
 * the owner on 21 Nov over « B. Deux côtés » and « C. En clair », then
 * reworked at his request: far less text. Every sentence became a figure
 * with a short label, or is left out on a phone. Clickable mockup with
 * synthetic figures, not app code.
 *
 * Words (one per idea): « Épargné » (income − expenses, transfers between
 * own accounts excluded) with « Cible » and the share of the income;
 * « Mis de côté » (what left the checking account for the savings accounts
 * and investments); « Livrets et placements » (what is held there).
 *
 * Top to bottom: the month (figure, gauge with the target as a mark, gap,
 * rate, the last 6 months as dots, the average) and « Mis de côté » this
 * month, then « Ce que vous avez »: the stock, the goals (what they need
 * per month, the margin, when each one is reached at this pace) and where
 * the money went over 12 months. No chart of the months: the month bar
 * moves between them (the owner, 21 Nov). A month in progress gets no verdict, only the same day of the
 * month before and last month's result.
 */
const meta: Meta<FrameArgs> = {
  title: 'Prototypes/Épargne (#407)',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
  argTypes: {
    scenario: {
      control: 'inline-radio',
      options: ['above', 'below', 'partial', 'noTarget'],
      labels: {
        above: 'Au-dessus de la cible',
        below: 'Sous la cible',
        partial: 'Mois en cours',
        noTarget: 'Sans cible',
      },
    },
    width: { control: 'inline-radio', options: [320, 390, 1280] },
  },
}

export default meta

type Scenario = 'above' | 'below' | 'partial' | 'noTarget'

/* ---------------------------------------------------------------------------
 * Synthetic figures (cents)
 * ------------------------------------------------------------------------- */

interface Month {
  month: string
  income: number
  net: number
  /** One-off part of the net (negative: a one-off expense). */
  oneOff: number
  oneOffLabel?: string
  complete: boolean
  /** Moved to the Livret A / to the investments. */
  movedSavings: number
  movedInvestments: number
}

const TODAY_DAY = 11
const MONTHS: Month[] = [
  m('2025-12', 493200, 216900, 150000, 'Prime annuelle'),
  m('2026-01', 318300, 38900, -18000, 'Lunettes'),
  m('2026-02', 316500, 64300),
  m('2026-03', 320400, 74000),
  m('2026-04', 318300, 2800, -64900, 'Pneus et révision', -60000),
  m('2026-05', 317400, 72000),
  m('2026-06', 320400, 79900),
  m('2026-07', 319200, 27800, -42000, 'Réparation voiture'),
  m('2026-08', 317400, 110200),
  m('2026-09', 320400, 149300),
  m('2026-10', 318300, 85400),
  {
    month: '2026-11',
    income: 68900,
    net: -26000,
    oneOff: 0,
    complete: false,
    movedSavings: 0,
    movedInvestments: 30000,
  },
]
/** The same first 11 days of October, for the partial November. */
const OCTOBER_SO_FAR = { net: -77100, income: 19800 }

function m(
  month: string,
  income: number,
  net: number,
  oneOff = 0,
  oneOffLabel?: string,
  movedSavings = 40000,
): Month {
  return {
    month,
    income,
    net,
    oneOff,
    oneOffLabel,
    complete: true,
    movedSavings,
    movedInvestments: 50000,
  }
}

const TARGET = 60000

const SCENARIO_MONTH: Record<Scenario, string> = {
  above: '2026-10',
  below: '2026-07',
  partial: '2026-11',
  noTarget: '2026-10',
}

interface Account {
  name: string
  detail: string
  value: number
  gainRate?: number
  icon: LucideIcon
  tint: string
}

const SAVINGS_ACCOUNTS: Account[] = [
  {
    name: 'Livret A',
    detail: 'CIC · au 28 oct.',
    value: 1081850,
    icon: PiggyBankIcon,
    tint: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
]
const INVESTMENTS: Account[] = [
  {
    name: 'PEA',
    detail: 'Courtier Démo · au 31 oct.',
    value: 1584599,
    gainRate: 0.148,
    icon: ChartLineIcon,
    tint: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  },
  {
    name: 'Assurance vie',
    detail: 'Assureur Démo · au 31 oct.',
    value: 822665,
    gainRate: 0.097,
    icon: UmbrellaIcon,
    tint: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  },
  {
    name: 'PEE Acme',
    detail: 'Épargne Démo · au 31 oct.',
    value: 510262,
    gainRate: 0.109,
    icon: BriefcaseIcon,
    tint: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  },
  {
    name: 'Ledger',
    detail: 'Crypto · au 21 nov.',
    value: 457560,
    gainRate: 0.152,
    icon: BitcoinIcon,
    tint: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  },
  {
    name: 'Binance',
    detail: 'Crypto · au 21 nov.',
    value: 145135,
    gainRate: 0.106,
    icon: BitcoinIcon,
    tint: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  },
]
const SAVINGS_TOTAL = sum(SAVINGS_ACCOUNTS.map((a) => a.value))
const INVESTMENTS_TOTAL = sum(INVESTMENTS.map((a) => a.value))
const STOCK_TOTAL = SAVINGS_TOTAL + INVESTMENTS_TOTAL
const RESULT = 391026

/** Where the money went over the last 12 months. */
const MOVED_12 = [
  {
    name: 'Livret A',
    cents: 380000,
    icon: PiggyBankIcon,
    color: 'bg-emerald-500',
  },
  { name: 'Binance', cents: 360000, icon: BitcoinIcon, color: 'bg-orange-500' },
  { name: 'PEA', cents: 220000, icon: ChartLineIcon, color: 'bg-violet-500' },
]

interface Goal {
  name: string
  target: number
  current: number
  /** First of the deadline's month, or null. */
  deadline: string | null
  /** What it needs per month to be on time. */
  needed: number | null
  /** When it is reached at the average pace. */
  projected: string | null
}

const GOALS: Goal[] = [
  {
    name: 'Voyage au Japon',
    target: 400000,
    current: 120000,
    deadline: '2027-07',
    needed: 35000,
    projected: '2027-01',
  },
  {
    name: 'Apport immobilier',
    target: 5000000,
    current: 2407264,
    deadline: '2031-11',
    needed: 43213,
    projected: '2029-02',
  },
  {
    name: 'Épargne de précaution',
    target: 1000000,
    current: 1081850,
    deadline: null,
    needed: null,
    projected: null,
  },
]

/* ---------------------------------------------------------------------------
 * Figures of a month
 * ------------------------------------------------------------------------- */

type Tone = 'good' | 'bad' | 'neutral'

interface MonthFigures {
  month: Month
  index: number
  target: number | null
  partial: boolean
  rate: number | null
  /** 6 full months before, one-offs excluded. */
  average: number
  /** The month before (its same first days while in progress). */
  previousNet: number
  /** The last full month, for a partial month's reminder. */
  lastFull: Month
  /** Last 6 full months (before and including this one when full). */
  recent: Month[]
  status: { label: string; tone: Tone }
}

function figures(index: number, target: number | null): MonthFigures {
  const month = MONTHS[index]!
  const partial = !month.complete
  const full = MONTHS.slice(0, index).filter((x) => x.complete)
  const window = full.slice(-6)
  const average = Math.round(
    sum(window.map((x) => x.net - x.oneOff)) / Math.max(window.length, 1),
  )
  const reference = target ?? average
  return {
    month,
    index,
    target,
    partial,
    rate: partial || month.income <= 0 ? null : month.net / month.income,
    average,
    previousNet: partial ? OCTOBER_SO_FAR.net : (MONTHS[index - 1]?.net ?? 0),
    lastFull: full[full.length - 1] ?? month,
    recent: MONTHS.slice(0, index + (partial ? 0 : 1))
      .filter((x) => x.complete)
      .slice(-6),
    status: partial
      ? { label: 'En cours', tone: 'neutral' }
      : target === null
        ? {
            label: month.net >= reference ? 'Au-dessus' : 'En dessous',
            tone: 'neutral',
          }
        : month.net >= target
          ? { label: 'Cible atteinte', tone: 'good' }
          : { label: 'Sous la cible', tone: 'bad' },
  }
}

/* ---------------------------------------------------------------------------
 * Formatting
 * ------------------------------------------------------------------------- */

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0)
}
const euros0 = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const fmt0 = (cents: number) =>
  euros0.format(Math.round(cents / 100)).replace('-', '−')
const signed0 = (cents: number) => (cents > 0 ? `+${fmt0(cents)}` : fmt0(cents))
const pct = (ratio: number) => `${Math.round(ratio * 100)} %`

const asDate = (month: string) => new Date(`${month}-01T00:00:00Z`)
const long = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const short = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const name = new Intl.DateTimeFormat('fr-FR', {
  month: 'long',
  timeZone: 'UTC',
})
const abbr = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  timeZone: 'UTC',
})
const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)
const monthLong = (month: string) => capitalize(long.format(asDate(month)))
const monthShort = (month: string) => short.format(asDate(month))
const monthName = (month: string) => name.format(asDate(month))
const monthAbbr = (month: string) => abbr.format(asDate(month))

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-chart-delta-good',
  bad: 'text-chart-delta-bad',
  neutral: 'text-foreground',
}

/* ---------------------------------------------------------------------------
 * Small pieces
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

function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'bg-card text-card-foreground min-w-0 space-y-4 rounded-xl border p-4 shadow-xs',
        className,
      )}
    >
      {children}
    </section>
  )
}

/** A card's title, and at its end a figure or a status. */
function CardTitle({
  children,
  end,
}: {
  children: ReactNode
  end?: ReactNode
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 className="font-semibold">{children}</h2>
      {end}
    </header>
  )
}

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        tone === 'good' && 'bg-chart-delta-good/12 text-chart-delta-good',
        tone === 'bad' && 'bg-chart-delta-bad/12 text-chart-delta-bad',
        tone === 'neutral' && 'bg-muted text-muted-foreground',
      )}
    >
      {tone === 'good' && <CheckIcon aria-hidden className="size-3" />}
      {children}
    </span>
  )
}

/** A figure over a two-word label: « +254 € » / « vs cible ». */
function Stat({
  value,
  label,
  tone = 'neutral',
}: {
  value: ReactNode
  label: ReactNode
  tone?: Tone
}) {
  return (
    <div className="bg-muted/50 min-w-0 rounded-lg px-3 py-2">
      <p
        className={cn(
          'text-base font-semibold whitespace-nowrap tabular-nums',
          TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  )
}

/** A label and its figure on one line, the figure never cut. */
function Row({
  label,
  value,
  tone = 'neutral',
  dot,
}: {
  label: ReactNode
  value: ReactNode
  tone?: Tone
  dot?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 break-normal">
        {dot && <span className={cn('size-2 shrink-0 rounded-full', dot)} />}
        {label}
      </span>
      <span
        className={cn(
          'font-medium whitespace-nowrap tabular-nums',
          TONE_TEXT[tone],
        )}
      >
        {value}
      </span>
    </div>
  )
}

/** A bar of parts, each its share of `max`. */
function Bar({
  parts,
  max,
  className,
}: {
  parts: { cents: number; color: string }[]
  max: number
  className?: string
}) {
  return (
    <div
      className={cn(
        'bg-muted flex h-2.5 overflow-hidden rounded-full',
        className,
      )}
    >
      {parts.map((p, i) => (
        <span
          key={i}
          className={cn('h-full', p.color)}
          style={{ width: `${(Math.max(p.cents, 0) / max) * 100}%` }}
        />
      ))}
    </div>
  )
}

function LinkRow({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="text-primary hover:bg-muted/60 -mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-lg px-2 text-sm font-medium"
    >
      {children}
      <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
    </button>
  )
}

/* ---------------------------------------------------------------------------
 * The month
 * ------------------------------------------------------------------------- */

/** Six dots, reached or not, then « 5/6 ». */
function ReachedDots({ f }: { f: MonthFigures }) {
  if (f.target === null || f.recent.length === 0) return null
  const target = f.target
  const reached = f.recent.filter((x) => x.net >= target).length
  return (
    <span
      className="flex items-center gap-2 text-xs"
      aria-label={`Cible atteinte ${reached} mois sur ${f.recent.length}`}
      title="Cible atteinte sur les 6 derniers mois"
    >
      <span className="flex items-center gap-1">
        {f.recent.map((x) => (
          <span
            key={x.month}
            title={monthLong(x.month)}
            className={cn(
              'size-[10px] rounded-full',
              x.net >= target
                ? 'bg-chart-delta-good'
                : 'bg-muted-foreground/25',
            )}
          />
        ))}
      </span>
      <span className="font-medium tabular-nums">
        {reached}/{f.recent.length}
      </span>
    </span>
  )
}

/**
 * The month: « Épargné » and its status, the figure, the gauge with the
 * target as a mark, then two or three figures: the gap and the rate (a
 * month in progress: the same day of the month before and last month).
 */
function MonthHero({ f }: { f: MonthFigures }) {
  const { net } = f.month
  const reference = f.target ?? f.average
  const scale = Math.max(reference * 1.6, net * 1.1, 1)
  const mark = reference / scale
  const tone = f.status.tone
  const last = f.lastFull
  const lastReached = f.target !== null && last.net >= f.target
  return (
    <Card>
      <CardTitle end={<Chip tone={tone}>{f.status.label}</Chip>}>
        {f.partial ? 'Épargné à ce jour' : 'Épargné'}
      </CardTitle>
      <p
        className={cn(
          '-mt-1 text-[2.6rem] leading-none font-semibold tracking-tight tabular-nums',
          net < 0 && 'text-chart-delta-bad',
        )}
      >
        {fmt0(net)}
      </p>
      {/* The gauge: the month against its target (or the average). */}
      <div className="relative pt-5">
        <Bar
          className="h-3.5"
          max={scale}
          parts={[
            {
              cents: net,
              color: f.partial
                ? 'bg-primary/60'
                : tone === 'good'
                  ? 'bg-chart-delta-good'
                  : tone === 'bad'
                    ? 'bg-chart-delta-bad'
                    : 'bg-chart-savings',
            },
          ]}
        />
        <span
          aria-hidden
          className="bg-foreground absolute bottom-[-0.35rem] h-[1.5rem] w-0.5 rounded-full"
          style={{ left: `${mark * 100}%` }}
        />
        <span
          className="text-muted-foreground absolute top-0 -translate-x-1/2 text-[11px] whitespace-nowrap"
          style={{ left: `${mark * 100}%` }}
        >
          {f.target === null ? 'Moyenne' : 'Cible'} {fmt0(reference)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {f.partial ? (
          <>
            <Stat
              value={signed0(net - f.previousNet)}
              label={`vs ${TODAY_DAY} ${monthAbbr(last.month)}`}
              tone={net >= f.previousNet ? 'good' : 'bad'}
            />
            <Stat
              value={
                <span className="flex items-center gap-1">
                  {fmt0(last.net)}
                  {lastReached && (
                    <CheckIcon
                      aria-label="cible atteinte"
                      className="text-chart-delta-good size-4"
                    />
                  )}
                </span>
              }
              label={capitalize(monthName(last.month))}
            />
          </>
        ) : (
          <>
            <Stat
              value={signed0(net - reference)}
              label={f.target === null ? 'vs moyenne' : 'vs cible'}
              tone={f.target === null ? 'neutral' : tone}
            />
            {f.rate !== null && (
              <Stat value={pct(f.rate)} label="des revenus" />
            )}
          </>
        )}
      </div>
      {!f.partial && f.month.oneOff !== 0 && (
        <Row label="Sans le ponctuel" value={fmt0(net - f.month.oneOff)} />
      )}
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3 text-xs">
        <ReachedDots f={f} />
        <span>
          Moyenne{' '}
          <span className="text-foreground font-medium tabular-nums">
            {fmt0(f.average)}
          </span>
        </span>
      </div>
      {f.target === null && (
        <button
          type="button"
          className="hover:bg-muted/60 inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
        >
          <TargetIcon aria-hidden className="size-4" /> Fixer une cible
        </button>
      )}
    </Card>
  )
}

/**
 * « Mis de côté » this month: saved and put aside as two bars, the split,
 * and what it did to the checking account as one figure.
 */
function MovedThisMonth({ f }: { f: MonthFigures }) {
  const { net, movedSavings, movedInvestments } = f.month
  const moved = movedSavings + movedInvestments
  const rest = net - moved
  const max = Math.max(net, moved, 1)
  return (
    <Card>
      <CardTitle
        end={<Chip tone="neutral">{capitalize(monthName(f.month.month))}</Chip>}
      >
        Mis de côté
      </CardTitle>
      <p className="-mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {fmt0(moved)}
      </p>
      <div className="space-y-2">
        <Row label="Épargné" value={fmt0(net)} />
        <Bar max={max} parts={[{ cents: net, color: 'bg-chart-savings' }]} />
      </div>
      <div className="space-y-2">
        <Bar
          max={max}
          parts={[
            { cents: movedSavings, color: 'bg-emerald-500' },
            { cents: movedInvestments, color: 'bg-violet-500' },
          ]}
        />
        <Row label="Livret A" value={fmt0(movedSavings)} dot="bg-emerald-500" />
        <Row
          label="Placements"
          value={fmt0(movedInvestments)}
          dot="bg-violet-500"
        />
      </div>
      {!f.partial && (
        <div className="border-t pt-3">
          <Row
            label="Compte courant"
            value={signed0(rest)}
            tone={rest < 0 ? 'bad' : 'neutral'}
          />
        </div>
      )}
    </Card>
  )
}

/** One goal: name and monthly need, bar, amount and when it is reached. */
function GoalRow({ goal }: { goal: Goal }) {
  const reached = goal.current >= goal.target
  const late =
    goal.deadline !== null &&
    goal.projected !== null &&
    goal.projected > goal.deadline
  const When = late ? CalendarXIcon : CalendarCheckIcon
  return (
    <li>
      <button
        type="button"
        aria-label={
          reached
            ? `${goal.name} : atteint`
            : `${goal.name} : ${fmt0(goal.needed ?? 0)} par mois pour ${monthShort(goal.deadline!)}, atteint en ${monthShort(goal.projected!)} à ce rythme`
        }
        className="hover:bg-muted/60 -mx-2 block w-[calc(100%+1rem)] space-y-1.5 rounded-lg px-2 py-2 text-left text-sm"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium break-normal">{goal.name}</span>
          {reached ? (
            <span className="text-chart-delta-good flex items-center gap-1 text-xs font-medium">
              <CheckIcon aria-hidden className="size-3" /> Atteint
            </span>
          ) : (
            <span className="font-semibold whitespace-nowrap tabular-nums">
              {fmt0(goal.needed ?? 0)}
              <span className="text-muted-foreground text-xs font-normal">
                /mois
              </span>
            </span>
          )}
        </span>
        <Bar
          className="h-2"
          max={goal.target}
          parts={[
            {
              cents: Math.min(goal.current, goal.target),
              color: reached ? 'bg-chart-delta-good' : 'bg-primary',
            },
          ]}
        />
        {!reached && (
          <span className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs tabular-nums">
            <span className="whitespace-nowrap">
              {fmt0(goal.current)} / {fmt0(goal.target)}
            </span>
            <span
              className={cn(
                'flex items-center gap-1 font-medium whitespace-nowrap',
                late ? TONE_TEXT.bad : TONE_TEXT.good,
              )}
              title={`Échéance ${monthShort(goal.deadline!)}`}
            >
              <When aria-hidden className="size-3.5" />
              {monthShort(goal.projected!)}
            </span>
          </span>
        )}
      </button>
    </li>
  )
}

/** The goals: what they need per month together, the margin, each goal. */
function Goals({ f }: { f: MonthFigures }) {
  const needed = sum(
    GOALS.map((g) => (g.current >= g.target ? 0 : (g.needed ?? 0))),
  )
  const margin = f.average - needed
  return (
    <Card>
      <CardTitle>Objectifs</CardTitle>
      <div className="grid grid-cols-2 gap-2">
        <Stat value={fmt0(needed)} label="par mois" />
        <Stat
          value={signed0(margin)}
          label="de marge"
          tone={margin >= 0 ? 'good' : 'bad'}
        />
      </div>
      <ul className="space-y-1">
        {GOALS.map((g) => (
          <GoalRow key={g.name} goal={g} />
        ))}
      </ul>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * What is held
 * ------------------------------------------------------------------------- */

/** The stock: total once, the result, the split, a short list. */
function Stock() {
  const all = [...SAVINGS_ACCOUNTS, ...INVESTMENTS].sort(
    (a, b) => b.value - a.value,
  )
  return (
    <Card>
      <CardTitle>Livrets et placements</CardTitle>
      <div className="-mt-1 space-y-0.5">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {fmt0(STOCK_TOTAL)}
        </p>
        <p className="text-chart-delta-good text-sm font-medium">
          {signed0(RESULT)}{' '}
          <span className="text-muted-foreground font-normal">de résultat</span>
        </p>
      </div>
      <div className="space-y-2">
        <Bar
          className="h-3"
          max={STOCK_TOTAL}
          parts={[
            { cents: SAVINGS_TOTAL, color: 'bg-emerald-500' },
            { cents: INVESTMENTS_TOTAL, color: 'bg-violet-500' },
          ]}
        />
        <Row label="Livrets" value={fmt0(SAVINGS_TOTAL)} dot="bg-emerald-500" />
        <Row
          label="Placements"
          value={fmt0(INVESTMENTS_TOTAL)}
          dot="bg-violet-500"
        />
      </div>
      <div className="border-t pt-1">
        <ul className="-mx-2">
          {all.slice(0, 3).map((a) => (
            <li key={a.name}>
              <button
                type="button"
                className="hover:bg-muted/60 flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm"
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full',
                    a.tint,
                  )}
                >
                  <a.icon aria-hidden className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium break-normal">{a.name}</span>
                  <span className="ml-auto whitespace-nowrap tabular-nums">
                    {fmt0(a.value)}
                    {a.gainRate !== undefined && (
                      <span className="text-chart-delta-good ml-1.5 text-xs">
                        +{(a.gainRate * 100).toFixed(1).replace('.', ',')} %
                      </span>
                    )}
                  </span>
                </span>
                <ChevronRightIcon
                  aria-hidden
                  className="text-muted-foreground size-4 shrink-0"
                />
              </button>
            </li>
          ))}
        </ul>
        <LinkRow>Voir les {all.length} comptes</LinkRow>
      </div>
    </Card>
  )
}

/** Where the money went over 12 months: one bar, one row per account. */
function Moved12() {
  const total = sum(MOVED_12.map((x) => x.cents))
  const saved = sum(MONTHS.filter((x) => x.complete).map((x) => x.net))
  return (
    <Card>
      <CardTitle end={<Chip tone="neutral">12 mois</Chip>}>
        Mis de côté
      </CardTitle>
      <p className="-mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {fmt0(total)}
      </p>
      <div className="space-y-2">
        <Bar
          className="h-3 gap-0.5"
          max={total}
          parts={MOVED_12.map((x) => ({ cents: x.cents, color: x.color }))}
        />
        {MOVED_12.map((x) => (
          <Row
            key={x.name}
            label={x.name}
            value={signed0(x.cents)}
            dot={x.color}
          />
        ))}
      </div>
      <div className="border-t pt-3">
        <Row
          label="Compte courant"
          value={signed0(saved - total)}
          tone={saved < total ? 'bad' : 'neutral'}
        />
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * The page
 * ------------------------------------------------------------------------- */

function SavingsBody({ f, wide }: { f: MonthFigures; wide: boolean }) {
  // The month is moved with the month bar: no chart of the months here.
  const held = <Stock />
  const goals = <Goals f={f} />
  const moved12 = <Moved12 />
  return (
    <div className="space-y-4">
      <div className={cn('grid items-start gap-4', wide && 'grid-cols-2')}>
        <MonthHero f={f} />
        <MovedThisMonth f={f} />
      </div>
      <h2 className="px-1 pt-2 text-lg font-semibold tracking-tight">
        Ce que vous avez
      </h2>
      {wide ? (
        <div className="grid grid-cols-2 items-start gap-4">
          {held}
          <div className="space-y-4">
            {goals}
            {moved12}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {held}
          {goals}
          {moved12}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Frame
 * ------------------------------------------------------------------------- */

interface FrameArgs {
  scenario: Scenario
  width: number
}

const NAV: { title: string; items: [string, LucideIcon][] }[] = [
  {
    title: 'Suivi',
    items: [
      ['Tableau de bord', LayoutDashboardIcon],
      ['Dépenses', ChartPieIcon],
      ['Budget', TargetIcon],
      ['Revue du mois', CalendarCheckIcon],
    ],
  },
  {
    title: 'Patrimoine',
    items: [
      ['Comptes', LandmarkIcon],
      ['Épargne', PiggyBankIcon],
      ['Crypto', BitcoinIcon],
      ['Entre proches', HandCoinsIcon],
    ],
  },
  {
    title: 'Outils',
    items: [
      ['Abonnements', RepeatIcon],
      ['Import', UploadIcon],
    ],
  },
]

const ICON_BUTTON =
  'relative flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted/70 [&_svg]:size-[1.1rem]'

function Header({ phone }: { phone: boolean }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-(--header-bg) px-2 backdrop-blur-lg">
      {phone && (
        <span className={ICON_BUTTON}>
          <MenuIcon />
        </span>
      )}
      <span className="flex items-center gap-2 px-1 font-semibold tracking-tight">
        <span className="from-primary size-6 rounded-md bg-gradient-to-br to-sky-400" />
        Finances
      </span>
      <span className="ml-auto flex items-center gap-1">
        <span className={cn(ICON_BUTTON, 'bg-secondary')}>
          <EllipsisVerticalIcon />
        </span>
        <span className="bg-primary text-primary-foreground ml-1 flex size-7 items-center justify-center rounded-full text-xs font-semibold">
          CD
        </span>
      </span>
    </header>
  )
}

function MonthBar({
  f,
  onPrevious,
  onNext,
  phone,
}: {
  f: MonthFigures
  onPrevious: () => void
  onNext: () => void
  phone: boolean
}) {
  const round =
    'flex size-8 items-center justify-center rounded-full bg-foreground/10 disabled:opacity-35 [&_svg]:size-[1.1rem]'
  return (
    <div
      className={cn(
        'sticky top-0 z-10 flex h-12 items-center border-b bg-(--header-bg) px-2 backdrop-blur-lg',
        phone ? 'justify-between' : 'justify-center gap-2',
      )}
    >
      <button
        type="button"
        aria-label="Mois précédent"
        className={round}
        onClick={onPrevious}
        disabled={f.index === 0}
      >
        <ChevronLeftIcon />
      </button>
      <span
        className={cn(
          'flex items-center justify-center gap-1.5 font-semibold',
          !phone && 'w-[12rem]',
        )}
      >
        <CalendarIcon aria-hidden className="text-muted-foreground size-4" />
        {monthLong(f.month.month)}
      </span>
      <button
        type="button"
        aria-label="Mois suivant"
        className={round}
        onClick={onNext}
        disabled={f.index === MONTHS.length - 1}
      >
        <ChevronRightIcon />
      </button>
    </div>
  )
}

function Sidebar() {
  return (
    <nav className="bg-sidebar w-[12rem] shrink-0 space-y-3 overflow-y-auto border-r p-2 text-sm">
      {NAV.map((group) => (
        <div key={group.title} className="space-y-0.5">
          <p className="text-muted-foreground px-2 py-1 text-xs">
            {group.title}
          </p>
          {group.items.map(([label, Icon]) => (
            <span
              key={label}
              className={cn(
                'flex min-h-8 items-center gap-2 rounded-lg px-2',
                label === 'Épargne' && 'bg-primary/10 text-primary font-medium',
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
  const width = Number(args.width)
  const phone = width < 768
  const target = args.scenario === 'noTarget' ? null : TARGET
  const start = MONTHS.findIndex(
    (x) => x.month === SCENARIO_MONTH[args.scenario],
  )
  const [index, setIndex] = useState(start)
  useEffect(() => setIndex(start), [start])
  const f = figures(index, target)

  return (
    <div
      data-frame
      style={{ width, height: phone ? 844 : 900 }}
      className="bg-background text-foreground relative flex shrink-0 flex-col overflow-hidden rounded-xl border shadow-sm"
    >
      <Header phone={phone} />
      <div className="flex min-h-0 flex-1">
        {!phone && <Sidebar />}
        <main
          className={cn(
            '@container min-w-0 flex-1 overflow-y-auto',
            phone && '[scrollbar-width:none]',
          )}
        >
          <MonthBar
            f={f}
            phone={phone}
            onPrevious={() => setIndex(Math.max(index - 1, 0))}
            onNext={() => setIndex(Math.min(index + 1, MONTHS.length - 1))}
          />
          <div
            className={cn(
              'w-full',
              phone ? 'space-y-4 px-4 py-5' : 'space-y-5 px-6 py-6',
            )}
          >
            <header className="space-y-1">
              <h1
                className={cn(
                  'font-semibold tracking-tight',
                  phone ? 'text-xl' : 'text-2xl',
                )}
              >
                Épargne
              </h1>
              {/* The app's `PeriodNote`, only while the month runs. */}
              {f.partial && (
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <CalendarClockIcon
                    aria-hidden
                    className="size-3.5 shrink-0"
                  />
                  Au {TODAY_DAY} nov., comparé au 1–{TODAY_DAY} oct.
                </p>
              )}
            </header>
            <SavingsBody f={f} wide={!phone} />
          </div>
        </main>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const Prototype: StoryObj<FrameArgs> = {
  name: 'Une page',
  args: { scenario: 'above', width: 390 },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 min-h-screen p-4">
        <Frame {...args} />
      </div>
    </AppScale>
  ),
}

/** The four scenarios side by side, at one width. */
export const Scenarios: StoryObj<FrameArgs> = {
  name: 'Les quatre cas',
  args: { scenario: 'above', width: 390 },
  argTypes: { scenario: { table: { disable: true } } },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 flex min-h-screen flex-wrap gap-4 p-4">
        {(['above', 'below', 'partial', 'noTarget'] as const).map(
          (scenario) => (
            <div key={scenario} className="space-y-1.5">
              <p className="text-sm font-semibold">
                {SCENARIO_LABELS[scenario]}
              </p>
              <Frame {...args} scenario={scenario} />
            </div>
          ),
        )}
      </div>
    </AppScale>
  ),
}

const SCENARIO_LABELS: Record<Scenario, string> = {
  above: 'Au-dessus de la cible',
  below: 'Sous la cible',
  partial: 'Mois en cours',
  noTarget: 'Sans cible',
}
