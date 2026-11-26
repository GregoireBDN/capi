import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card, cn } from '@capi/ui'
import {
  CheckIcon,
  ChevronRightIcon,
  LandmarkIcon,
  TrendingDownIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * #495, two more dashboard cards the owner wants better: « Reste à
 * dépenser » (what is left stays the figure, with the « per day » the owner
 * liked, and no sentences) and « Patrimoine ». Three directions each,
 * mockups with synthetic data, not app code (deleted once the owner has
 * chosen).
 */
const meta: Meta<Args> = {
  title: 'Prototypes/Reste à dépenser et patrimoine (#495)',
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
      <div className="space-y-6">{children}</div>
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

/** The app's card header: a muted title opening its page. */
function Head({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="text-muted-foreground flex min-h-9 items-center justify-between gap-3 px-2 text-xs">
      <span>{title}</span>
      <span className="flex items-center gap-2">
        {aside}
        <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
      </span>
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <Card className="min-w-0 gap-0.5 px-2 pt-1.5 pb-2">{children}</Card>
}

const BIG =
  'text-[2rem] leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums'

/* ---------------------------------------------------------------------------
 * Reste à dépenser
 * ------------------------------------------------------------------------- */

// Budget 2 225 €, spent 1 070 €, figures known to 16 Nov. (14 days left),
// an even pace would be at 1 187 € on the 16th.
const TARGET = 222_500
const SPENT = 107_000
const PACE = 118_700
const LEFT = TARGET - SPENT
const DAYS_LEFT = 14
const PER_DAY = Math.floor(LEFT / DAYS_LEFT / 100) * 100

/** How far the figures go, a small chip beside the title. */
function DataChip() {
  return (
    <span className="bg-warning/15 text-warning-foreground dark:text-warning flex items-center gap-1 rounded-full px-2 py-0.5 font-medium">
      <TriangleAlertIcon aria-hidden className="size-3" />
      au 16 nov.
    </span>
  )
}

function Bar() {
  return (
    <span className="bg-muted relative block h-3 rounded-full">
      <span
        className="bg-primary absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${(SPENT / TARGET) * 100}%` }}
      />
      <span
        aria-hidden
        className="bg-foreground absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded"
        style={{ left: `${(PACE / TARGET) * 100}%` }}
      />
    </span>
  )
}

function OnTrack() {
  return (
    <span className="bg-chart-delta-good/10 text-chart-delta-good flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      <CheckIcon aria-hidden className="size-3.5" />
      Bon rythme
    </span>
  )
}

/** A. What is left in large, « par jour » under the bar, the budget at its end. */
function LeftUnderBar() {
  return (
    <Shell>
      <Head title="Reste · novembre" aside={<DataChip />} />
      <div className="space-y-3 px-2 pb-2">
        <div className="flex items-center justify-between gap-3">
          <span className={BIG}>{eur(LEFT)}</span>
          <OnTrack />
        </div>
        <Bar />
        <div className="flex items-baseline justify-between text-xs tabular-nums">
          <span>
            <span className="text-sm font-semibold">{eur(PER_DAY)}</span>
            <span className="text-muted-foreground"> / jour</span>
          </span>
          <span className="text-muted-foreground">sur {eur(TARGET)}</span>
        </div>
      </div>
    </Shell>
  )
}

/** B. Two figures side by side: what is left, big; per day, smaller. */
function LeftTwoFigures() {
  return (
    <Shell>
      <Head title="Reste · novembre" aside={<DataChip />} />
      <div className="space-y-3 px-2 pb-2">
        <div className="flex items-end gap-4">
          <span className={BIG}>{eur(LEFT)}</span>
          <span className="border-l pb-1 pl-4 leading-tight">
            <span className="block text-lg font-semibold tabular-nums">
              {eur(PER_DAY)}
            </span>
            <span className="text-muted-foreground block text-xs">
              par jour · {DAYS_LEFT} j
            </span>
          </span>
        </div>
        <Bar />
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-xs tabular-nums">
            sur {eur(TARGET)}
          </span>
          <OnTrack />
        </div>
      </div>
    </Shell>
  )
}

/**
 * C. « Par jour » is the pill: green while on pace, orange ahead of it, so
 * it says both how much a day and whether it holds.
 */
function LeftPerDayPill() {
  return (
    <Shell>
      <Head title="Reste · novembre" aside={<DataChip />} />
      <div className="space-y-3 px-2 pb-2">
        <div className="flex items-center justify-between gap-3">
          <span className={BIG}>{eur(LEFT)}</span>
          <span className="bg-chart-delta-good/10 text-chart-delta-good flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap tabular-nums">
            <CheckIcon aria-hidden className="size-4" />
            {eur(PER_DAY)} / jour
          </span>
        </div>
        <Bar />
        <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
          <span>{eur(SPENT)} dépensés</span>
          <span>{eur(TARGET)}</span>
        </div>
      </div>
    </Shell>
  )
}

/* ---------------------------------------------------------------------------
 * Patrimoine
 * ------------------------------------------------------------------------- */

// Twelve month ends then today, in euros.
const HISTORY = [
  44_100, 44_900, 45_300, 46_800, 47_200, 48_900, 49_400, 50_200, 51_800,
  52_600, 53_300, 54_653, 53_940,
].map((euros) => euros * 100)
const TOTAL = HISTORY.at(-1)!
const MONTH_CHANGE = TOTAL - HISTORY.at(-2)!
const YEAR_CHANGE = TOTAL - HISTORY[0]
const CASH = 1_395_000
const INVESTED = TOTAL - CASH

function ChangePill({ cents, label }: { cents: number; label: string }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap tabular-nums',
        cents >= 0
          ? 'bg-chart-delta-good/10 text-chart-delta-good'
          : 'bg-chart-delta-bad/10 text-chart-delta-bad',
      )}
    >
      {cents < 0 && <TrendingDownIcon aria-hidden className="size-3.5" />}
      {signed(cents)} {label}
    </span>
  )
}

function Sparkline() {
  const w = 300
  const h = 56
  const min = Math.min(...HISTORY) * 0.98
  const max = Math.max(...HISTORY) * 1.01
  const x = (i: number) => (i / (HISTORY.length - 1)) * w
  const y = (v: number) => h - ((v - min) / (max - min)) * h
  const line = HISTORY.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(
    ' ',
  )
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="block h-14 w-full overflow-visible"
    >
      <path
        d={`${line} L${w},${h} L0,${h} Z`}
        className="fill-primary/10"
        stroke="none"
      />
      <path
        d={line}
        fill="none"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className="stroke-primary"
      />
      <circle
        cx={x(HISTORY.length - 1)}
        cy={y(TOTAL)}
        r="3.5"
        className="fill-primary"
      />
    </svg>
  )
}

/** A. The figure, its change this month as a pill, a year of month ends. */
function WorthCurve() {
  return (
    <Shell>
      <Head title="Patrimoine" />
      <div className="space-y-2 px-2 pb-1">
        <div className="flex items-center justify-between gap-3">
          <span className={BIG}>{eur(TOTAL)}</span>
          <ChangePill cents={MONTH_CHANGE} label="ce mois" />
        </div>
        <Sparkline />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>nov. 2025</span>
          <span className="text-chart-delta-good font-medium tabular-nums">
            {signed(YEAR_CHANGE)} en 1 an
          </span>
        </div>
      </div>
    </Shell>
  )
}

/** B. The figure, then what it is made of: cash and investments. */
function WorthParts() {
  const cashShare = CASH / TOTAL
  return (
    <Shell>
      <Head title="Patrimoine" />
      <div className="space-y-3 px-2 pb-2">
        <div className="flex items-center justify-between gap-3">
          <span className={BIG}>{eur(TOTAL)}</span>
          <ChangePill cents={MONTH_CHANGE} label="ce mois" />
        </div>
        <span className="flex h-3 gap-0.5 overflow-hidden rounded-full">
          <span
            className="bg-primary/40 h-full"
            style={{ width: `${cashShare * 100}%` }}
          />
          <span className="bg-primary h-full flex-1" />
        </span>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span className="bg-primary/40 size-2 rounded-full" />
              Comptes
            </span>
            <span className="font-semibold tabular-nums">{eur(CASH)}</span>
          </span>
          <span className="text-right">
            <span className="text-muted-foreground flex items-center justify-end gap-1.5 text-xs">
              <span className="bg-primary size-2 rounded-full" />
              Placements
            </span>
            <span className="font-semibold tabular-nums">{eur(INVESTED)}</span>
          </span>
        </div>
      </div>
    </Shell>
  )
}

/** C. Stays one row, but the change is a coloured pill, never a sentence. */
function WorthRow() {
  return (
    <Card className="min-w-0 px-2 py-1.5">
      <div className="flex min-h-14 items-center gap-3 px-2">
        <span
          aria-hidden
          className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full"
        >
          <LandmarkIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">Patrimoine</span>
        <span className="flex flex-col items-end gap-1">
          <span className="text-lg font-semibold whitespace-nowrap tabular-nums">
            {eur(TOTAL)}
          </span>
          <ChangePill cents={MONTH_CHANGE} label="ce mois" />
        </span>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </div>
    </Card>
  )
}

/** Today's card, for comparison. */
function WorthToday() {
  return (
    <Card className="min-w-0 px-2 py-1.5">
      <div className="flex min-h-11 items-center gap-3 px-2 py-1.5 text-sm">
        <span
          aria-hidden
          className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full"
        >
          <LandmarkIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Patrimoine</span>
          <span className="text-muted-foreground block text-xs">
            {signed(MONTH_CHANGE)} depuis le 31 oct.
          </span>
        </span>
        <span className="font-semibold whitespace-nowrap tabular-nums">
          {eur(TOTAL)}
        </span>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </div>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const ResteADepenser: Story = {
  name: 'Reste à dépenser',
  render: ({ width }) => (
    <Page width={width}>
      <Option letter="A" name="Par jour sous la barre">
        <LeftUnderBar />
      </Option>
      <Option letter="B" name="Deux chiffres">
        <LeftTwoFigures />
      </Option>
      <Option letter="C" name="Par jour en pastille">
        <LeftPerDayPill />
      </Option>
    </Page>
  ),
}

export const Patrimoine: Story = {
  name: 'Patrimoine',
  render: ({ width }) => (
    <Page width={width}>
      <Option letter="0" name="Aujourd’hui">
        <WorthToday />
      </Option>
      <Option letter="A" name="Courbe sur un an">
        <WorthCurve />
      </Option>
      <Option letter="B" name="Comptes et placements">
        <WorthParts />
      </Option>
      <Option letter="C" name="Une ligne, variation en pastille">
        <WorthRow />
      </Option>
    </Page>
  ),
}
