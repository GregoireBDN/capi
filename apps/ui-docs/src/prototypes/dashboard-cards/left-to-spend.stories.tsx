import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card, cn } from '@capi/ui'
import { CheckIcon, ChevronRightIcon, TriangleAlertIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * #495, « Reste à dépenser » again: the pace mark on the bar read as a
 * mystery line. Three directions without it, mockups with synthetic data,
 * not app code (deleted once the owner has chosen).
 */
const meta: Meta<Args> = {
  title: 'Prototypes/Reste à dépenser (#495)',
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

// Budget 2 225 €, spent 1 070 €, figures known to 16 Nov. of 30 days.
const TARGET = 222_500
const SPENT = 107_000
const LEFT = TARGET - SPENT
const DAY = 16
const DAYS = 30
const DAYS_LEFT = DAYS - DAY
const PER_DAY = Math.floor(LEFT / DAYS_LEFT / 100) * 100

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

function Shell({ children }: { children: ReactNode }) {
  return (
    <Card className="min-w-0 gap-0.5 px-2 pt-1.5 pb-3">
      <div className="text-muted-foreground flex min-h-9 items-center justify-between gap-3 px-2 text-xs">
        <span>Reste · novembre</span>
        <span className="flex items-center gap-2">
          <span className="bg-warning/15 text-warning-foreground flex items-center gap-1 rounded-full px-2 py-0.5 font-medium">
            <TriangleAlertIcon aria-hidden className="size-3" />
            au 16 nov.
          </span>
          <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
        </span>
      </div>
      <div className="space-y-3 px-2">{children}</div>
    </Card>
  )
}

/** The two figures the owner chose: what is left, and per day. */
function Figures() {
  return (
    <div className="flex items-end gap-4">
      <span className="text-[2rem] leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums">
        {eur(LEFT)}
      </span>
      <span className="border-l pb-1 pl-4 leading-tight">
        <span className="block text-lg font-semibold tabular-nums">
          {eur(PER_DAY)}
        </span>
        <span className="text-muted-foreground block text-xs whitespace-nowrap">
          par jour · {DAYS_LEFT} j
        </span>
      </span>
    </div>
  )
}

function OnTrack() {
  return (
    <span className="bg-chart-delta-good/10 text-chart-delta-good flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      <CheckIcon aria-hidden className="size-3.5" />
      Bon rythme
    </span>
  )
}

/**
 * A. The bar shows what is left (it empties as you spend), green while on
 * pace, orange ahead, red once over. No mark on it.
 */
function LeftBar() {
  return (
    <Shell>
      <Figures />
      <span className="bg-muted relative block h-3 rounded-full">
        <span
          className="bg-chart-delta-good absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${(LEFT / TARGET) * 100}%` }}
        />
      </span>
      <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
        <span>reste</span>
        <span>budget {eur(TARGET)}</span>
      </div>
    </Shell>
  )
}

function Line({
  label,
  share,
  value,
  className,
}: {
  label: string
  share: number
  value: string
  className: string
}) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="bg-muted relative block h-2 rounded-full">
        <span
          className={cn('absolute inset-y-0 left-0 rounded-full', className)}
          style={{ width: `${share * 100}%` }}
        />
      </span>
      <span className="w-10 text-right font-medium tabular-nums">{value}</span>
    </div>
  )
}

/**
 * B. Two labelled bars instead of a mark: how much of the month is gone,
 * how much of the budget is spent. Budget shorter than month = on pace.
 */
function LeftTwoBars() {
  return (
    <Shell>
      <Figures />
      <div className="space-y-2">
        <Line
          label="Mois"
          share={DAY / DAYS}
          value={`${Math.round((DAY / DAYS) * 100)} %`}
          className="bg-muted-foreground/50"
        />
        <Line
          label="Budget"
          share={SPENT / TARGET}
          value={`${Math.round((SPENT / TARGET) * 100)} %`}
          className="bg-chart-delta-good"
        />
      </div>
    </Shell>
  )
}

/** C. No bar: the two figures and the pill, nothing to decode. */
function LeftNoBar() {
  return (
    <Shell>
      <Figures />
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs tabular-nums">
          sur {eur(TARGET)}
        </span>
        <OnTrack />
      </div>
    </Shell>
  )
}

export const ResteADepenser: Story = {
  name: 'Reste à dépenser',
  render: ({ width }) => (
    <Page width={width}>
      <Option letter="A" name="Barre de ce qui reste, sans trait">
        <LeftBar />
      </Option>
      <Option letter="B" name="Mois vs budget">
        <LeftTwoBars />
      </Option>
      <Option letter="C" name="Sans barre">
        <LeftNoBar />
      </Option>
    </Page>
  ),
}
