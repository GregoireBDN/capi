import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, Card, cn } from '@finances/ui'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LuggageIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

import {
  EnvelopeIcon,
  euros,
  Frame,
  Gauge,
  SideBySide,
  SimpleCard,
  WIDTH_ARG,
  type Width,
} from './shared'

/**
 * Prototypes of a month's budget where an envelope is spent (#428): what
 * the envelope paid is added to the budget of its categories, so its
 * expenses count in the month without putting it over. October 2026, a
 * « Week-end à Lisbonne » envelope (800 € put aside) paid 620 € of
 * Voyages and 95 € of Restaurants; 85 € are left. Clickable mockups with
 * synthetic data, not app code.
 *
 * A. Cible augmentée : each line keeps all its spending; its target grows
 *    by what the envelope paid, shown as a tinted stretch of the bar and
 *    « + 95 € Lisbonne » under the target.
 * B. Payé à part : a card « Enveloppe utilisée » at the top (what it paid,
 *    per category, what is left); the lines show only what the month's
 *    budget paid itself.
 * C. Une ligne Enveloppe : the envelope is a line of the list, opening to
 *    its categories; the categories' lines show what the budget paid, with
 *    « + 95 € par Lisbonne » under them.
 *
 * The three say the same thing (target + envelope = what the month could
 * spend); they differ by where the envelope reads.
 */
const meta: Meta<PageArgs> = {
  title: 'Prototypes/Enveloppes (#428)/3. Budget du mois',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
}

export default meta

type Direction = 'A' | 'B' | 'C'

interface PageArgs {
  direction: Direction
  width: Width
}

const LISBONNE = {
  name: 'Week-end à Lisbonne',
  short: 'Lisbonne',
  icon: LuggageIcon,
  color: 'var(--chart-3)',
  putAsideCents: 80000,
}

interface BudgetLine {
  name: string
  targetCents: number
  spentCents: number
  /** What the envelope paid in this category. */
  envelopeCents: number
}

const LINES: BudgetLine[] = [
  { name: 'Courses', targetCents: 45000, spentCents: 41230, envelopeCents: 0 },
  {
    name: 'Voyages',
    targetCents: 0,
    spentCents: 62000,
    envelopeCents: 62000,
  },
  {
    name: 'Restaurants',
    targetCents: 12000,
    spentCents: 19840,
    envelopeCents: 9500,
  },
  { name: 'Loisirs', targetCents: 8000, spentCents: 9650, envelopeCents: 0 },
  { name: 'Transport', targetCents: 9000, spentCents: 7400, envelopeCents: 0 },
]

const sum = (pick: (line: BudgetLine) => number) =>
  LINES.reduce((total, line) => total + pick(line), 0)

const TARGET = sum((l) => l.targetCents)
const SPENT = sum((l) => l.spentCents)
const PAID = sum((l) => l.envelopeCents)
const LEFT = LISBONNE.putAsideCents - PAID

function MonthBar() {
  return (
    <div className="flex items-center justify-between gap-2">
      <Button iconOnly variant="secondary" aria-label="Mois précédent">
        <ChevronLeftIcon />
      </Button>
      <p className="font-semibold">Octobre 2026</p>
      <Button iconOnly variant="secondary" aria-label="Mois suivant">
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

/** What is left in the envelope: the owner chooses where it goes. */
function Leftover() {
  return (
    <div className="bg-muted/60 space-y-2 rounded-md p-3 text-sm">
      <p>
        Il reste <span className="font-semibold">{euros(LEFT)}</span> dans «{' '}
        {LISBONNE.name} ».
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm">Rendre à « libre »</Button>
        <Button size="sm" variant="secondary">
          Vers une autre enveloppe
        </Button>
      </div>
    </div>
  )
}

function LineShell({
  name,
  right,
  bar,
  sub,
  leading,
}: {
  name: ReactNode
  right: ReactNode
  bar: ReactNode
  sub?: ReactNode
  leading?: ReactNode
}) {
  return (
    <li className="space-y-1.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3">
        {leading}
        <p className="min-w-[7rem] flex-1 break-normal">{name}</p>
        <p className="ml-auto text-sm whitespace-nowrap tabular-nums">
          {right}
        </p>
      </div>
      {bar}
      {sub && <p className="text-muted-foreground text-sm">{sub}</p>}
    </li>
  )
}

function overColor(spent: number, budget: number) {
  return spent > budget ? 'var(--chart-delta-bad)' : 'var(--primary)'
}

/* ---------------------------------------------------------------------------
 * A. Cible augmentée
 * ------------------------------------------------------------------------- */

/** The spending over a track whose end is tinted by what the envelope adds. */
function RaisedBar({ line }: { line: BudgetLine }) {
  const budget = line.targetCents + line.envelopeCents
  const scale = Math.max(budget, line.spentCents)
  return (
    <div className="bg-muted relative h-2.5 w-full overflow-hidden rounded-full">
      {line.envelopeCents > 0 && (
        <span
          className="absolute inset-y-0"
          style={{
            left: `${(line.targetCents / scale) * 100}%`,
            width: `${(line.envelopeCents / scale) * 100}%`,
            background: `repeating-linear-gradient(135deg, color-mix(in oklch, ${LISBONNE.color} 45%, transparent) 0 4px, transparent 4px 8px)`,
          }}
        />
      )}
      <span
        className="absolute inset-y-0 left-0 rounded-full opacity-85"
        style={{
          width: `${(line.spentCents / scale) * 100}%`,
          background: overColor(line.spentCents, budget),
        }}
      />
    </div>
  )
}

function DirectionA() {
  return (
    <>
      <SimpleCard>
        <p className="text-muted-foreground text-sm">Dépensé</p>
        <p className="text-3xl font-semibold tabular-nums">
          {euros(SPENT, true)}
          <span className="text-muted-foreground text-lg font-normal">
            {' '}
            / {euros(TARGET + PAID, true)}
          </span>
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Budget</span>{' '}
          {euros(TARGET, true)}{' '}
          <span style={{ color: LISBONNE.color }} className="font-medium">
            + {euros(PAID, true)} {LISBONNE.short}
          </span>
        </p>
      </SimpleCard>
      <SimpleCard title="Catégories">
        <ul className="divide-y">
          {LINES.map((line) => (
            <LineShell
              key={line.name}
              name={line.name}
              right={
                <>
                  {euros(line.spentCents, true)}{' '}
                  <span className="text-muted-foreground">
                    / {euros(line.targetCents + line.envelopeCents, true)}
                  </span>
                </>
              }
              bar={<RaisedBar line={line} />}
              sub={
                line.envelopeCents > 0 && (
                  <>
                    {line.targetCents > 0
                      ? `${euros(line.targetCents, true)} `
                      : 'Pas de budget '}
                    <span
                      style={{ color: LISBONNE.color }}
                      className="font-medium"
                    >
                      + {euros(line.envelopeCents, true)} {LISBONNE.short}
                    </span>
                  </>
                )
              }
            />
          ))}
        </ul>
        <Leftover />
      </SimpleCard>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * B. Payé à part
 * ------------------------------------------------------------------------- */

function OwnLines({ withNote }: { withNote: boolean }) {
  return (
    <ul className="divide-y">
      {LINES.filter(
        (l) => l.targetCents > 0 || l.spentCents > l.envelopeCents,
      ).map((line) => {
        const own = line.spentCents - line.envelopeCents
        return (
          <LineShell
            key={line.name}
            name={line.name}
            right={
              <>
                {euros(own, true)}{' '}
                <span className="text-muted-foreground">
                  / {euros(line.targetCents, true)}
                </span>
              </>
            }
            bar={
              <Gauge
                value={own}
                max={line.targetCents}
                color={overColor(own, line.targetCents)}
              />
            }
            sub={
              withNote &&
              line.envelopeCents > 0 && (
                <span style={{ color: LISBONNE.color }} className="font-medium">
                  + {euros(line.envelopeCents, true)} par {LISBONNE.short}
                </span>
              )
            }
          />
        )
      })}
    </ul>
  )
}

function DirectionB() {
  return (
    <>
      <Card className="min-w-0 gap-3 px-4">
        <div className="flex items-center gap-3">
          <EnvelopeIcon envelope={LISBONNE} />
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground text-sm">Enveloppe utilisée</p>
            <p className="font-medium break-normal">{LISBONNE.name}</p>
          </div>
          <p className="ml-auto text-lg font-semibold whitespace-nowrap tabular-nums">
            {euros(PAID, true)}
          </p>
        </div>
        <div className="text-muted-foreground text-sm">
          {LINES.filter((l) => l.envelopeCents > 0)
            .map((l) => `${l.name} ${euros(l.envelopeCents, true)}`)
            .join(' · ')}
        </div>
        <Leftover />
      </Card>
      <SimpleCard>
        <p className="text-muted-foreground text-sm">Dépensé sur le budget</p>
        <p className="text-3xl font-semibold tabular-nums">
          {euros(SPENT - PAID, true)}
          <span className="text-muted-foreground text-lg font-normal">
            {' '}
            / {euros(TARGET, true)}
          </span>
        </p>
        <OwnLines withNote={false} />
      </SimpleCard>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * C. Une ligne Enveloppe
 * ------------------------------------------------------------------------- */

function DirectionC() {
  const [open, setOpen] = useState(true)
  return (
    <>
      <SimpleCard>
        <p className="text-muted-foreground text-sm">Dépensé</p>
        <p className="text-3xl font-semibold tabular-nums">
          {euros(SPENT, true)}
        </p>
        <p className="text-muted-foreground text-sm">
          {euros(SPENT - PAID, true)} sur un budget de {euros(TARGET, true)} ·{' '}
          {euros(PAID, true)} par une enveloppe
        </p>
      </SimpleCard>
      <SimpleCard title="Catégories">
        <ul className="divide-y">
          <li className="py-3">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              className="flex min-h-11 w-full flex-wrap items-center gap-x-3 text-left"
            >
              <EnvelopeIcon envelope={LISBONNE} size="sm" />
              <span className="min-w-[7rem] flex-1 font-medium break-normal">
                {LISBONNE.name}
              </span>
              <span className="ml-auto text-sm whitespace-nowrap tabular-nums">
                {euros(PAID, true)}{' '}
                <span className="text-muted-foreground">
                  / {euros(LISBONNE.putAsideCents, true)}
                </span>
              </span>
              <ChevronDownIcon
                className={cn(
                  'text-muted-foreground size-4 shrink-0 transition-transform',
                  open && 'rotate-180',
                )}
                aria-hidden
              />
            </button>
            <div className="mt-1.5">
              <Gauge
                value={PAID}
                max={LISBONNE.putAsideCents}
                color={LISBONNE.color}
              />
            </div>
            {open && (
              <div className="mt-2 space-y-2 pl-10 text-sm">
                {LINES.filter((l) => l.envelopeCents > 0).map((l) => (
                  <p key={l.name} className="flex justify-between gap-2">
                    <span>{l.name}</span>
                    <span className="tabular-nums">
                      {euros(l.envelopeCents, true)}
                    </span>
                  </p>
                ))}
                <Leftover />
              </div>
            )}
          </li>
        </ul>
        <OwnLines withNote />
      </SimpleCard>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * The page
 * ------------------------------------------------------------------------- */

function BudgetPage({ direction, width }: PageArgs) {
  return (
    <Frame width={width} crumbs={['Budget']} active="Budget" title="Budget">
      <MonthBar />
      <div className={cn('space-y-6', width >= 768 && 'mx-auto max-w-2xl')}>
        {direction === 'A' && <DirectionA />}
        {direction === 'B' && <DirectionB />}
        {direction === 'C' && <DirectionC />}
      </div>
    </Frame>
  )
}

export const UnePage: StoryObj<PageArgs> = {
  name: 'Une page',
  args: { direction: 'A', width: 390 },
  argTypes: {
    direction: { control: 'inline-radio', options: ['A', 'B', 'C'] },
    width: WIDTH_ARG,
  },
  render: (args) => <BudgetPage {...args} />,
}

const LABELS: Record<Direction, string> = {
  A: 'A. Cible augmentée',
  B: 'B. Payé à part',
  C: 'C. Une ligne Enveloppe',
}

export const CoteACote: StoryObj<PageArgs> = {
  name: 'Côte à côte',
  args: { width: 390 },
  argTypes: { width: { control: 'inline-radio', options: [320, 390] } },
  render: ({ width }) => (
    <SideBySide
      items={(['A', 'B', 'C'] as const).map((direction) => ({
        label: LABELS[direction],
        node: <BudgetPage direction={direction} width={width} />,
      }))}
    />
  ),
}
