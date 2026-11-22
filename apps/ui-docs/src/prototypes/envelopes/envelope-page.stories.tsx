import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Badge,
  Button,
  cn,
  SegmentedControl,
  SegmentedControlItem,
} from '@finances/ui'
import {
  ArrowRightLeftIcon,
  CalendarIcon,
  PencilIcon,
  TagIcon,
  TargetIcon,
} from 'lucide-react'
import { useState } from 'react'

import {
  Dot,
  ENVELOPE,
  EnvelopeIcon,
  envelopeTotal,
  euros,
  Frame,
  Gauge,
  JAPON_HISTORY,
  Line,
  monthlyNeed,
  percent,
  shares,
  SideBySide,
  SimpleCard,
  StackedBar,
  Stat,
  WIDTH_ARG,
  type Envelope,
  type Width,
} from './shared'

/**
 * Prototypes of an envelope's page (#428): its total, its share on each
 * account, how it grew, its target and due date with the monthly amount
 * needed. Clickable mockups with synthetic data, not app code.
 *
 * A. Jauge : the total over its target in a gauge, the monthly amount
 *    needed under it; then « Par compte » (one bar, one row per account)
 *    and « Évolution » (a bar per month, stacked by account).
 * B. Le plan : the monthly amount needed is the big figure; one chart of
 *    the months so far and the way to the target (dashed), with
 *    « Évolution / Par compte » one at a time.
 * C. En chiffres : four tiles (Mis de côté, Cible, Reste, Par mois) and
 *    lines, no chart but a small bar per account.
 */
const meta: Meta<PageArgs> = {
  title: 'Prototypes/Enveloppes (#428)/2. Page d’une enveloppe',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
}

export default meta

type Direction = 'A' | 'B' | 'C'
type EnvelopeId = 'japon' | 'apport' | 'velo'

interface PageArgs {
  direction: Direction
  enveloppe: EnvelopeId
  width: Width
}

const ACCOUNT_COLOR: Record<string, string> = {
  livret: 'var(--chart-2)',
  courant: 'var(--chart-7)',
  ldds: 'var(--chart-6)',
}

/** Eight month ends, each account's share following the Japan trip's shape. */
function history(envelopeId: string) {
  const last = JAPON_HISTORY.at(-1)!
  const lastTotal = last.livret + last.courant
  return JAPON_HISTORY.map((month) => {
    const ratio = (month.livret + month.courant) / lastTotal
    return {
      month: month.month,
      parts: shares(envelopeId).map((s) => ({
        accountId: s.account.id,
        cents:
          envelopeId === 'japon'
            ? month[s.account.id as 'livret' | 'courant']
            : Math.round((s.cents * ratio) / 1000) * 1000,
      })),
    }
  })
}

function Header({ envelope }: { envelope: Envelope }) {
  return (
    <div className="flex items-center gap-3">
      <EnvelopeIcon envelope={envelope} size="lg" />
      <div className="min-w-0">
        <h1 className="text-xl font-semibold md:text-2xl">{envelope.name}</h1>
        <p className="text-muted-foreground text-sm">
          {envelope.due ? `Pour le ${envelope.due}` : 'Sans échéance'}
        </p>
      </div>
    </div>
  )
}

function Categories({ envelope }: { envelope: Envelope }) {
  if (envelope.categories.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        Aucune catégorie : ses dépenses se rattachent à la main.
      </p>
    )
  return (
    <div className="flex flex-wrap gap-2">
      {envelope.categories.map((category) => (
        <Badge key={category} variant="secondary">
          <TagIcon className="size-3" aria-hidden /> {category}
        </Badge>
      ))}
    </div>
  )
}

function ByAccount({ envelope }: { envelope: Envelope }) {
  const total = envelopeTotal(envelope.id)
  return (
    <>
      <StackedBar
        tall
        segments={shares(envelope.id).map((s) => ({
          id: s.account.id,
          label: s.account.name,
          cents: s.cents,
          color: ACCOUNT_COLOR[s.account.id],
        }))}
      />
      <div className="divide-y">
        {shares(envelope.id).map((s) => (
          <Line
            key={s.account.id}
            leading={<Dot color={ACCOUNT_COLOR[s.account.id]} />}
            label={s.account.name}
            sub={percent((s.cents / total) * 10000)}
            value={euros(s.cents)}
          />
        ))}
      </div>
    </>
  )
}

/** A bar per month end, stacked by account. */
function MonthBars({ envelope }: { envelope: Envelope }) {
  const months = history(envelope.id)
  const max = Math.max(
    ...months.map((m) => m.parts.reduce((sum, p) => sum + p.cents, 0)),
  )
  return (
    <div className="space-y-2">
      <div className="flex h-36 items-end gap-1.5" aria-hidden>
        {months.map((m) => (
          <div
            key={m.month}
            className="flex h-full flex-1 flex-col-reverse gap-px"
          >
            {m.parts.map((p) => (
              <span
                key={p.accountId}
                className="w-full first:rounded-b-sm last:rounded-t-sm"
                style={{
                  height: `${(p.cents / max) * 100}%`,
                  background: ACCOUNT_COLOR[p.accountId],
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="text-muted-foreground flex gap-1.5 text-xs">
        {months.map((m) => (
          <span key={m.month} className="flex-1 text-center">
            {m.month}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * A. Jauge
 * ------------------------------------------------------------------------- */

function DirectionA({ envelope }: { envelope: Envelope }) {
  const total = envelopeTotal(envelope.id)
  const need = monthlyNeed(envelope)
  return (
    <>
      <SimpleCard>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-3xl font-semibold tabular-nums">
            {euros(total, true)}
          </p>
          {envelope.targetCents && (
            <p className="text-muted-foreground whitespace-nowrap tabular-nums">
              sur {euros(envelope.targetCents, true)}
            </p>
          )}
        </div>
        {envelope.targetCents && (
          <Gauge
            value={total}
            max={envelope.targetCents}
            color={envelope.color}
          />
        )}
        {need !== undefined ? (
          <p className="text-sm">
            <span className="font-semibold tabular-nums">
              {euros(need, true)} par mois
            </span>{' '}
            <span className="text-muted-foreground">
              pendant {envelope.monthsLeft} mois pour y arriver
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Il manque {euros((envelope.targetCents ?? 0) - total, true)}, sans
            échéance.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" iconStart={<ArrowRightLeftIcon />}>
            Déplacer
          </Button>
          <Button variant="secondary" iconStart={<PencilIcon />}>
            Modifier
          </Button>
        </div>
      </SimpleCard>
      <SimpleCard title="Par compte">
        <ByAccount envelope={envelope} />
      </SimpleCard>
      <SimpleCard title="Évolution">
        <MonthBars envelope={envelope} />
      </SimpleCard>
      <SimpleCard title="Paie pour">
        <Categories envelope={envelope} />
      </SimpleCard>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * B. Le plan
 * ------------------------------------------------------------------------- */

/** The month ends so far, then a dashed line to the target on its date. */
function PlanChart({ envelope }: { envelope: Envelope }) {
  const months = history(envelope.id).map((m) =>
    m.parts.reduce((sum, p) => sum + p.cents, 0),
  )
  const target = envelope.targetCents ?? months.at(-1)!
  const ahead = envelope.monthsLeft ?? 0
  const count = months.length + Math.min(ahead, 8)
  const W = 320
  const H = 140
  const x = (i: number) => (i / (count - 1)) * (W - 8) + 4
  const y = (cents: number) => H - 8 - (cents / target) * (H - 24)
  const past = months.map((c, i) => `${x(i)},${y(c)}`).join(' ')
  const lastI = months.length - 1
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Évolution et chemin vers la cible"
    >
      <line
        x1={0}
        x2={W}
        y1={y(target)}
        y2={y(target)}
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeDasharray="2 3"
      />
      <text
        x={W - 4}
        y={y(target) - 4}
        textAnchor="end"
        className="fill-muted-foreground text-[10px]"
      >
        Cible {euros(target, true)}
      </text>
      <polyline
        points={past}
        fill="none"
        stroke={envelope.color}
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {ahead > 0 && (
        <line
          x1={x(lastI)}
          y1={y(months[lastI])}
          x2={x(count - 1)}
          y2={y(target)}
          stroke={envelope.color}
          strokeWidth={2}
          strokeDasharray="5 4"
        />
      )}
      <circle cx={x(lastI)} cy={y(months[lastI])} r={4} fill={envelope.color} />
    </svg>
  )
}

function DirectionB({ envelope }: { envelope: Envelope }) {
  const [tab, setTab] = useState('evolution')
  const total = envelopeTotal(envelope.id)
  const need = monthlyNeed(envelope)
  return (
    <>
      <SimpleCard>
        {need !== undefined ? (
          <>
            <p className="text-muted-foreground text-sm">À mettre de côté</p>
            <p className="text-3xl font-semibold tabular-nums">
              {euros(need, true)}
              <span className="text-muted-foreground text-lg font-normal">
                {' '}
                / mois
              </span>
            </p>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">Mis de côté</p>
            <p className="text-3xl font-semibold tabular-nums">
              {euros(total, true)}
            </p>
          </>
        )}
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <TargetIcon className="size-4" aria-hidden />
            {euros(total, true)} / {euros(envelope.targetCents ?? 0, true)}
          </span>
          {envelope.due && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <CalendarIcon className="size-4" aria-hidden />
              {envelope.due}
            </span>
          )}
        </div>
      </SimpleCard>
      <SegmentedControl
        value={tab}
        onValueChange={setTab}
        fullWidth
        aria-label="Vue"
      >
        <SegmentedControlItem value="evolution">Évolution</SegmentedControlItem>
        <SegmentedControlItem value="comptes">Par compte</SegmentedControlItem>
      </SegmentedControl>
      <SimpleCard>
        {tab === 'evolution' ? (
          <>
            <PlanChart envelope={envelope} />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>avr. 2026</span>
              <span>aujourd’hui</span>
              <span>{envelope.due ?? ''}</span>
            </div>
          </>
        ) : (
          <ByAccount envelope={envelope} />
        )}
      </SimpleCard>
      <SimpleCard title="Paie pour">
        <Categories envelope={envelope} />
      </SimpleCard>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * C. En chiffres
 * ------------------------------------------------------------------------- */

function DirectionC({ envelope }: { envelope: Envelope }) {
  const total = envelopeTotal(envelope.id)
  const need = monthlyNeed(envelope)
  const months = history(envelope.id)
  const sums = months.map((m) => m.parts.reduce((sum, p) => sum + p.cents, 0))
  return (
    <>
      <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        <Stat label="Mis de côté" value={euros(total, true)} />
        <Stat label="Cible" value={euros(envelope.targetCents ?? 0, true)} />
        <Stat
          label="Reste"
          value={euros((envelope.targetCents ?? 0) - total, true)}
        />
        <Stat
          label="Par mois"
          value={need !== undefined ? euros(need, true) : '—'}
        />
      </div>
      <SimpleCard title="Comptes">
        {shares(envelope.id).map((s) => (
          <div key={s.account.id} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="flex-1">{s.account.name}</span>
              <span className="ml-auto font-medium whitespace-nowrap tabular-nums">
                {euros(s.cents)}
              </span>
            </div>
            <Gauge value={s.cents} max={total} color={envelope.color} />
          </div>
        ))}
      </SimpleCard>
      <SimpleCard title="Mois">
        <div className="divide-y">
          {[...months]
            .reverse()
            .slice(0, 4)
            .map((m, i) => {
              const index = months.length - 1 - i
              const delta = sums[index] - (sums[index - 1] ?? 0)
              return (
                <Line
                  key={m.month}
                  label={m.month}
                  sub={`+${euros(delta, true)}`}
                  value={euros(sums[index], true)}
                />
              )
            })}
        </div>
      </SimpleCard>
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        <span>Paie pour</span>
        <Categories envelope={envelope} />
      </div>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * The page
 * ------------------------------------------------------------------------- */

function EnvelopePage({ direction, enveloppe, width }: PageArgs) {
  const envelope = ENVELOPE[enveloppe]
  const computer = width >= 768
  return (
    <Frame
      width={width}
      back="Enveloppes"
      crumbs={['Enveloppes', envelope.name]}
      active="Enveloppes"
    >
      <Header envelope={envelope} />
      <div
        className={cn(
          'space-y-6',
          computer &&
            direction === 'A' &&
            'grid grid-cols-2 items-start gap-6 space-y-0 [&>*:first-child]:col-span-2',
        )}
      >
        {direction === 'A' && <DirectionA envelope={envelope} />}
        {direction === 'B' && <DirectionB envelope={envelope} />}
        {direction === 'C' && <DirectionC envelope={envelope} />}
      </div>
    </Frame>
  )
}

const argTypes = {
  direction: { control: 'inline-radio', options: ['A', 'B', 'C'] },
  enveloppe: { control: 'inline-radio', options: ['japon', 'apport', 'velo'] },
  width: WIDTH_ARG,
} as const

/**
 * One envelope: a trip on two accounts due in 7 months, a house deposit on
 * two savings accounts due in 25 months, a bike without due date.
 */
export const UnePage: StoryObj<PageArgs> = {
  name: 'Une page',
  args: { direction: 'A', enveloppe: 'japon', width: 390 },
  argTypes,
  render: (args) => <EnvelopePage {...args} />,
}

const LABELS: Record<Direction, string> = {
  A: 'A. Jauge',
  B: 'B. Le plan',
  C: 'C. En chiffres',
}

export const CoteACote: StoryObj<PageArgs> = {
  name: 'Côte à côte',
  args: { enveloppe: 'japon', width: 390 },
  argTypes: {
    enveloppe: argTypes.enveloppe,
    width: { control: 'inline-radio', options: [320, 390] },
  },
  render: ({ enveloppe, width }) => (
    <SideBySide
      items={(['A', 'B', 'C'] as const).map((direction) => ({
        label: LABELS[direction],
        node: (
          <EnvelopePage
            direction={direction}
            enveloppe={enveloppe}
            width={width}
          />
        ),
      }))}
    />
  ),
}
