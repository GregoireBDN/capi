import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card, CardContent, cn } from '@finances/ui'
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  ClockIcon,
  MinusIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Prototypes for #410, after the build: the owner found the three
 * comparison tiles under a part's heading (« Écart avec le 1–12 oct. »,
 * « Écart avec la moyenne », « Plus forte hausse ») hard to read and
 * unpleasant. Three lighter ways to say the same, synthetic data, not app
 * code: the file goes once the owner has chosen.
 *
 * A. En deux phrases : no card, two short lines in words, whole euros.
 * B. Lignes : one card, one row per comparison (what it is, its amount, the
 *    change); a row of three figures on a computer.
 * C. Barres : the month and what it is compared with as bars whose lengths
 *    compare at a glance, then the biggest rise in one line.
 *
 * Every direction: whole euros, no percentages, the notes in one short line.
 */
const meta: Meta<Args> = {
  title: 'Prototypes/Mouvements, les comparaisons (#410)',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
}
export default meta

type Direction = 'A' | 'B' | 'C'
type Width = 320 | 390 | 1280
type Case = 'novembre' | 'octobre' | 'revenus'

interface Args {
  direction: Direction
  width: Width
  cas: Case
}

interface Data {
  part: string
  color: string
  /** A rise is good news (income, savings). */
  riseIsGood: boolean
  /** « Dépensé », « Reçu ». */
  figure: string
  nowCents: number
  /** « 1–12 oct. » or « septembre ». */
  previousName: string
  previousCents: number
  averageCents: number
  averageMonths: number
  partial: boolean
  biggest: { label: string; name: string; deltaCents: number } | null
  note: string
}

const DATA: Record<Case, Data> = {
  novembre: {
    part: 'Dépenses',
    color: 'var(--chart-expense)',
    riseIsGood: false,
    figure: 'Dépensé',
    nowCents: 92_383,
    previousName: '1–12 oct.',
    previousCents: 102_295,
    averageCents: 130_146,
    averageMonths: 6,
    partial: true,
    biggest: {
      label: 'Plus forte hausse',
      name: 'Non catégorisé',
      deltaCents: 4_093,
    },
    note: 'Virements exclus · 60 € d’abonnements encore attendus',
  },
  octobre: {
    part: 'Dépenses',
    color: 'var(--chart-expense)',
    riseIsGood: false,
    figure: 'Dépensé',
    nowCents: 232_916,
    previousName: 'septembre',
    previousCents: 171_111,
    averageCents: 227_390,
    averageMonths: 6,
    partial: false,
    biggest: {
      label: 'Plus forte hausse',
      name: 'Courses',
      deltaCents: 20_123,
    },
    note: 'Virements exclus',
  },
  revenus: {
    part: 'Revenus',
    color: 'var(--chart-income)',
    riseIsGood: true,
    figure: 'Reçu',
    nowCents: 68_900,
    previousName: '1–12 oct.',
    previousCents: 19_800,
    averageCents: 35_000,
    averageMonths: 6,
    partial: true,
    biggest: {
      label: 'Plus grand écart',
      name: 'Remboursements',
      deltaCents: 49_100,
    },
    note: 'Virements exclus · 2 985 € encore attendus (salaire)',
  },
}

const WHOLE = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const euros = (cents: number) => WHOLE.format(Math.round(cents / 100))
const signed = (cents: number) =>
  `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${euros(Math.abs(cents))}`

function tone(cents: number, riseIsGood: boolean) {
  if (cents === 0) return 'neutral'
  return cents > 0 === riseIsGood ? 'good' : 'bad'
}

const TONE = {
  good: 'text-chart-delta-good',
  bad: 'text-chart-delta-bad',
  neutral: 'text-muted-foreground',
}

/** ↘ −99 €, coloured by whether it is good news. */
function Change({
  cents,
  riseIsGood,
  unsigned = false,
  className,
}: {
  cents: number
  riseIsGood: boolean
  /** The words say more or less (A): no sign. */
  unsigned?: boolean
  className?: string
}) {
  const Icon =
    cents > 0 ? ArrowUpRightIcon : cents < 0 ? ArrowDownRightIcon : MinusIcon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium whitespace-nowrap tabular-nums',
        TONE[tone(cents, riseIsGood)],
        className,
      )}
    >
      <Icon aria-hidden className="size-[1em] shrink-0" />
      {unsigned ? euros(Math.abs(cents)) : signed(cents)}
    </span>
  )
}

/* ---------------------------------------------------------------------------
 * A. En deux phrases
 * ------------------------------------------------------------------------- */

function DirectionA({ d }: { d: Data }) {
  const vsPrevious = d.nowCents - d.previousCents
  const vsAverage = d.nowCents - d.averageCents
  const words = (cents: number, what: string) => {
    const more = cents > 0
    return (
      <>
        <Change cents={cents} riseIsGood={d.riseIsGood} unsigned />{' '}
        <span className="text-muted-foreground">
          {cents === 0
            ? `comme ${what}`
            : `${more ? 'de plus' : 'de moins'} ${what === 'la moyenne' ? 'que la moyenne' : `qu’${d.partial ? 'au' : 'en'} ${what}`}`}
        </span>
      </>
    )
  }
  return (
    <div className="space-y-1.5 px-1 text-sm">
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <span>{words(vsPrevious, d.previousName)}</span>
        <span>{words(vsAverage, 'la moyenne')}</span>
      </p>
      {d.biggest && (
        <p>
          <span className="text-muted-foreground">
            {d.biggest.label === 'Plus forte hausse'
              ? 'En hausse : '
              : 'Le plus grand écart : '}
          </span>
          <span className="font-medium">{d.biggest.name}</span>{' '}
          <Change cents={d.biggest.deltaCents} riseIsGood={d.riseIsGood} />
        </p>
      )}
      <Note d={d} />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * B. Lignes
 * ------------------------------------------------------------------------- */

function DirectionB({ d, wide }: { d: Data; wide: boolean }) {
  const rows = [
    {
      label: d.partial ? `Au ${d.previousName}` : `En ${d.previousName}`,
      amount: euros(d.previousCents),
      change: d.nowCents - d.previousCents,
    },
    {
      label: `Moyenne ${d.averageMonths} mois`,
      amount: euros(d.averageCents),
      change: d.nowCents - d.averageCents,
    },
  ]
  if (wide) {
    // A computer: one row of three figures, label above, sized to content.
    return (
      <div className="space-y-1.5">
        <Card size="sm">
          <CardContent className="flex flex-wrap gap-x-12 gap-y-3">
            {rows.map((row) => (
              <div key={row.label} className="space-y-0.5">
                <p className="text-muted-foreground text-xs">{row.label}</p>
                <p className="flex items-baseline gap-2 text-lg font-semibold whitespace-nowrap tabular-nums">
                  <Change cents={row.change} riseIsGood={d.riseIsGood} />
                  <span className="text-muted-foreground text-sm font-normal">
                    {row.amount}
                  </span>
                </p>
              </div>
            ))}
            {d.biggest && (
              <div className="space-y-0.5">
                <p className="text-muted-foreground text-xs">
                  {d.biggest.label}
                </p>
                <p className="flex items-baseline gap-2 text-lg font-semibold whitespace-nowrap">
                  {d.biggest.name}
                  <Change
                    cents={d.biggest.deltaCents}
                    riseIsGood={d.riseIsGood}
                    className="text-sm"
                  />
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Note d={d} />
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <Card size="sm">
        <CardContent className="divide-y">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex min-h-11 flex-wrap items-center gap-x-3 py-1.5"
            >
              <span className="min-w-[6rem] flex-1 break-normal">
                {row.label}
                <span className="text-muted-foreground ml-2 text-sm tabular-nums">
                  {row.amount}
                </span>
              </span>
              <Change
                cents={row.change}
                riseIsGood={d.riseIsGood}
                className="ml-auto"
              />
            </div>
          ))}
          {d.biggest && (
            <div className="flex min-h-11 flex-wrap items-center gap-x-3 py-1.5">
              <span className="min-w-[6rem] flex-1 break-normal">
                <span className="text-muted-foreground text-sm">
                  {d.biggest.label}
                </span>{' '}
                {d.biggest.name}
              </span>
              <Change
                cents={d.biggest.deltaCents}
                riseIsGood={d.riseIsGood}
                className="ml-auto"
              />
            </div>
          )}
        </CardContent>
      </Card>
      <Note d={d} />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * C. Barres
 * ------------------------------------------------------------------------- */

function Bar({
  label,
  cents,
  max,
  color,
  strong,
  end,
}: {
  label: string
  cents: number
  max: number
  color: string
  strong?: boolean
  end?: ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2 text-sm">
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            !strong && 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        {end}
        <span
          className={cn(
            'whitespace-nowrap tabular-nums',
            strong ? 'font-semibold' : 'text-muted-foreground',
          )}
        >
          {euros(cents)}
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            width: `${(Math.max(0, cents) / max) * 100}%`,
            background: color,
          }}
        />
      </div>
    </div>
  )
}

function DirectionC({ d, wide }: { d: Data; wide: boolean }) {
  const max = Math.max(d.nowCents, d.previousCents, d.averageCents, 1)
  const muted = 'color-mix(in oklch, var(--muted-foreground) 45%, transparent)'
  return (
    <div className="space-y-1.5">
      <Card size="sm">
        <CardContent className={cn('space-y-3', wide && 'max-w-[40rem]')}>
          <Bar
            label={d.partial ? 'Ce mois-ci, à ce jour' : 'Ce mois-ci'}
            cents={d.nowCents}
            max={max}
            color={d.color}
            strong
          />
          <Bar
            label={d.partial ? `Au ${d.previousName}` : `En ${d.previousName}`}
            cents={d.previousCents}
            max={max}
            color={muted}
            end={
              <Change
                cents={d.nowCents - d.previousCents}
                riseIsGood={d.riseIsGood}
                className="text-xs"
              />
            }
          />
          <Bar
            label={`Moyenne ${d.averageMonths} mois${d.partial ? ', mêmes jours' : ''}`}
            cents={d.averageCents}
            max={max}
            color={muted}
            end={
              <Change
                cents={d.nowCents - d.averageCents}
                riseIsGood={d.riseIsGood}
                className="text-xs"
              />
            }
          />
          {d.biggest && (
            <p className="border-t pt-2 text-sm">
              <span className="text-muted-foreground">
                {d.biggest.label} :{' '}
              </span>
              <span className="font-medium">{d.biggest.name}</span>{' '}
              <Change cents={d.biggest.deltaCents} riseIsGood={d.riseIsGood} />
            </p>
          )}
        </CardContent>
      </Card>
      <Note d={d} />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * The frame: the part's heading above, the donut's card below
 * ------------------------------------------------------------------------- */

function Note({ d }: { d: Data }) {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs">
      {d.note.includes('attendu') && (
        <ClockIcon aria-hidden className="size-3.5 shrink-0" />
      )}
      {d.note}
    </p>
  )
}

function Page({ direction, width, cas }: Args) {
  const d = DATA[cas]
  const wide = width >= 768
  return (
    <div
      className="bg-background text-foreground @container mx-auto space-y-4 border-x"
      style={{ width, padding: wide ? 24 : 16 }}
    >
      <h2 className="flex items-center gap-2 px-1 text-lg font-semibold tracking-tight">
        <span
          aria-hidden
          className="size-2.5 rounded-full"
          style={{ background: d.color }}
        />
        {d.part}
      </h2>
      {direction === 'A' && <DirectionA d={d} />}
      {direction === 'B' && <DirectionB d={d} wide={wide} />}
      {direction === 'C' && <DirectionC d={d} wide={wide} />}
      <Card size="sm" className="text-muted-foreground h-40 p-4 text-sm">
        Répartition…
      </Card>
    </div>
  )
}

const ARG_TYPES = {
  direction: { control: 'inline-radio', options: ['A', 'B', 'C'] },
  width: { control: 'inline-radio', options: [320, 390, 1280] },
  cas: {
    control: 'inline-radio',
    options: ['novembre', 'octobre', 'revenus'],
    labels: {
      novembre: 'Dépenses, novembre (au 12)',
      octobre: 'Dépenses, octobre (complet)',
      revenus: 'Revenus, novembre (au 12)',
    },
  },
} as const

export const UnePage: StoryObj<Args> = {
  name: 'Une page',
  args: { direction: 'B', width: 390, cas: 'novembre' },
  argTypes: ARG_TYPES,
  render: (args) => <Page {...args} />,
}

const NAMES: Record<Direction, string> = {
  A: 'En deux phrases',
  B: 'Lignes',
  C: 'Barres',
}

/** The three directions abreast, with today's tiles for reference. */
export const CoteACote: StoryObj<Omit<Args, 'direction'>> = {
  name: 'Côte à côte',
  args: { width: 390, cas: 'novembre' },
  argTypes: { width: ARG_TYPES.width, cas: ARG_TYPES.cas },
  render: (args) => (
    <div
      className={cn(
        'bg-muted flex gap-6 overflow-x-auto p-6',
        args.width >= 768 ? 'flex-col' : 'items-start',
      )}
    >
      {(['A', 'B', 'C'] as const).map((direction) => (
        <div key={direction} className="shrink-0 space-y-2">
          <p className="text-sm font-semibold">
            {direction}. {NAMES[direction]}
          </p>
          <Page direction={direction} {...args} />
        </div>
      ))}
    </div>
  ),
}
