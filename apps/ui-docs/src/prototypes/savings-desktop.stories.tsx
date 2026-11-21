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
 * Prototypes of the Épargne page **on a computer** (#407). The phone page
 * is built and approved (PR #415); on a computer the owner found its
 * figures too big and too few (« beaucoup d'éléments très gros, pas très
 * clair »). Three denser directions, same words and same figures as the
 * phone (Épargné, Cible, Mis de côté, Livrets et placements), synthetic
 * data, not app code:
 *
 * A. Une rangée de chiffres: the month as one row of five figures at a
 *   normal size (no tiles), a thin gauge under it; then full-width cards
 *   with every account and goal as a compact table row.
 * B. Chiffres puis deux colonnes: the same row of figures, then two
 *   columns of compact lists: the month's detail on the left (mis de côté,
 *   goals), what is held on the right (accounts).
 * C. Tableau de bord: eight small figure tiles in two rows (the month,
 *   then what is held), then tables (accounts, goals) full width.
 */
const meta: Meta<FrameArgs> = {
  title: 'Prototypes/Épargne sur ordinateur (#407)',
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
    width: { control: 'inline-radio', options: [1280, 1600] },
  },
}

export default meta

type Scenario = 'above' | 'below' | 'partial' | 'noTarget'
type Direction = 'A' | 'B' | 'C'

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

/* ---------------------------------------------------------------------------
 * Dense pieces for a computer
 * ------------------------------------------------------------------------- */

const ALL_ACCOUNTS = [
  ...SAVINGS_ACCOUNTS.map((a) => ({ ...a, kind: 'Livret' })),
  ...INVESTMENTS.map((a) => ({ ...a, kind: 'Placement' })),
].sort((a, b) => b.value - a.value)

function yearMoved() {
  const toSavings = sum(MONTHS.map((m) => m.movedSavings))
  const toInvestments = sum(MONTHS.map((m) => m.movedInvestments))
  const saved = sum(MONTHS.map((m) => m.net))
  return {
    toSavings,
    toInvestments,
    total: toSavings + toInvestments,
    checking: saved - toSavings - toInvestments,
  }
}

function goalsNeed() {
  return sum(GOALS.map((g) => (g.current >= g.target ? 0 : (g.needed ?? 0))))
}

/** A figure under its label, at a reading size, no tile. */
function Figure({
  label,
  value,
  tone = 'neutral',
  note,
  big,
}: {
  label: ReactNode
  value: ReactNode
  tone?: Tone
  note?: ReactNode
  big?: boolean
}) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="text-muted-foreground truncate text-xs">{label}</p>
      <p
        className={cn(
          'font-semibold whitespace-nowrap tabular-nums',
          big ? 'text-2xl leading-tight' : 'text-lg leading-tight',
          TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      {note && <p className="text-muted-foreground truncate text-xs">{note}</p>}
    </div>
  )
}

/** A small card holding one figure (direction C). */
function Tile({
  label,
  value,
  tone = 'neutral',
  note,
  children,
}: {
  label: ReactNode
  value: ReactNode
  tone?: Tone
  note?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="bg-card min-w-0 space-y-1.5 rounded-xl border p-3 shadow-xs">
      <Figure label={label} value={value} tone={tone} note={note} />
      {children}
    </div>
  )
}

/** The thin gauge: the month up to its target (else the average). */
function ThinGauge({ f }: { f: MonthFigures }) {
  const reference = f.target ?? f.average
  const net = f.month.net
  const scale = Math.max(reference * 1.6, net * 1.1, 1)
  const mark = (reference / scale) * 100
  const tone = f.status.tone
  return (
    <div className="relative pt-4">
      <Bar
        className="h-2"
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
        className="bg-foreground absolute bottom-[-0.25rem] h-[1.1rem] w-0.5 rounded-full"
        style={{ left: `${mark}%` }}
      />
      <span
        className="text-muted-foreground absolute top-0 -translate-x-1/2 text-[11px] whitespace-nowrap"
        style={{ left: `${mark}%` }}
      >
        {f.target === null ? 'Moyenne' : 'Cible'} {fmt0(reference)}
      </span>
    </div>
  )
}

/** The month's figures, as the phone's but abreast. */
function monthFigures(f: MonthFigures) {
  const net = f.month.net
  const moved = f.month.movedSavings + f.month.movedInvestments
  const reference = f.target ?? f.average
  const last = f.lastFull
  const lastReached = f.target !== null && last.net >= f.target
  return {
    saved: {
      label: f.partial ? 'À ce jour' : 'Épargné',
      value: fmt0(net),
      tone: (net < 0 ? 'bad' : 'neutral') as Tone,
    },
    gap: f.partial
      ? {
          label: `vs 1–${TODAY_DAY} ${monthAbbr(last.month)}`,
          value: signed0(net - f.previousNet),
          tone: (net >= f.previousNet ? 'good' : 'bad') as Tone,
        }
      : {
          label: f.target === null ? 'vs moyenne' : 'vs cible',
          value: signed0(net - reference),
          tone: (f.target === null ? 'neutral' : f.status.tone) as Tone,
        },
    rate: f.partial
      ? {
          label: capitalize(monthName(last.month)),
          value: (
            <span className="inline-flex items-center gap-1">
              {fmt0(last.net)}
              {lastReached && (
                <CheckIcon className="text-chart-delta-good size-[0.9em]" />
              )}
            </span>
          ),
          tone: 'neutral' as Tone,
        }
      : {
          label: 'Taux d’épargne',
          value:
            f.rate === null
              ? '—'
              : `${(f.rate * 100).toFixed(1).replace('.', ',')} %`,
          tone: 'neutral' as Tone,
        },
    moved: {
      label: 'Mis de côté',
      value: fmt0(moved),
      note: `Livrets ${fmt0(f.month.movedSavings)} · Placements ${fmt0(f.month.movedInvestments)}`,
    },
    checking: f.partial
      ? null
      : {
          label: 'Compte courant',
          value: signed0(net - moved),
          tone: (net - moved < 0 ? 'bad' : 'neutral') as Tone,
        },
    average: { label: 'Moyenne 6 mois', value: fmt0(f.average) },
  }
}

/** Five or six figures in one row, then the thin gauge and the dots. */
function MonthRow({ f }: { f: MonthFigures }) {
  const m = monthFigures(f)
  return (
    <Card className="space-y-4">
      <CardTitle end={<Chip tone={f.status.tone}>{f.status.label}</Chip>}>
        {f.partial
          ? `${capitalize(monthName(f.month.month))}, au ${TODAY_DAY}`
          : capitalize(monthName(f.month.month))}
      </CardTitle>
      <div className="grid grid-cols-5 gap-x-5 divide-x [&>*]:pr-5 [&>*:last-child]:pr-0">
        <Figure {...m.saved} big />
        <Figure {...m.gap} />
        <Figure {...m.rate} />
        <Figure
          {...m.moved}
          note={
            m.checking ? `Compte courant ${m.checking.value}` : m.moved.note
          }
        />
        <Figure
          {...m.average}
          note={f.target === null ? undefined : <ReachedDots f={f} />}
        />
      </div>
      <ThinGauge f={f} />
    </Card>
  )
}

/** Every account as one compact row: name, kind, value, result. */
function AccountsTable({ compact }: { compact?: boolean }) {
  const columns = compact
    ? 'grid-cols-[minmax(0,1fr)_6rem_4.5rem]'
    : 'grid-cols-[minmax(0,1fr)_7rem_7rem_5rem]'
  return (
    <div className="text-sm">
      <div
        className={cn(
          'text-muted-foreground grid gap-x-4 border-b pb-1.5 text-xs',
          columns,
        )}
      >
        <span>Compte</span>
        {!compact && <span>Type</span>}
        <span className="text-right">Valeur</span>
        <span className="text-right">Résultat</span>
      </div>
      <ul className="divide-y">
        {ALL_ACCOUNTS.map((a) => (
          <li key={a.name}>
            <button
              type="button"
              className={cn(
                'hover:bg-muted/50 grid min-h-10 w-full items-center gap-x-4 text-left',
                columns,
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full',
                    a.tint,
                  )}
                >
                  <a.icon aria-hidden className="size-3.5" />
                </span>
                <span className="truncate font-medium">{a.name}</span>
              </span>
              {!compact && (
                <span className="text-muted-foreground truncate text-xs">
                  {a.kind}
                </span>
              )}
              <span className="text-right tabular-nums">{fmt0(a.value)}</span>
              <span
                className={cn(
                  'text-right text-xs tabular-nums',
                  a.gainRate === undefined
                    ? 'text-muted-foreground'
                    : 'text-chart-delta-good',
                )}
              >
                {a.gainRate === undefined
                  ? '—'
                  : `+${(a.gainRate * 100).toFixed(1).replace('.', ',')} %`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The stock: total, result, invested, split, then every account. */
function StockCard({ compact }: { compact?: boolean }) {
  return (
    <Card className="space-y-4">
      <CardTitle
        end={
          <span className="flex items-baseline gap-3 text-sm">
            <span className="text-xl font-semibold tabular-nums">
              {fmt0(STOCK_TOTAL)}
            </span>
            <span className="text-chart-delta-good font-medium">
              {signed0(RESULT)}
            </span>
          </span>
        }
      >
        Livrets et placements
      </CardTitle>
      <div className="space-y-1.5">
        <Bar
          className="h-2"
          max={STOCK_TOTAL}
          parts={[
            { cents: SAVINGS_TOTAL, color: 'bg-emerald-500' },
            { cents: INVESTMENTS_TOTAL, color: 'bg-violet-500' },
          ]}
        />
        <div className="text-muted-foreground flex flex-wrap gap-x-5 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" /> Livrets{' '}
            <span className="text-foreground font-medium">
              {fmt0(SAVINGS_TOTAL)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-violet-500" /> Placements{' '}
            <span className="text-foreground font-medium">
              {fmt0(INVESTMENTS_TOTAL)}
            </span>
          </span>
          {!compact && (
            <span>
              Investi{' '}
              <span className="text-foreground font-medium">
                {fmt0(INVESTED)}
              </span>
            </span>
          )}
        </div>
      </div>
      <AccountsTable compact={compact} />
    </Card>
  )
}

/** Every goal as one compact row: bar, saved of target, need, when. */
function GoalsTable() {
  return (
    <div className="text-sm">
      <div className="text-muted-foreground grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_9rem_6rem_6.5rem] gap-x-4 border-b pb-1.5 text-xs">
        <span>Objectif</span>
        <span>Avancement</span>
        <span className="text-right">Épargné</span>
        <span className="text-right">Il faut</span>
        <span className="text-right">À ce rythme</span>
      </div>
      <ul className="divide-y">
        {GOALS.map((g) => {
          const reached = g.current >= g.target
          const late =
            g.deadline !== null &&
            g.projected !== null &&
            g.projected > g.deadline
          const When = late ? CalendarXIcon : CalendarCheckIcon
          return (
            <li key={g.name}>
              <button
                type="button"
                className="hover:bg-muted/50 grid min-h-10 w-full grid-cols-[minmax(0,10rem)_minmax(0,1fr)_9rem_6rem_6.5rem] items-center gap-x-4 text-left"
              >
                <span className="truncate font-medium">{g.name}</span>
                <span className="flex items-center gap-2">
                  <Bar
                    className="h-1.5 flex-1"
                    max={g.target}
                    parts={[
                      {
                        cents: Math.min(g.current, g.target),
                        color: reached ? 'bg-chart-delta-good' : 'bg-primary',
                      },
                    ]}
                  />
                  <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
                    {Math.min(Math.floor((g.current / g.target) * 100), 100)} %
                  </span>
                </span>
                <span className="text-muted-foreground text-right text-xs tabular-nums">
                  {reached
                    ? fmt0(g.current)
                    : `${fmt0(g.current)} / ${fmt0(g.target)}`}
                </span>
                <span className="text-right font-medium tabular-nums">
                  {reached ? '—' : `${fmt0(g.needed ?? 0)}`}
                  {!reached && (
                    <span className="text-muted-foreground text-xs font-normal">
                      /mois
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    'flex items-center justify-end gap-1 text-xs font-medium',
                    reached || !late ? TONE_TEXT.good : TONE_TEXT.bad,
                  )}
                >
                  {reached ? (
                    <>
                      <CheckIcon className="size-3.5" /> Atteint
                    </>
                  ) : (
                    <>
                      <When className="size-3.5" />
                      {monthShort(g.projected!)}
                    </>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function GoalsCard({ f }: { f: MonthFigures }) {
  const need = goalsNeed()
  const margin = f.average - need
  return (
    <Card className="space-y-3">
      <CardTitle
        end={
          <span className="text-muted-foreground text-sm">
            <span className="text-foreground font-semibold">
              {fmt0(need)}/mois
            </span>{' '}
            · marge{' '}
            <span
              className={cn(
                'font-semibold',
                TONE_TEXT[margin >= 0 ? 'good' : 'bad'],
              )}
            >
              {signed0(margin)}
            </span>
          </span>
        }
      >
        Objectifs
      </CardTitle>
      <GoalsTable />
    </Card>
  )
}

/** « Mis de côté » over 12 months as one strip. */
function YearStrip() {
  const y = yearMoved()
  return (
    <Card className="space-y-3">
      <CardTitle end={<Chip tone="neutral">12 mois</Chip>}>
        Mis de côté
      </CardTitle>
      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,auto)] items-end gap-x-8">
        <div className="space-y-2">
          <p className="text-xl font-semibold tabular-nums">{fmt0(y.total)}</p>
          <Bar
            className="h-2"
            max={y.total}
            parts={[
              { cents: y.toSavings, color: 'bg-emerald-500' },
              { cents: y.toInvestments, color: 'bg-violet-500' },
            ]}
          />
        </div>
        <Figure label="Livrets" value={signed0(y.toSavings)} />
        <Figure label="Placements" value={signed0(y.toInvestments)} />
        <Figure
          label="Compte courant"
          value={signed0(y.checking)}
          tone={y.checking < 0 ? 'bad' : 'neutral'}
        />
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * The three directions
 * ------------------------------------------------------------------------- */

function DirectionA({ f }: { f: MonthFigures }) {
  return (
    <div className="space-y-4">
      <MonthRow f={f} />
      <StockCard />
      <GoalsCard f={f} />
      <YearStrip />
    </div>
  )
}

function DirectionB({ f }: { f: MonthFigures }) {
  const y = yearMoved()
  const need = goalsNeed()
  return (
    <div className="space-y-4">
      <MonthRow f={f} />
      <div className="grid grid-cols-2 items-start gap-4">
        <div className="space-y-4">
          <Card className="space-y-3">
            <CardTitle
              end={
                <span className="text-muted-foreground text-sm">
                  <span className="text-foreground font-semibold">
                    {fmt0(need)}/mois
                  </span>{' '}
                  · marge{' '}
                  <span className="text-chart-delta-good font-semibold">
                    {signed0(f.average - need)}
                  </span>
                </span>
              }
            >
              Objectifs
            </CardTitle>
            <ul className="space-y-3 text-sm">
              {GOALS.map((g) => {
                const reached = g.current >= g.target
                return (
                  <li key={g.name} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{g.name}</span>
                      <span className="text-xs">
                        {reached ? (
                          <span className="text-chart-delta-good">
                            ✓ Atteint
                          </span>
                        ) : (
                          <>
                            <span className="font-semibold">
                              {fmt0(g.needed ?? 0)}/mois
                            </span>{' '}
                            <span className="text-chart-delta-good">
                              · {monthShort(g.projected!)}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                    <Bar
                      className="h-1.5"
                      max={g.target}
                      parts={[
                        {
                          cents: Math.min(g.current, g.target),
                          color: reached ? 'bg-chart-delta-good' : 'bg-primary',
                        },
                      ]}
                    />
                  </li>
                )
              })}
            </ul>
          </Card>
          <Card className="space-y-3">
            <CardTitle end={<Chip tone="neutral">12 mois</Chip>}>
              Mis de côté
            </CardTitle>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Figure label="Total" value={fmt0(y.total)} />
              <Figure label="Livrets" value={signed0(y.toSavings)} />
              <Figure label="Placements" value={signed0(y.toInvestments)} />
              <Figure
                label="Compte courant"
                value={signed0(y.checking)}
                tone={y.checking < 0 ? 'bad' : 'neutral'}
              />
            </div>
          </Card>
        </div>
        <StockCard compact />
      </div>
    </div>
  )
}

function DirectionC({ f }: { f: MonthFigures }) {
  const m = monthFigures(f)
  const y = yearMoved()
  const need = goalsNeed()
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-muted-foreground px-1 text-sm font-medium">
          {f.partial
            ? `${capitalize(monthName(f.month.month))}, au ${TODAY_DAY}`
            : capitalize(monthName(f.month.month))}
        </h2>
        <div className="grid grid-cols-4 gap-3">
          <Tile
            {...m.saved}
            note={<Chip tone={f.status.tone}>{f.status.label}</Chip>}
          >
            <ThinGauge f={f} />
          </Tile>
          <Tile
            {...m.gap}
            note={f.target === null ? undefined : <ReachedDots f={f} />}
          />
          <Tile {...m.rate} note={`Moyenne ${fmt0(f.average)} / mois`} />
          <Tile
            {...m.moved}
            note={
              m.checking ? `Compte courant ${m.checking.value}` : m.moved.note
            }
          />
        </div>
      </section>
      <section className="space-y-2">
        <h2 className="text-muted-foreground px-1 text-sm font-medium">
          Ce que vous avez
        </h2>
        <div className="grid grid-cols-4 gap-3">
          <Tile
            label="Livrets et placements"
            value={fmt0(STOCK_TOTAL)}
            note={`Livrets ${fmt0(SAVINGS_TOTAL)}`}
          />
          <Tile
            label="Résultat"
            value={signed0(RESULT)}
            tone="good"
            note={`Investi ${fmt0(INVESTED)}`}
          />
          <Tile
            label="Mis de côté sur 12 mois"
            value={fmt0(y.total)}
            note={`Compte courant ${signed0(y.checking)}`}
          />
          <Tile
            label="Objectifs"
            value={`${fmt0(need)}/mois`}
            note={`marge ${signed0(f.average - need)}`}
          />
        </div>
      </section>
      <Card className="space-y-3">
        <CardTitle>Comptes</CardTitle>
        <AccountsTable />
      </Card>
      <Card className="space-y-3">
        <CardTitle>Objectifs</CardTitle>
        <GoalsTable />
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Frame
 * ------------------------------------------------------------------------- */

interface FrameArgs {
  direction: Direction
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
      style={{ width, height: 900 }}
      className="bg-background text-foreground relative flex shrink-0 flex-col overflow-hidden rounded-xl border shadow-sm"
    >
      <Header phone={false} />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="@container min-w-0 flex-1 overflow-y-auto">
          <MonthBar
            f={f}
            phone={false}
            onPrevious={() => setIndex(Math.max(index - 1, 0))}
            onNext={() => setIndex(Math.min(index + 1, MONTHS.length - 1))}
          />
          <div className="w-full space-y-5 px-6 py-6">
            <header className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">Épargne</h1>
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
            {args.direction === 'A' && <DirectionA f={f} />}
            {args.direction === 'B' && <DirectionB f={f} />}
            {args.direction === 'C' && <DirectionC f={f} />}
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
  args: { direction: 'A', scenario: 'above', width: 1280 },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 min-h-screen p-4">
        <Frame {...args} />
      </div>
    </AppScale>
  ),
}
