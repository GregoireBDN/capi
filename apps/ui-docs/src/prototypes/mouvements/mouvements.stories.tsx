import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Card,
  cn,
  formatWholeEuros,
  SegmentedControl,
  SegmentedControlItem,
  StatCard,
} from '@finances/ui'
import { ChevronRightIcon, PiggyBankIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  FIGURE_LABEL,
  KIND_COLOR,
  KIND_LABEL,
  MONTHS,
  total,
  totalOf,
  trend,
  type Kind,
  type MonthData,
  type MonthKey,
} from './data'
import {
  ComparisonControl,
  Delta,
  Donut,
  Frame,
  KindDetail,
  Notes,
  Ranking,
  Section,
  signed,
  Trend,
  WIDTH_ARG,
  type Comparison,
  type Width,
} from './shared'

/**
 * Prototypes of the « Mouvements » page (#410): the month's money in, out
 * and set aside, where Dépenses only analysed expenses. Everything today's
 * page shows for expenses stays (KPIs, donut, ranking with its comparison,
 * 12-month trend, « Exceptionnelles », the month bar, the « ⋮ » actions with
 * « Voir les opérations »); income gets the same, per category; transfers to
 * savings and investments are a third part of their own, per account, never
 * mixed into income or expenses. Synthetic data, not app code.
 *
 * A. Trois onglets : « Dépenses · Revenus · Épargne » at the top, each one
 *    today's page for its kind. Dépenses first: today's page, unchanged.
 * B. Le mois en tête : three tiles (Reçu, Dépensé, Mis de côté) that are
 *    also the tabs, one bar of where the income went and what stayed on
 *    the checking account; the chosen tile's detail below.
 * C. Tout à la suite : no tabs. Four figures, then Dépenses, Revenus and
 *    Épargne one after the other; one trend with a switch between them.
 */
const meta: Meta<PageArgs> = {
  title: 'Prototypes/Mouvements (#410)',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
}

export default meta

type Direction = 'A' | 'B' | 'C'

interface PageArgs {
  direction: Direction
  mois: MonthKey
  width: Width
  /** The part shown first (A and B), `?vue=` in the URL. */
  vue: Kind
  exceptionnelles: boolean
}

const KINDS: Kind[] = ['expense', 'income', 'savings']

/** What stayed on the checking accounts: in − out − set aside. */
function kept(data: MonthData) {
  return total(data.income) - total(data.expense) - total(data.savings)
}

function keptPrevious(data: MonthData) {
  return (
    totalOf(data.income, 'previousCents') -
    totalOf(data.expense, 'previousCents') -
    totalOf(data.savings, 'previousCents')
  )
}

/** « Livrets et placements : l’évolution et ce que vous avez → Épargne » */
function ToSavingsPage() {
  return (
    <a
      href="#epargne"
      onClick={(event) => event.preventDefault()}
      className="hover:bg-muted/60 flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2 text-sm"
    >
      <PiggyBankIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
      <span className="min-w-0 flex-1">
        Ce que vous avez et l’évolution de votre épargne
      </span>
      <span className="text-primary font-medium">Épargne</span>
      <ChevronRightIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
    </a>
  )
}

/* ---------------------------------------------------------------------------
 * A. Trois onglets
 * ------------------------------------------------------------------------- */

function DirectionA({
  data,
  vue,
  oneOffs,
}: {
  data: MonthData
  vue: Kind
  oneOffs: boolean
}) {
  const [kind, setKind] = useState<Kind>(vue)
  useEffect(() => setKind(vue), [vue])
  return (
    <>
      <SegmentedControl
        aria-label="Afficher"
        fullWidth
        value={kind}
        onValueChange={setKind}
        className="@container"
      >
        {KINDS.map((k) => (
          <SegmentedControlItem
            key={k}
            value={k}
            className="px-2 text-[min(0.875rem,5.4cqi)]"
          >
            {KIND_LABEL[k]}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <KindDetail key={kind} kind={kind} data={data} oneOffs={oneOffs} />
      {kind === 'savings' && <ToSavingsPage />}
    </>
  )
}

/* ---------------------------------------------------------------------------
 * B. Le mois en tête
 * ------------------------------------------------------------------------- */

const B_ORDER: Kind[] = ['income', 'expense', 'savings']

function FlowTile({
  kind,
  data,
  selected,
  onSelect,
}: {
  kind: Kind
  data: MonthData
  selected: boolean
  onSelect: () => void
}) {
  const items = data[kind]
  const now = total(items)
  const previous = totalOf(items, 'previousCents')
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        '@container min-w-0 rounded-xl border p-2.5 text-left transition-colors @md:p-3',
        selected
          ? 'border-primary bg-primary/5 ring-primary ring-1'
          : 'bg-card hover:bg-muted/60',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: KIND_COLOR[kind] }}
        />
        <span className="text-muted-foreground truncate text-[clamp(0.6rem,12cqi,0.875rem)]">
          {kind === 'savings' ? 'Épargne' : KIND_LABEL[kind]}
        </span>
      </span>
      <span className="mt-1 block text-[clamp(0.75rem,18cqi,1.5rem)] leading-tight font-semibold whitespace-nowrap tabular-nums">
        {formatWholeEuros(now)}
      </span>
      <span className="mt-0.5 block text-[clamp(0.6rem,12cqi,0.875rem)]">
        <Delta cents={now - previous} kind={kind} />
      </span>
    </button>
  )
}

/** Where the month's income went: spent, set aside, and what stayed. */
function FlowBar({ data }: { data: MonthData }) {
  const income = total(data.income)
  const spent = total(data.expense)
  const set = total(data.savings)
  const rest = kept(data)
  const scale = Math.max(income, spent + set, 1)
  const expected = totalOf(data.income, 'expectedCents')
  const parts = [
    { id: 'expense', cents: spent, color: KIND_COLOR.expense },
    { id: 'savings', cents: set, color: KIND_COLOR.savings },
  ]
  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label={`Reçu ${formatWholeEuros(income)} ; dépensé ${formatWholeEuros(spent)}, mis de côté ${formatWholeEuros(set)}`}
        className="space-y-1"
      >
        <div className="bg-muted h-2 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full"
            style={{
              width: `${(income / scale) * 100}%`,
              background: KIND_COLOR.income,
            }}
          />
        </div>
        <div className="bg-muted flex h-2 gap-0.5 overflow-hidden rounded-full">
          {parts.map((p) => (
            <div
              key={p.id}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${(p.cents / scale) * 100}%`,
                background: p.color,
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="break-normal">
          {rest >= 0
            ? 'Resté sur le compte courant'
            : 'Pris sur le compte courant'}
        </span>
        <span
          className={cn(
            'ml-auto font-semibold whitespace-nowrap tabular-nums',
            rest < 0 && 'text-chart-delta-bad',
          )}
        >
          {signed(rest)}
        </span>
      </div>
      {expected > 0 && (
        <p className="text-muted-foreground text-xs">
          {formatWholeEuros(expected)} de revenus attendus d’ici la fin du mois
          (salaire).
        </p>
      )}
    </div>
  )
}

function DirectionB({
  data,
  vue,
  oneOffs,
}: {
  data: MonthData
  vue: Kind
  oneOffs: boolean
}) {
  const [kind, setKind] = useState<Kind>(vue)
  useEffect(() => setKind(vue), [vue])
  return (
    <>
      <Card size="sm" className="gap-3 px-3">
        <div
          role="tablist"
          aria-label="Afficher"
          className="grid grid-cols-3 gap-2"
        >
          {B_ORDER.map((k) => (
            <FlowTile
              key={k}
              kind={k}
              data={data}
              selected={k === kind}
              onSelect={() => setKind(k)}
            />
          ))}
        </div>
        <FlowBar data={data} />
      </Card>
      <h2 className="flex items-center gap-2 px-1 text-lg font-semibold tracking-tight">
        <span
          aria-hidden
          className="size-2.5 rounded-full"
          style={{ background: KIND_COLOR[kind] }}
        />
        {KIND_LABEL[kind]}
      </h2>
      <KindDetail
        key={kind}
        kind={kind}
        data={data}
        oneOffs={oneOffs}
        hideTotal
      />
      {kind === 'savings' && <ToSavingsPage />}
    </>
  )
}

/* ---------------------------------------------------------------------------
 * C. Tout à la suite
 * ------------------------------------------------------------------------- */

function SummaryC({ data }: { data: MonthData }) {
  const rest = kept(data)
  return (
    <section aria-label="Le mois en bref">
      <div className="grid grid-cols-1 gap-2 @lg:grid-cols-2 @2xl:grid-cols-4">
        {B_ORDER.map((k) => (
          <StatCard
            key={k}
            label={FIGURE_LABEL[k]}
            value={total(data[k])}
            previousValue={totalOf(data[k], 'previousCents')}
            comparisonLabel={
              data.partial
                ? `vs ${data.previousName}`
                : `vs ${data.previousName}`
            }
            increaseIsGood={k !== 'expense'}
            trend={trend(k, data.month).map((m) => m.cents)}
            trendLabel="Les 12 derniers mois"
          />
        ))}
        <StatCard
          label={
            rest >= 0
              ? 'Resté sur le compte courant'
              : 'Pris sur le compte courant'
          }
          value={rest}
          previousValue={keptPrevious(data)}
          deltaDisplay="value"
          comparisonLabel={`vs ${data.previousName}`}
        />
      </div>
    </section>
  )
}

/** Today's other two tiles, as one line under Dépenses. */
function ExpenseLine({ data }: { data: MonthData }) {
  const now = total(data.expense)
  const average = totalOf(data.expense, 'averageCents')
  const rise = [...data.expense].sort(
    (a, b) => b.cents - b.previousCents - (a.cents - a.previousCents),
  )[0]
  return (
    <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <span>
        Écart avec la moyenne : <Delta cents={now - average} kind="expense" />
      </span>
      {rise && rise.cents > rise.previousCents && (
        <span>
          Plus forte hausse :{' '}
          <span className="text-foreground">{rise.name}</span>{' '}
          <Delta cents={rise.cents - rise.previousCents} kind="expense" />
        </span>
      )}
    </p>
  )
}

function PartC({
  kind,
  data,
  oneOffs,
  withDonut,
}: {
  kind: Kind
  data: MonthData
  oneOffs: boolean
  withDonut: boolean
}) {
  const [comparison, setComparison] = useState<Comparison>('previous')
  const items = data[kind]
  const monthName = data.label.split(' ')[0].toLowerCase()
  return (
    <section id={`part-${kind}`} className="space-y-3">
      <h2 className="flex flex-wrap items-baseline gap-x-2 px-1 text-lg font-semibold tracking-tight">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ background: KIND_COLOR[kind] }}
          />
          {KIND_LABEL[kind]}
        </span>
        <span className="text-muted-foreground ml-auto text-base font-medium tabular-nums">
          {formatWholeEuros(total(items))}
        </span>
      </h2>
      {kind === 'expense' && <ExpenseLine data={data} />}
      <div
        className={cn(
          'grid items-start gap-4',
          withDonut && '@3xl:grid-cols-2',
        )}
      >
        {withDonut && (
          <Section title="Répartition" className="@3xl:sticky @3xl:top-4">
            <Donut kind={kind} items={items} monthLabel={monthName} />
          </Section>
        )}
        <Section title={kind === 'savings' ? 'Par compte' : 'Par catégorie'}>
          <ComparisonControl
            value={comparison}
            onChange={setComparison}
            data={data}
          />
          <Ranking kind={kind} items={items} comparison={comparison} />
        </Section>
      </div>
      <Notes kind={kind} data={data} oneOffs={oneOffs} />
    </section>
  )
}

function DirectionC({ data, oneOffs }: { data: MonthData; oneOffs: boolean }) {
  const [series, setSeries] = useState<Kind>('expense')
  return (
    <>
      <SummaryC data={data} />
      <PartC kind="expense" data={data} oneOffs={oneOffs} withDonut />
      <div className="grid items-start gap-6 @3xl:grid-cols-2">
        <PartC kind="income" data={data} oneOffs={oneOffs} withDonut={false} />
        <div className="space-y-3">
          <PartC
            kind="savings"
            data={data}
            oneOffs={oneOffs}
            withDonut={false}
          />
          <ToSavingsPage />
        </div>
      </div>
      <Section title="Tendance sur 12 mois">
        <Trend
          key={series}
          kind={series}
          data={data}
          items={data[series]}
          series={
            <div className="@container">
              <SegmentedControl
                aria-label="Montrer"
                fullWidth
                value={series}
                onValueChange={setSeries}
              >
                {KINDS.map((k) => (
                  <SegmentedControlItem
                    key={k}
                    value={k}
                    className="px-2 text-[min(0.875rem,5.4cqi)]"
                  >
                    {KIND_LABEL[k]}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            </div>
          }
        />
      </Section>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

function Page({ direction, mois, width, vue, exceptionnelles }: PageArgs) {
  const [oneOffs, setOneOffs] = useState(exceptionnelles)
  useEffect(() => setOneOffs(exceptionnelles), [exceptionnelles])
  const data = MONTHS[mois]
  return (
    <Frame
      width={width}
      data={data}
      oneOffs={oneOffs}
      onOneOffsChange={setOneOffs}
    >
      {direction === 'A' && (
        <DirectionA data={data} vue={vue} oneOffs={oneOffs} />
      )}
      {direction === 'B' && (
        <DirectionB data={data} vue={vue} oneOffs={oneOffs} />
      )}
      {direction === 'C' && <DirectionC data={data} oneOffs={oneOffs} />}
    </Frame>
  )
}

const ARG_TYPES = {
  direction: { control: 'inline-radio', options: ['A', 'B', 'C'] },
  mois: {
    control: 'inline-radio',
    options: ['octobre', 'novembre'],
    labels: { octobre: 'octobre (complet)', novembre: 'novembre (au 12)' },
  },
  width: WIDTH_ARG,
  vue: {
    control: 'inline-radio',
    options: KINDS,
    labels: { expense: 'Dépenses', income: 'Revenus', savings: 'Épargne' },
  },
  exceptionnelles: { control: 'boolean' },
} as const

/** One direction, one width: switch them in the controls, the theme in the toolbar. */
export const UnePage: StoryObj<PageArgs> = {
  name: 'Une page',
  args: {
    direction: 'B',
    mois: 'octobre',
    width: 390,
    vue: 'expense',
    exceptionnelles: false,
  },
  argTypes: ARG_TYPES,
  render: (args) => <Page {...args} />,
}

/** The three directions abreast on a phone. */
export const CoteACote: StoryObj<Omit<PageArgs, 'direction'>> = {
  name: 'Côte à côte',
  args: { mois: 'octobre', width: 390, vue: 'expense', exceptionnelles: false },
  argTypes: {
    mois: ARG_TYPES.mois,
    width: { control: 'inline-radio', options: [320, 390] },
    vue: ARG_TYPES.vue,
    exceptionnelles: ARG_TYPES.exceptionnelles,
  },
  render: (args) => (
    <div className="bg-muted flex items-start gap-6 overflow-x-auto p-6">
      {(['A', 'B', 'C'] as const).map((direction) => (
        <div key={direction} className="shrink-0 space-y-2">
          <p className="text-sm font-semibold">
            {direction}.{' '}
            {direction === 'A'
              ? 'Trois onglets'
              : direction === 'B'
                ? 'Le mois en tête'
                : 'Tout à la suite'}
          </p>
          <Page direction={direction} {...args} />
        </div>
      ))}
    </div>
  ),
}
