import type { Meta, StoryObj } from '@storybook/react-vite'
import { SegmentedControl, SegmentedControlItem, cn } from '@finances/ui'
import {
  BitcoinIcon,
  BriefcaseIcon,
  CalendarCheckIcon,
  CalendarIcon,
  ChartLineIcon,
  ChartPieIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  FlagIcon,
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
 * Prototypes of the Épargne page (#407): a page that says at a glance where
 * the owner stands. Clickable mockups with synthetic figures, not app code.
 *
 * Words (one per idea, proposed in #407, to validate):
 * - « Épargné »: the month's flow, income − expenses (transfers between own
 *   accounts excluded), with « Taux d’épargne » its share of the income and
 *   « Cible » the monthly target.
 * - « Mis de côté »: what was moved out of the checking account to the
 *   savings accounts and investments (the transfers).
 * - « Livrets et placements »: what is held there, the stock.
 *
 * A. Jauge: the month's verdict on top (figure, gauge against the target,
 *   the gap and the rate), the months as bars coloured by the target, then
 *   « Mis de côté », then « Ce que vous avez » (stock, goals).
 * B. Deux côtés: « Chaque mois » / « Ce que j’ai » as two tabs on a phone,
 *   two columns on a computer; the month as a ring around its target.
 * C. En clair: the month told in three sentences with its figures, the
 *   12 months as tiles, every card opening with one sentence.
 *
 * Common: one average (6 full months, one-offs excluded, the one the goals
 * use), the stock total once, the accounts list short with « Voir les
 * comptes », each goal with what it needs per month. A partial month is
 * compared with the same days of the month before and gets no verdict
 * until it ends.
 */
const meta: Meta<FrameArgs> = {
  title: 'Prototypes/Épargne (#407)',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
  argTypes: {
    direction: { control: 'inline-radio', options: ['A', 'B', 'C'] },
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
    tab: {
      control: 'inline-radio',
      options: ['flow', 'stock'],
      labels: { flow: 'Chaque mois', stock: 'Ce que j’ai' },
      description: 'B on a phone only',
    },
  },
}

export default meta

type Direction = 'A' | 'B' | 'C'
type Scenario = 'above' | 'below' | 'partial' | 'noTarget'
type Tab = 'flow' | 'stock'

interface FrameArgs {
  direction: Direction
  scenario: Scenario
  width: number
  tab: Tab
}

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
const INVESTED = INVESTMENTS_TOTAL - RESULT

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

interface MonthFigures {
  month: Month
  index: number
  target: number | null
  partial: boolean
  rate: number | null
  /** 6 full months before, one-offs excluded. */
  average: number
  averageFrom: string
  averageTo: string
  /** The month before (its same first days while in progress). */
  previousNet: number
  /** The last full month, for a partial month's reminder. */
  lastFull: Month
  /** Last 6 full months (before and including this one when full). */
  recent: Month[]
  moved: number
  verdict: Verdict
}

type Tone = 'good' | 'bad' | 'neutral'
interface Verdict {
  label: string
  tone: Tone
  /** « +254 € au-dessus de la cible », « −322 € sous la cible »… */
  gap: string | null
}

function figures(index: number, target: number | null): MonthFigures {
  const month = MONTHS[index]!
  const partial = !month.complete
  const full = MONTHS.slice(0, index).filter((x) => x.complete)
  const window = full.slice(-6)
  const average = Math.round(
    sum(window.map((x) => x.net - x.oneOff)) / Math.max(window.length, 1),
  )
  const previousNet = partial
    ? OCTOBER_SO_FAR.net
    : (MONTHS[index - 1]?.net ?? 0)
  const lastFull = full[full.length - 1] ?? month
  const recent = MONTHS.slice(0, index + (partial ? 0 : 1))
    .filter((x) => x.complete)
    .slice(-6)
  const rate = month.income > 0 ? month.net / month.income : null
  return {
    month,
    index,
    target,
    partial,
    rate: partial ? null : rate,
    average,
    averageFrom: window[0]?.month ?? month.month,
    averageTo: window[window.length - 1]?.month ?? month.month,
    previousNet,
    lastFull,
    recent,
    moved: month.movedSavings + month.movedInvestments,
    verdict: verdictOf(month.net, target, partial, average),
  }
}

function verdictOf(
  net: number,
  target: number | null,
  partial: boolean,
  average: number,
): Verdict {
  if (partial) return { label: 'En cours', tone: 'neutral', gap: null }
  if (target === null) {
    const gap = net - average
    return {
      label: gap >= 0 ? 'Au-dessus de la moyenne' : 'Sous la moyenne',
      tone: 'neutral',
      gap: `${signed0(gap)} ${gap >= 0 ? 'au-dessus de' : 'sous'} votre moyenne`,
    }
  }
  const gap = net - target
  return gap >= 0
    ? {
        label: 'Cible atteinte',
        tone: 'good',
        gap: `${signed0(gap)} au-dessus de la cible`,
      }
    : {
        label: 'Sous la cible',
        tone: 'bad',
        gap: `${signed0(gap)} sous la cible`,
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
const monthAbbr = (month: string) => abbr.format(asDate(month)).replace('.', '')

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-chart-delta-good',
  bad: 'text-chart-delta-bad',
  neutral: 'text-muted-foreground',
}

/* ---------------------------------------------------------------------------
 * Shared pieces
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
        'bg-card text-card-foreground min-w-0 space-y-3 rounded-xl border p-4 shadow-xs',
        className,
      )}
    >
      {children}
    </section>
  )
}

function CardTitle({
  children,
  end,
  description,
}: {
  children: ReactNode
  end?: ReactNode
  description?: ReactNode
}) {
  return (
    <header className="space-y-0.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-semibold">{children}</h2>
        {end}
      </div>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
    </header>
  )
}

function SectionTitle({
  children,
  description,
}: {
  children: ReactNode
  description?: ReactNode
}) {
  return (
    <header className="space-y-0.5 px-1 pt-2">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {description && (
        <p className="text-muted-foreground text-sm">{description}</p>
      )}
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

function OutlineButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="hover:bg-muted/60 inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium"
    >
      {children}
    </button>
  )
}

/** « Moyenne 944 € par mois, de mai à oct., hors ponctuels » */
function averageText(f: MonthFigures) {
  return `${fmt0(f.average)} par mois en moyenne (${monthAbbr(f.averageFrom)} – ${monthAbbr(f.averageTo)}, hors ponctuels)`
}

/** Six dots, reached or not, and « Cible atteinte 5 mois sur 6 ». */
function ReachedDots({ f }: { f: MonthFigures }) {
  if (f.target === null || f.recent.length === 0) return null
  const target = f.target
  const reached = f.recent.filter((x) => x.net >= target).length
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <ol
        aria-label="Derniers mois complets"
        className="flex items-center gap-1"
      >
        {f.recent.map((x) => (
          <li
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
      </ol>
      <span className="text-muted-foreground">
        Cible atteinte{' '}
        <span className="text-foreground font-medium">
          {reached} mois sur {f.recent.length}
        </span>
      </span>
    </div>
  )
}

/** One-off line of a month that has one. */
function OneOffNote({ f }: { f: MonthFigures }) {
  const { oneOff, oneOffLabel, net } = f.month
  if (oneOff === 0) return null
  return (
    <p className="text-muted-foreground text-xs">
      {oneOff < 0 ? 'Dont une dépense ponctuelle' : 'Dont un revenu ponctuel'} (
      {oneOffLabel}, {fmt0(oneOff)}) : {fmt0(net - oneOff)} sans elle.
    </p>
  )
}

/** The partial month: the same days of the month before, and the last verdict. */
function PartialNote({ f }: { f: MonthFigures }) {
  const ahead = f.month.net - f.previousNet
  const last = f.lastFull
  const reached = f.target !== null && last.net >= f.target
  return (
    <div className="text-muted-foreground space-y-1 text-sm">
      <p>
        Au {TODAY_DAY} {monthAbbr(last.month)}., vous en étiez à{' '}
        <span className="text-foreground font-medium">
          {fmt0(f.previousNet)}
        </span>{' '}
        :{' '}
        <span
          className={cn(
            'font-medium',
            ahead >= 0 ? TONE_TEXT.good : TONE_TEXT.bad,
          )}
        >
          {signed0(ahead)} {ahead >= 0 ? 'd’avance' : 'de retard'}
        </span>
        .
      </p>
      <p className="text-xs">
        Le verdict à la fin du mois. {capitalize(monthName(last.month))} :{' '}
        {fmt0(last.net)}
        {f.target !== null &&
          (reached ? ', cible atteinte.' : ', sous la cible.')}
      </p>
    </div>
  )
}

/**
 * The months as bars: green when the target is reached, grey below it, the
 * month shown outlined, the month in progress hatched; the target as a
 * dashed line. Tapping a bar would show it.
 */
function MonthBars({
  f,
  onSelect,
  height = 120,
}: {
  f: MonthFigures
  onSelect: (index: number) => void
  height?: number
}) {
  const values = MONTHS.map((x) => x.net)
  const max = Math.max(...values, f.target ?? 0, f.average)
  const min = Math.min(0, ...values)
  const span = max - min
  const y = (v: number) => ((max - v) / span) * height
  const zero = y(0)
  const reference = f.target ?? f.average
  return (
    <div className="@container space-y-1">
      <div className="relative" style={{ height }}>
        <div
          aria-hidden
          className="bg-border absolute inset-x-0 h-px"
          style={{ top: zero }}
        />
        <div
          aria-hidden
          className="border-foreground/60 absolute inset-x-0 z-10 border-t border-dashed"
          style={{ top: y(reference) }}
        >
          <span className="bg-card text-muted-foreground absolute -top-[1.1rem] left-0 z-10 rounded px-1 text-[11px] leading-4">
            {f.target === null ? 'Moyenne' : 'Cible'} {fmt0(reference)}
          </span>
        </div>
        <div className="absolute inset-0 flex items-stretch gap-[3px]">
          {MONTHS.map((x, i) => {
            const top = y(Math.max(x.net, 0))
            const bottom = y(Math.min(x.net, 0))
            const good = f.target !== null && x.complete && x.net >= f.target
            return (
              <button
                key={x.month}
                type="button"
                aria-label={`${monthLong(x.month)} : ${fmt0(x.net)}`}
                onClick={() => onSelect(i)}
                className="relative flex-1 rounded-sm outline-none focus-visible:ring-2"
              >
                <span
                  className={cn(
                    'absolute inset-x-0 rounded-[3px]',
                    !x.complete
                      ? 'bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_2px,transparent_2px_5px)] opacity-50'
                      : good
                        ? 'bg-chart-delta-good'
                        : x.net < 0
                          ? 'bg-chart-delta-bad'
                          : f.target === null
                            ? 'bg-chart-savings'
                            : 'bg-muted-foreground/35',
                    i === f.index &&
                      'ring-foreground ring-offset-card ring-2 ring-offset-1',
                  )}
                  style={{ top, height: Math.max(bottom - top, 2) }}
                />
              </button>
            )
          })}
        </div>
      </div>
      <div className="text-muted-foreground flex gap-[3px] text-[10px] leading-4">
        {MONTHS.map((x, i) => (
          <span
            key={x.month}
            className={cn(
              'flex-1 text-center',
              i === f.index && 'text-foreground font-semibold',
              // Every other label on a narrow card.
              i % 2 === 1 && i !== f.index && '@max-[20rem]:invisible',
            )}
          >
            {monthAbbr(x.month)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** « Mis de côté » this month: saved → put aside, and what stayed or was taken. */
function MovedThisMonth({
  f,
  compact,
}: {
  f: MonthFigures
  compact?: boolean
}) {
  const { net, movedSavings, movedInvestments } = f.month
  const moved = movedSavings + movedInvestments
  const rest = net - moved
  const max = Math.max(net, moved, 1)
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <BarLine
          label="Épargné"
          cents={net}
          ratio={Math.max(net, 0) / max}
          color="bg-chart-savings"
        />
        <BarLine
          label="Mis de côté"
          cents={moved}
          ratio={moved / max}
          parts={[
            { ratio: movedSavings / max, color: 'bg-emerald-500' },
            { ratio: movedInvestments / max, color: 'bg-violet-500' },
          ]}
        />
      </div>
      {!compact && (
        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" /> Livret A{' '}
            <span className="text-foreground font-medium">
              {fmt0(movedSavings)}
            </span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-violet-500" /> Placements{' '}
            <span className="text-foreground font-medium">
              {fmt0(movedInvestments)}
            </span>
          </li>
        </ul>
      )}
      <p className="text-sm">
        {f.partial
          ? `${fmt0(moved)} mis de côté à ce jour.`
          : rest >= 0
            ? `${fmt0(rest)} sont restés sur le compte courant.`
            : `${fmt0(-rest)} ont été pris sur le compte courant.`}
      </p>
    </div>
  )
}

function BarLine({
  label,
  cents,
  ratio,
  color,
  parts,
}: {
  label: string
  cents: number
  ratio: number
  color?: string
  parts?: { ratio: number; color: string }[]
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium whitespace-nowrap tabular-nums">
          {fmt0(cents)}
        </span>
      </div>
      <div className="bg-muted flex h-2.5 overflow-hidden rounded-full">
        {parts ? (
          parts.map((p, i) => (
            <span
              key={i}
              className={cn('h-full', p.color)}
              style={{ width: `${p.ratio * 100}%` }}
            />
          ))
        ) : (
          <span
            className={cn('h-full rounded-full', color)}
            style={{ width: `${ratio * 100}%` }}
          />
        )}
      </div>
    </div>
  )
}

/** The stock: total once, its split, invested and result, a short list. */
function StockSummary({ sentence }: { sentence?: boolean }) {
  const savingsRatio = SAVINGS_TOTAL / STOCK_TOTAL
  return (
    <div className="space-y-3">
      {sentence ? (
        <p className="text-base leading-relaxed">
          Vous avez <strong className="text-lg">{fmt0(STOCK_TOTAL)}</strong> sur
          vos livrets et placements, dont{' '}
          <strong className="text-chart-delta-good">{signed0(RESULT)}</strong>{' '}
          de résultat sur ce que vous y avez investi.
        </p>
      ) : (
        <div className="space-y-0.5">
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {fmt0(STOCK_TOTAL)}
          </p>
          <p className="text-sm">
            <span className="text-chart-delta-good font-medium">
              résultat {signed0(RESULT)}
            </span>{' '}
            <span className="text-muted-foreground">
              · investi {fmt0(INVESTED)}
            </span>
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        <div className="flex h-3 overflow-hidden rounded-full">
          <span
            className="h-full bg-emerald-500"
            style={{ width: `${savingsRatio * 100}%` }}
          />
          <span
            className="h-full bg-violet-500"
            style={{ width: `${(1 - savingsRatio) * 100}%` }}
          />
        </div>
        <ul className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs">
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">Livrets</span>
            <span className="font-medium">{fmt0(SAVINGS_TOTAL)}</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-violet-500" />
            <span className="text-muted-foreground">Placements</span>
            <span className="font-medium">{fmt0(INVESTMENTS_TOTAL)}</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

function AccountRows({ limit = 3 }: { limit?: number }) {
  const all = [...SAVINGS_ACCOUNTS, ...INVESTMENTS].sort(
    (a, b) => b.value - a.value,
  )
  return (
    <div>
      <ul className="-mx-2">
        {all.slice(0, limit).map((a) => (
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
              {/* The figures go under the name when both don't fit. */}
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
  )
}

/** Where the money went over 12 months, one bar split by account. */
function Moved12() {
  const total = sum(MOVED_12.map((x) => x.cents))
  const saved = sum(MONTHS.filter((x) => x.complete).map((x) => x.net))
  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Mis de côté sur 12 mois</span>
        <span className="font-medium whitespace-nowrap">{fmt0(total)}</span>
      </div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {MOVED_12.map((x) => (
          <span
            key={x.name}
            className={cn('h-full', x.color)}
            style={{ width: `${(x.cents / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="space-y-1 text-sm">
        {MOVED_12.map((x) => (
          <li key={x.name} className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', x.color)} />
            <span className="flex-1">{x.name}</span>
            <span className="tabular-nums">{signed0(x.cents)}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        Sur la même période, vous avez épargné {fmt0(saved)} :{' '}
        {saved >= total
          ? `${fmt0(saved - total)} sont restés sur le compte courant.`
          : `${fmt0(total - saved)} ont été pris sur le compte courant.`}
      </p>
    </div>
  )
}

/** One goal: name and status, bar, what it needs per month and when. */
function GoalRow({ goal, sentence }: { goal: Goal; sentence?: boolean }) {
  const reached = goal.current >= goal.target
  const ratio = Math.min(goal.current / goal.target, 1)
  const late =
    goal.deadline !== null &&
    goal.projected !== null &&
    goal.projected > goal.deadline
  return (
    <li>
      <button
        type="button"
        className="hover:bg-muted/60 -mx-2 block w-[calc(100%+1rem)] space-y-1.5 rounded-lg px-2 py-2 text-left text-sm"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-medium">{goal.name}</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {reached
              ? `${fmt0(goal.current)}`
              : `${fmt0(goal.current)} sur ${fmt0(goal.target)}`}
          </span>
        </span>
        <span className="bg-muted block h-2 overflow-hidden rounded-full">
          <span
            className={cn(
              'block h-full rounded-full',
              reached ? 'bg-chart-delta-good' : 'bg-primary',
            )}
            style={{ width: `${ratio * 100}%` }}
          />
        </span>
        {reached ? (
          <span className="text-chart-delta-good flex items-center gap-1 text-xs font-medium">
            <CheckIcon aria-hidden className="size-3" /> Atteint
          </span>
        ) : sentence ? (
          <span className="text-muted-foreground block text-xs">
            Il faut{' '}
            <strong className="text-foreground">
              {fmt0(goal.needed ?? 0)} par mois
            </strong>{' '}
            pour {monthShort(goal.deadline!)} ; à votre rythme, atteint en{' '}
            <strong className={late ? TONE_TEXT.bad : 'text-foreground'}>
              {monthShort(goal.projected!)}
            </strong>
            .
          </span>
        ) : (
          <span className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs">
            <span>
              <strong className="text-foreground">
                {fmt0(goal.needed ?? 0)}/mois
              </strong>{' '}
              pour {monthShort(goal.deadline!)}
            </span>
            <span className={late ? TONE_TEXT.bad : TONE_TEXT.good}>
              à ce rythme : {monthShort(goal.projected!)}
            </span>
          </span>
        )}
      </button>
    </li>
  )
}

/** Goals, opening with what they need together against the average. */
function GoalsCard({ f, sentence }: { f: MonthFigures; sentence?: boolean }) {
  const needed = sum(
    GOALS.map((g) => (g.current >= g.target ? 0 : (g.needed ?? 0))),
  )
  const margin = f.average - needed
  return (
    <Card>
      <CardTitle
        end={
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <FlagIcon aria-hidden className="size-3" /> 3 objectifs
          </span>
        }
      >
        Objectifs
      </CardTitle>
      <p className="text-sm">
        Ensemble, ils demandent <strong>{fmt0(needed)} par mois</strong>. Vous
        épargnez <strong>{fmt0(f.average)}</strong> en moyenne :{' '}
        <span
          className={cn(
            'font-medium',
            margin >= 0 ? TONE_TEXT.good : TONE_TEXT.bad,
          )}
        >
          {margin >= 0
            ? `${fmt0(margin)} de marge`
            : `il manque ${fmt0(-margin)}`}
        </span>
        .
      </p>
      <ul className="space-y-1">
        {GOALS.map((g) => (
          <GoalRow key={g.name} goal={g} sentence={sentence} />
        ))}
      </ul>
    </Card>
  )
}

/** « Fixer une cible » for a month without a target. */
function NoTargetAction() {
  return (
    <OutlineButton>
      <TargetIcon aria-hidden className="size-4" /> Fixer une cible
    </OutlineButton>
  )
}

/* ---------------------------------------------------------------------------
 * A. Jauge
 * ------------------------------------------------------------------------- */

/**
 * The verdict: « Épargné en octobre » 854 €, its status, a gauge with the
 * target as a mark, the gap and the rate; then the average and the dots.
 */
function GaugeHero({ f }: { f: MonthFigures }) {
  const { net } = f.month
  const reference = f.target ?? f.average
  const scale = Math.max(reference * 1.6, net * 1.1, 1)
  const fill = Math.max(net, 0) / scale
  const mark = reference / scale
  const tone = f.verdict.tone
  return (
    <Card className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-sm font-medium">
          {f.partial
            ? `Épargné à ce jour · au ${TODAY_DAY} ${monthAbbr(f.month.month)}.`
            : `Épargné en ${monthName(f.month.month)}`}
        </h2>
        <Chip tone={tone}>{f.verdict.label}</Chip>
      </header>
      <div className="space-y-1">
        <p
          className={cn(
            'text-[2.6rem] leading-none font-semibold tracking-tight tabular-nums',
            net < 0 && 'text-chart-delta-bad',
          )}
        >
          {fmt0(net)}
        </p>
        {!f.partial && (
          <p className="text-sm">
            {f.verdict.gap && (
              <span
                className={cn(
                  'font-medium',
                  TONE_TEXT[tone === 'neutral' ? 'neutral' : tone],
                )}
              >
                {f.verdict.gap}
              </span>
            )}
            {f.rate !== null && (
              <span className="text-muted-foreground">
                {' '}
                · {pct(f.rate)} de vos revenus
              </span>
            )}
          </p>
        )}
      </div>
      {/* The gauge: the month's savings against its target. */}
      <div className="space-y-1 pt-3">
        <div className="relative">
          <div className="bg-muted h-3.5 overflow-hidden rounded-full">
            <div
              className={cn(
                'h-full rounded-full',
                f.partial
                  ? 'bg-primary/60'
                  : tone === 'good'
                    ? 'bg-chart-delta-good'
                    : tone === 'bad'
                      ? 'bg-chart-delta-bad'
                      : 'bg-chart-savings',
              )}
              style={{ width: `${Math.min(fill, 1) * 100}%` }}
            />
          </div>
          <div
            aria-hidden
            className="bg-foreground absolute -top-1.5 h-[calc(100%+0.75rem)] w-0.5 rounded-full"
            style={{ left: `${mark * 100}%` }}
          />
          <span
            className="text-muted-foreground absolute -top-5 -translate-x-1/2 text-[11px] whitespace-nowrap"
            style={{ left: `${mark * 100}%` }}
          >
            {f.target === null ? 'Moyenne' : 'Cible'} {fmt0(reference)}
          </span>
        </div>
      </div>
      {f.partial ? <PartialNote f={f} /> : <OneOffNote f={f} />}
      <div className="space-y-1.5 border-t pt-3">
        {f.target !== null && <ReachedDots f={f} />}
        <p className="text-muted-foreground text-xs">{averageText(f)}</p>
      </div>
      {f.target === null && <NoTargetAction />}
    </Card>
  )
}

function DirectionA({ f, select, wide }: Body) {
  return (
    <div className="space-y-4">
      <div className={cn('grid items-start gap-4', wide && 'grid-cols-2')}>
        <GaugeHero f={f} />
        <Card>
          <CardTitle description="Revenus moins dépenses, virements entre vos comptes exclus.">
            Épargné par mois
          </CardTitle>
          <MonthBars f={f} onSelect={select} />
        </Card>
      </div>
      <div className={cn('grid items-start gap-4', wide && 'grid-cols-2')}>
        <Card>
          <CardTitle
            description={`Ce qui a quitté le compte courant pour vos livrets et placements en ${monthName(f.month.month)}.`}
          >
            Mis de côté
          </CardTitle>
          <MovedThisMonth f={f} />
        </Card>
        <GoalsCard f={f} />
      </div>
      <SectionTitle description="Aujourd’hui, sur vos livrets et placements.">
        Ce que vous avez
      </SectionTitle>
      <div className={cn('grid items-start gap-4', wide && 'grid-cols-2')}>
        <Card>
          <CardTitle>Livrets et placements</CardTitle>
          <StockSummary />
          <AccountRows />
        </Card>
        <Card>
          <CardTitle description="Les virements vers vos livrets et placements.">
            Où va l’argent mis de côté
          </CardTitle>
          <Moved12 />
        </Card>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * B. Deux côtés
 * ------------------------------------------------------------------------- */

/** The month as a ring around its target, the figure inside it. */
function Ring({ f }: { f: MonthFigures }) {
  const { net } = f.month
  const reference = f.target ?? f.average
  const ratio = Math.max(net, 0) / reference
  const r = 52
  const c = 2 * Math.PI * r
  const tone = f.verdict.tone
  const stroke = f.partial
    ? 'stroke-primary/60'
    : tone === 'good'
      ? 'stroke-chart-delta-good'
      : tone === 'bad'
        ? 'stroke-chart-delta-bad'
        : 'stroke-chart-savings'
  return (
    <div className="relative size-[7.5rem] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle
          cx="60"
          cy="60"
          r={r}
          className="stroke-muted fill-none"
          strokeWidth="11"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          className={cn('fill-none', stroke)}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${Math.min(ratio, 1) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span
          className={cn(
            'text-xl leading-tight font-semibold tabular-nums',
            net < 0 && 'text-chart-delta-bad',
          )}
        >
          {fmt0(net)}
        </span>
        <span className="text-muted-foreground text-[11px] leading-tight">
          sur {fmt0(reference)}
        </span>
      </div>
    </div>
  )
}

function RingHero({ f }: { f: MonthFigures }) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Ring f={f} />
        <div className="min-w-[9rem] flex-1 space-y-1.5">
          <p className="text-muted-foreground text-sm">
            {f.partial
              ? `Épargné au ${TODAY_DAY} ${monthAbbr(f.month.month)}.`
              : `Épargné en ${monthName(f.month.month)}`}
          </p>
          <Chip tone={f.verdict.tone}>{f.verdict.label}</Chip>
          {!f.partial && f.verdict.gap && (
            <p className={cn('text-sm font-medium', TONE_TEXT[f.verdict.tone])}>
              {f.verdict.gap}
            </p>
          )}
          {f.rate !== null && (
            <p className="text-sm">
              <span className="font-semibold">{pct(f.rate)}</span>{' '}
              <span className="text-muted-foreground">de vos revenus</span>
            </p>
          )}
        </div>
      </div>
      {f.partial ? <PartialNote f={f} /> : <OneOffNote f={f} />}
      {f.target === null && <NoTargetAction />}
    </Card>
  )
}

/** The last 12 months as a row of small tiles. */
function MonthStrip({
  f,
  onSelect,
}: {
  f: MonthFigures
  onSelect: (i: number) => void
}) {
  return (
    <Card>
      <CardTitle description={averageText(f)}>12 derniers mois</CardTitle>
      <MonthBars f={f} onSelect={onSelect} height={96} />
      <ReachedDots f={f} />
    </Card>
  )
}

function FlowSide({ f, select }: Body) {
  return (
    <div className="space-y-4">
      <RingHero f={f} />
      <MonthStrip f={f} onSelect={select} />
      <Card>
        <CardTitle>Mis de côté en {monthName(f.month.month)}</CardTitle>
        <MovedThisMonth f={f} />
      </Card>
      <GoalsCard f={f} />
    </div>
  )
}

function StockSide() {
  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Livrets et placements</CardTitle>
        <StockSummary />
        <AccountRows limit={6} />
      </Card>
      <Card>
        <CardTitle description="Les virements vers vos livrets et placements.">
          Où va l’argent mis de côté
        </CardTitle>
        <Moved12 />
      </Card>
    </div>
  )
}

function DirectionB(props: Body & { tab: Tab; setTab: (tab: Tab) => void }) {
  const { wide, tab, setTab } = props
  if (wide) {
    return (
      <div className="grid grid-cols-2 items-start gap-6">
        <div className="space-y-3">
          <SectionTitle>Chaque mois</SectionTitle>
          <FlowSide {...props} />
        </div>
        <div className="space-y-3">
          <SectionTitle>Ce que j’ai</SectionTitle>
          <StockSide />
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <SegmentedControl
        value={tab}
        onValueChange={setTab}
        fullWidth
        aria-label="Vue"
      >
        <SegmentedControlItem value="flow">Chaque mois</SegmentedControlItem>
        <SegmentedControlItem value="stock">Ce que j’ai</SegmentedControlItem>
      </SegmentedControl>
      {tab === 'flow' ? <FlowSide {...props} /> : <StockSide />}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * C. En clair
 * ------------------------------------------------------------------------- */

function Strong({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return (
    <strong
      className={cn(
        'font-semibold whitespace-nowrap',
        tone && tone !== 'neutral' && TONE_TEXT[tone],
      )}
    >
      {children}
    </strong>
  )
}

/** The month in three sentences. */
function StoryHero({ f }: { f: MonthFigures }) {
  const { net, movedSavings, movedInvestments } = f.month
  const moved = movedSavings + movedInvestments
  const name = monthName(f.month.month)
  const tone = f.verdict.tone
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-sm font-medium">
          {f.partial
            ? `${capitalize(name)}, au ${TODAY_DAY}`
            : capitalize(name)}
        </h2>
        <Chip tone={tone}>{f.verdict.label}</Chip>
      </div>
      <div className="space-y-2.5 text-[1.05rem] leading-relaxed">
        {f.partial ? (
          <>
            <p>
              {net < 0 ? (
                <>
                  À ce jour, vos dépenses dépassent vos revenus de{' '}
                  <Strong tone="bad">{fmt0(-net)}</Strong>.
                </>
              ) : (
                <>
                  À ce jour, vous avez épargné <Strong>{fmt0(net)}</Strong>.
                </>
              )}{' '}
              Au même jour en {monthName(f.lastFull.month)}, vous étiez à{' '}
              <Strong>{fmt0(f.previousNet)}</Strong> : vous avez{' '}
              <Strong tone="good">{fmt0(net - f.previousNet)} d’avance</Strong>.
            </p>
            <p className="text-muted-foreground text-sm">
              Le verdict à la fin du mois. En {monthName(f.lastFull.month)},
              vous aviez épargné {fmt0(f.lastFull.net)}
              {f.target !== null && f.lastFull.net >= f.target
                ? ', cible atteinte.'
                : '.'}
            </p>
          </>
        ) : (
          <>
            <p>
              Vous avez épargné{' '}
              <Strong tone={tone === 'neutral' ? undefined : tone}>
                {fmt0(net)}
              </Strong>
              {f.rate !== null && (
                <>
                  , soit <Strong>{pct(f.rate)}</Strong> de vos revenus
                </>
              )}
              .
            </p>
            <p>
              {f.target === null ? (
                <>
                  C’est <Strong>{fmt0(Math.abs(net - f.average))}</Strong>{' '}
                  {net >= f.average ? 'de plus' : 'de moins'} que votre moyenne
                  ({fmt0(f.average)}).
                </>
              ) : net >= f.target ? (
                <>
                  C’est{' '}
                  <Strong tone="good">{fmt0(net - f.target)} de plus</Strong>{' '}
                  que votre cible de {fmt0(f.target)}.
                </>
              ) : (
                <>
                  Il manque <Strong tone="bad">{fmt0(f.target - net)}</Strong>{' '}
                  pour atteindre votre cible de {fmt0(f.target)}
                  {f.month.oneOff < 0 && (
                    <>
                      , à cause d’une dépense ponctuelle ({f.month.oneOffLabel},{' '}
                      {fmt0(-f.month.oneOff)})
                    </>
                  )}
                  .
                </>
              )}
            </p>
            <p>
              Vous en avez mis <Strong>{fmt0(moved)}</Strong> de côté
              {net - moved >= 0 ? (
                <>
                  {' '}
                  ; <Strong>{fmt0(net - moved)}</Strong> sont restés sur le
                  compte courant.
                </>
              ) : (
                <>
                  , dont <Strong tone="bad">{fmt0(moved - net)}</Strong> pris
                  sur le compte courant.
                </>
              )}
            </p>
          </>
        )}
      </div>
      {f.target === null && <NoTargetAction />}
    </Card>
  )
}

/** The 12 months as tiles: each one's figure in the colour of its verdict. */
function MonthTiles({
  f,
  onSelect,
  wide,
}: {
  f: MonthFigures
  onSelect: (i: number) => void
  wide: boolean
}) {
  return (
    <Card>
      <CardTitle description={averageText(f)}>Mois par mois</CardTitle>
      <ol className={cn('grid gap-1.5', wide ? 'grid-cols-6' : 'grid-cols-3')}>
        {MONTHS.map((x, i) => {
          const good = f.target !== null && x.complete && x.net >= f.target
          const bad =
            x.complete && (f.target === null ? x.net < 0 : x.net < f.target)
          return (
            <li key={x.month}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                className={cn(
                  'flex min-h-11 w-full flex-col items-start rounded-lg px-2 py-1.5 text-left',
                  good && 'bg-chart-delta-good/12',
                  bad && 'bg-chart-delta-bad/10',
                  !good && !bad && 'bg-muted',
                  i === f.index && 'ring-foreground ring-2',
                )}
              >
                <span className="text-muted-foreground text-[11px] leading-4">
                  {capitalize(monthAbbr(x.month))}
                  {!x.complete && ' · en cours'}
                </span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    good && 'text-chart-delta-good',
                    bad && 'text-chart-delta-bad',
                  )}
                >
                  {fmt0(x.net)}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <ReachedDots f={f} />
    </Card>
  )
}

function DirectionC({ f, select, wide }: Body) {
  return (
    <div className="space-y-4">
      <div className={cn('grid items-start gap-4', wide && 'grid-cols-2')}>
        <StoryHero f={f} />
        <MonthTiles f={f} onSelect={select} wide={wide} />
      </div>
      <div className={cn('grid items-start gap-4', wide && 'grid-cols-2')}>
        <Card>
          <CardTitle>Livrets et placements</CardTitle>
          <StockSummary sentence />
          <AccountRows />
        </Card>
        <GoalsCard f={f} sentence />
      </div>
      <Card>
        <CardTitle description="Les virements vers vos livrets et placements.">
          Où va l’argent mis de côté
        </CardTitle>
        <Moved12 />
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Frame
 * ------------------------------------------------------------------------- */

interface Body {
  f: MonthFigures
  select: (index: number) => void
  wide: boolean
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
  'relative flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted/70 disabled:opacity-35 [&_svg]:size-[1.1rem]'

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

/** The period note under the title, as `PeriodNote` says it. */
function periodNote(f: MonthFigures): string {
  if (f.partial) {
    return `Mois en cours : données jusqu’au ${TODAY_DAY} nov., comparées au 1–${TODAY_DAY} oct.`
  }
  return 'Mois complet.'
}

function Frame(args: FrameArgs) {
  const width = Number(args.width)
  const phone = width < 768
  const target = args.scenario === 'noTarget' ? null : TARGET
  const start = MONTHS.findIndex(
    (x) => x.month === SCENARIO_MONTH[args.scenario],
  )
  const [index, setIndex] = useState(start)
  const [tab, setTab] = useState<Tab>(args.tab)
  useEffect(() => setIndex(start), [start])
  useEffect(() => setTab(args.tab), [args.tab])
  const f = figures(index, target)
  const body: Body = { f, select: setIndex, wide: !phone }

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
              <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                <CalendarIcon aria-hidden className="mt-px size-3.5 shrink-0" />
                {periodNote(f)} Virements entre vos comptes exclus.
              </p>
            </header>
            {args.direction === 'A' && <DirectionA {...body} />}
            {args.direction === 'B' && (
              <DirectionB {...body} tab={tab} setTab={setTab} />
            )}
            {args.direction === 'C' && <DirectionC {...body} />}
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
  A: 'A. Jauge',
  B: 'B. Deux côtés',
  C: 'C. En clair',
}

export const Prototype: StoryObj<FrameArgs> = {
  name: 'Une page',
  args: { direction: 'A', scenario: 'above', width: 390, tab: 'flow' },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 min-h-screen p-4">
        <Frame {...args} />
      </div>
    </AppScale>
  ),
}

/** A, B and C side by side, on one scenario and one width. */
export const SideBySide: StoryObj<FrameArgs> = {
  name: 'Côte à côte',
  args: { direction: 'A', scenario: 'above', width: 390, tab: 'flow' },
  argTypes: { direction: { table: { disable: true } } },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 flex min-h-screen flex-wrap gap-4 p-4">
        {(['A', 'B', 'C'] as const).map((direction) => (
          <div key={direction} className="space-y-1.5">
            <p className="text-sm font-semibold">{LABELS[direction]}</p>
            <Frame {...args} direction={direction} />
          </div>
        ))}
      </div>
    </AppScale>
  ),
}
