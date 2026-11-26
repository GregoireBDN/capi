import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card, cn } from '@capi/ui'
import { ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

/**
 * #495, « Patrimoine » again: the period chosen on the card itself (not a
 * setting) and fewer figures. Three directions, mockups with synthetic
 * data, not app code (deleted once the owner has chosen).
 */
const meta: Meta<Args> = {
  title: 'Prototypes/Patrimoine (#495)',
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

type Period = 1 | 3 | 10
const PERIODS: Period[] = [1, 3, 10]

// Synthetic month ends, ten years, in euros; the last is today.
const TEN_YEARS = Array.from({ length: 121 }, (_, i) => {
  const trend = 8_000 + i * 380
  const wave = Math.sin(i / 5) * 900 + Math.sin(i / 2.3) * 350
  return Math.round(trend + wave)
}).map((euros) => euros * 100)
TEN_YEARS[120] = 5_394_000
const series = (years: Period) => TEN_YEARS.slice(120 - years * 12)
const TOTAL = TEN_YEARS[120]

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

function Head({ aside }: { aside?: ReactNode }) {
  return (
    <div className="text-muted-foreground flex min-h-9 items-center justify-between gap-3 px-2 text-xs">
      <span>Patrimoine</span>
      <span className="flex items-center gap-2">
        {aside}
        <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
      </span>
    </div>
  )
}

const BIG =
  'text-[2rem] leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums'

function Curve({
  values,
  tone = 'primary',
  height = 'h-16',
}: {
  values: number[]
  tone?: 'primary' | 'good'
  height?: string
}) {
  const w = 300
  const h = 64
  const low = Math.min(...values)
  const high = Math.max(...values)
  const x = (i: number) => (i / (values.length - 1)) * w
  const y = (v: number) => h - 4 - ((v - low) / (high - low || 1)) * (h - 8)
  const line = values
    .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn('block w-full overflow-visible', height)}
    >
      <path
        d={`${line} L${w},${h} L0,${h} Z`}
        className={
          tone === 'good' ? 'fill-chart-delta-good/10' : 'fill-primary/10'
        }
      />
      <path
        d={line}
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={
          tone === 'good' ? 'stroke-chart-delta-good' : 'stroke-primary'
        }
      />
    </svg>
  )
}

/** « 1 an · 3 ans · 10 ans » as a small segmented control. */
function Segments({
  value,
  onChange,
  short = false,
}: {
  value: Period
  onChange: (period: Period) => void
  short?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Période"
      className="bg-muted flex rounded-full p-0.5 text-xs font-medium"
    >
      {PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          role="radio"
          aria-checked={value === period}
          onClick={() => onChange(period)}
          className={cn(
            'min-h-7 flex-1 rounded-full px-2.5 whitespace-nowrap',
            value === period
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground',
          )}
        >
          {short ? `${period} a` : period === 1 ? '1 an' : `${period} ans`}
        </button>
      ))}
    </div>
  )
}

function Gain({ cents }: { cents: number }) {
  return (
    <span
      className={cn(
        'font-medium whitespace-nowrap tabular-nums',
        cents >= 0 ? 'text-chart-delta-good' : 'text-chart-delta-bad',
      )}
    >
      {signed(cents)}
    </span>
  )
}

/**
 * A. Two figures: today's total and what it gained over the period
 * chosen under the curve. No « ce mois », no date.
 */
function WorthSegmentsBelow() {
  const [period, setPeriod] = useState<Period>(1)
  const values = series(period)
  return (
    <Card className="min-w-0 gap-0.5 px-2 pt-1.5 pb-3">
      <Head />
      <div className="space-y-3 px-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className={BIG}>{eur(TOTAL)}</span>
          <span className="text-sm">
            <Gain cents={TOTAL - values[0]} />
          </span>
        </div>
        <Curve values={values} />
        <Segments value={period} onChange={setPeriod} />
      </div>
    </Card>
  )
}

/** B. The period in the header, then only the total and the curve. */
function WorthSegmentsHead() {
  const [period, setPeriod] = useState<Period>(3)
  const values = series(period)
  const up = TOTAL >= values[0]
  return (
    <Card className="min-w-0 gap-0.5 px-2 pt-1.5 pb-3">
      <div className="flex min-h-9 items-center justify-between gap-3 px-2">
        <span className="text-muted-foreground text-xs">Patrimoine</span>
        <Segments value={period} onChange={setPeriod} short />
      </div>
      <div className="space-y-2 px-2">
        <span className={BIG}>{eur(TOTAL)}</span>
        <Curve values={values} tone={up ? 'good' : 'primary'} height="h-20" />
      </div>
    </Card>
  )
}

/**
 * C. The figure is the gain over the period, the total smaller above it:
 * « how much richer » rather than « how much ».
 */
function WorthGainFirst() {
  const [period, setPeriod] = useState<Period>(1)
  const values = series(period)
  const gain = TOTAL - values[0]
  return (
    <Card className="min-w-0 gap-0.5 px-2 pt-1.5 pb-3">
      <Head aside={<span className="tabular-nums">{eur(TOTAL)}</span>} />
      <div className="space-y-3 px-2">
        <span
          className={cn(
            BIG,
            'block',
            gain >= 0 ? 'text-chart-delta-good' : 'text-chart-delta-bad',
          )}
        >
          {signed(gain)}
        </span>
        <Curve values={values} tone="good" />
        <Segments value={period} onChange={setPeriod} />
      </div>
    </Card>
  )
}

export const Patrimoine: Story = {
  name: 'Patrimoine',
  render: ({ width }) => (
    <Page width={width}>
      <Option letter="A" name="Total + gain, période sous la courbe">
        <WorthSegmentsBelow />
      </Option>
      <Option letter="B" name="Total seul, période en haut">
        <WorthSegmentsHead />
      </Option>
      <Option letter="C" name="Le gain en grand">
        <WorthGainFirst />
      </Option>
    </Page>
  ),
}
