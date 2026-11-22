import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CategoryIcon,
  cn,
  DonutChart,
  formatEuros,
  formatWholeEuros,
  Label,
  NativeSelect,
  NativeSelectOption,
  SegmentedControl,
  SegmentedControlItem,
  StatCard,
  Switch,
} from '@finances/ui'
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CalendarClockIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  EllipsisVerticalIcon,
  MenuIcon,
  MinusIcon,
  SlidersHorizontalIcon,
} from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'

import {
  FIGURE_LABEL,
  KIND_COLOR,
  RISE_IS_GOOD,
  total,
  totalOf,
  trend,
  type Item,
  type Kind,
  type MonthData,
} from './data'

/**
 * Shared pieces of the « Mouvements » prototypes (#410): the app's frame
 * (header, month bar, sidebar on a computer), the page's filters, and the
 * blocks of today's Dépenses page made generic over a kind (KPIs, donut,
 * ranking with its comparison, 12-month trend). Not app code.
 */

export type Width = 320 | 390 | 1280

export const WIDTH_ARG = {
  control: 'inline-radio',
  options: [320, 390, 1280],
} as const

export type Comparison = 'previous' | 'average'

/* ---------------------------------------------------------------------------
 * The frame
 * ------------------------------------------------------------------------- */

const NAV = [
  [
    'Au quotidien',
    ['Tableau de bord', 'Mouvements', 'Budget', 'Bilan du mois', 'Abonnements'],
  ],
  ['Patrimoine', ['Comptes', 'Épargne', 'Crypto', 'Dépenses partagées']],
  ['Outils', ['Relevés']],
] as const

/** The month in the app's frame (#401): fixed under the header. */
function MonthBar({ data }: { data: MonthData }) {
  return (
    <div className="bg-background flex h-11 shrink-0 items-center justify-center gap-1 border-b px-2">
      <Button iconOnly ghost variant="secondary" aria-label="Mois précédent">
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-36 text-center text-sm font-semibold">
        {data.label}
      </span>
      <Button
        iconOnly
        ghost
        variant="secondary"
        aria-label="Mois suivant"
        disabled={data.partial !== null}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

/** The account, the average period and « Exceptionnelles », as today. */
function FilterControls({
  oneOffs,
  onOneOffsChange,
}: {
  oneOffs: boolean
  onOneOffsChange: (on: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex flex-wrap items-center gap-1.5 [&_select]:pr-7 [&_select]:pl-2.5 [&_select]:text-sm">
      <NativeSelect aria-label="Compte" className="w-auto max-w-32">
        <NativeSelectOption value="">Comptes</NativeSelectOption>
        <NativeSelectOption value="courant">Compte courant</NativeSelectOption>
      </NativeSelect>
      <NativeSelect aria-label="Période de la moyenne" className="w-auto">
        <NativeSelectOption value="6">Moy. 6 mois</NativeSelectOption>
        <NativeSelectOption value="3">Moy. 3 mois</NativeSelectOption>
        <NativeSelectOption value="12">Moy. 12 mois</NativeSelectOption>
      </NativeSelect>
      <div className="flex min-h-8 items-center gap-2">
        <Switch
          id={id}
          checked={oneOffs}
          onCheckedChange={onOneOffsChange}
          aria-label="Inclure les opérations exceptionnelles"
        />
        <Label htmlFor={id} className="text-sm font-normal">
          Exceptionnelles
        </Label>
      </div>
    </div>
  )
}

/** « Mois en cours : données jusqu’au 12 nov., comparées au 1–12 oct. » */
export function PeriodNote({ data }: { data: MonthData }) {
  if (!data.partial) return null
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
      <CalendarClockIcon aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>
        Mois en cours : données jusqu’au {data.partial.through}, comparées au{' '}
        {data.previousName}.
      </span>
    </p>
  )
}

export function Frame({
  width,
  data,
  oneOffs,
  onOneOffsChange,
  children,
}: {
  width: Width
  data: MonthData
  oneOffs: boolean
  onOneOffsChange: (on: boolean) => void
  children: ReactNode
}) {
  const computer = width >= 768
  return (
    <div
      className="bg-background text-foreground relative mx-auto flex min-h-screen flex-col border-x"
      style={{ width }}
    >
      <header className="bg-background sticky top-0 z-10 flex h-12 shrink-0 items-center gap-1 border-b px-2">
        {!computer && (
          <Button iconOnly ghost variant="secondary" aria-label="Menu">
            <MenuIcon />
          </Button>
        )}
        <span className="flex items-center gap-2 px-1">
          <span className="bg-primary text-primary-foreground grid size-6 place-items-center rounded-md text-xs font-bold">
            F
          </span>
          <span className="font-semibold tracking-tight">Finances</span>
        </span>
        <span className="ml-auto">
          <Button
            iconOnly
            variant="secondary"
            ghost
            aria-label="Actions de la page"
          >
            <EllipsisVerticalIcon />
          </Button>
        </span>
        <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-full text-xs font-semibold">
          CD
        </span>
      </header>
      <div className="flex min-h-0 flex-1">
        {computer && (
          <nav
            aria-hidden
            className="bg-sidebar text-muted-foreground w-56 shrink-0 space-y-4 border-r p-3 text-sm"
          >
            {NAV.map(([group, items]) => (
              <div key={group} className="space-y-1">
                <p className="px-2 text-xs">{group}</p>
                {items.map((item) => (
                  <p
                    key={item}
                    className={cn(
                      'rounded-md px-2 py-1.5',
                      item === 'Mouvements' &&
                        'bg-primary/10 text-primary font-medium',
                    )}
                  >
                    {item}
                  </p>
                ))}
              </div>
            ))}
          </nav>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <MonthBar data={data} />
          <main
            className={cn(
              '@container min-w-0 flex-1 space-y-6',
              computer ? 'p-6' : 'px-4 py-4',
            )}
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold md:text-2xl">
                  Mouvements
                </h1>
                {!computer && (
                  <Button
                    variant="secondary"
                    outline
                    className="ml-auto rounded-full px-3"
                    iconStart={<SlidersHorizontalIcon aria-hidden />}
                  >
                    Filtres
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <PeriodNote data={data} />
                {computer && (
                  <span className="ml-auto">
                    <FilterControls
                      oneOffs={oneOffs}
                      onOneOffsChange={onOneOffsChange}
                    />
                  </span>
                )}
              </div>
            </div>
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Small pieces
 * ------------------------------------------------------------------------- */

export function Section({
  title,
  action,
  className,
  id,
  children,
}: {
  title: ReactNode
  action?: ReactNode
  className?: string
  id?: string
  children: ReactNode
}) {
  return (
    <Card size="sm" className={cn('min-w-0', className)} id={id}>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function signed(cents: number, whole = true): string {
  const text = (whole ? formatWholeEuros : formatEuros)(Math.abs(cents))
  if (cents === 0) return text
  return `${cents > 0 ? '+' : '−'}${text}`
}

/** A signed change with its arrow, coloured by whether it is good news. */
export function Delta({
  cents,
  kind,
  className,
}: {
  cents: number
  kind: Kind
  className?: string
}) {
  const good = cents === 0 ? null : cents > 0 === RISE_IS_GOOD[kind]
  const Icon =
    cents === 0 ? MinusIcon : cents > 0 ? ArrowUpRightIcon : ArrowDownRightIcon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium whitespace-nowrap tabular-nums',
        good === true && 'text-chart-delta-good',
        good === false && 'text-chart-delta-bad',
        good === null && 'text-muted-foreground',
        className,
      )}
    >
      <Icon aria-hidden className="size-[1em] shrink-0" />
      {signed(cents)}
    </span>
  )
}

export function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  )
}

/** Same dimensions as the app's `CategoryIcon` rows. */
function ItemIcon({ item, size = 'md' }: { item: Item; size?: 'sm' | 'md' }) {
  return <CategoryIcon icon={item.icon} color={item.color} size={size} />
}

/* ---------------------------------------------------------------------------
 * KPIs: today's four tiles, for any kind
 * ------------------------------------------------------------------------- */

function ComparisonTile({
  label,
  children,
  detail,
}: {
  label: string
  children: ReactNode
  detail: ReactNode
}) {
  return (
    <Card size="sm" className="@container min-w-0 gap-2">
      <p className="text-muted-foreground px-3 text-sm leading-tight">
        {label}
      </p>
      <div className="min-w-0 px-3 text-[clamp(0.75rem,12cqi,1.25rem)] leading-tight font-semibold">
        {children}
      </div>
      <p className="text-muted-foreground px-3 text-xs">{detail}</p>
    </Card>
  )
}

/** The biggest rise (expenses) or the biggest change (income, savings). */
function biggestChange(items: readonly Item[], kind: Kind) {
  let best: Item | null = null
  for (const item of items) {
    const delta = item.cents - item.previousCents
    const wanted = kind === 'expense' ? delta > 0 : delta !== 0
    if (!wanted) continue
    if (!best || Math.abs(delta) > Math.abs(best.cents - best.previousCents))
      best = item
  }
  return best
}

export function Kpis({
  kind,
  data,
  items,
  hideTotal = false,
}: {
  kind: Kind
  data: MonthData
  items: readonly Item[]
  /** The total is already said above (direction B's tiles). */
  hideTotal?: boolean
}) {
  const now = total(items)
  const previous = totalOf(items, 'previousCents')
  const average = totalOf(items, 'averageCents')
  const biggest = biggestChange(items, kind)
  const previousIn = data.partial
    ? `au ${data.previousName}`
    : `en ${data.previousName}`
  return (
    <section aria-label="Indicateurs du mois">
      <div
        className={cn(
          'grid grid-cols-1 gap-2 @lg:grid-cols-2',
          hideTotal ? '@2xl:grid-cols-3' : '@2xl:grid-cols-4',
        )}
      >
        {!hideTotal && (
          <StatCard
            label={FIGURE_LABEL[kind]}
            value={now}
            trend={trend(kind, data.month).map((m) => m.cents)}
            trendLabel="Les 12 derniers mois"
          />
        )}
        <ComparisonTile
          label={
            data.partial
              ? `Par rapport au ${data.previousName}`
              : `Par rapport à ${data.previousName}`
          }
          detail={`${formatWholeEuros(previous)} ${previousIn}`}
        >
          <Delta cents={now - previous} kind={kind} />
        </ComparisonTile>
        <ComparisonTile
          label="Écart avec la moyenne"
          detail={`${formatWholeEuros(average)} en moyenne sur 6 mois${data.partial ? ', mêmes jours' : ''}`}
        >
          <Delta cents={now - average} kind={kind} />
        </ComparisonTile>
        <ComparisonTile
          label={kind === 'expense' ? 'Plus forte hausse' : 'Plus grand écart'}
          detail={
            biggest ? (
              <Delta
                cents={biggest.cents - biggest.previousCents}
                kind={kind}
              />
            ) : (
              'Rien n’a bougé'
            )
          }
        >
          <span className="block truncate">{biggest?.name ?? 'Aucune'}</span>
        </ComparisonTile>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------
 * The donut
 * ------------------------------------------------------------------------- */

export function Donut({
  kind,
  items,
  monthLabel,
  height = 220,
}: {
  kind: Kind
  items: readonly Item[]
  monthLabel: string
  height?: number
}) {
  const slices = items
    .filter((item) => item.cents > 0)
    .map((item) => ({
      id: item.id,
      label: item.name,
      value: item.cents,
      color: item.color ?? 'var(--chart-other)',
      icon: <ItemIcon item={item} size="sm" />,
    }))
  return (
    <DonutChart
      data={slices}
      centerLabel={FIGURE_LABEL[kind]}
      centerFormatter={() => formatWholeEuros(total(items))}
      height={height}
      label={`${FIGURE_LABEL[kind]} en ${monthLabel}`}
      emptyMessage="Rien ce mois-ci"
    />
  )
}

/* ---------------------------------------------------------------------------
 * The ranking, with today's comparison control
 * ------------------------------------------------------------------------- */

const FIT = 'px-2 text-[min(0.875rem,6.2cqi)]'

export function ComparisonControl({
  value,
  onChange,
  data,
}: {
  value: Comparison
  onChange: (next: Comparison) => void
  data: MonthData
}) {
  return (
    <div className="@container mb-2">
      <div className="flex flex-col gap-1.5">
        <SegmentedControl
          aria-label="Comparer chaque ligne avec"
          fullWidth
          value={value}
          onValueChange={onChange}
        >
          <SegmentedControlItem value="previous" className={FIT}>
            Mois précédent
          </SegmentedControlItem>
          <SegmentedControlItem value="average" className={FIT}>
            Moyenne
          </SegmentedControlItem>
        </SegmentedControl>
        <p className="text-muted-foreground text-xs">
          {value === 'previous'
            ? `Comparé ${data.partial ? 'au' : 'à'} ${data.previousName}`
            : `Comparé à la moyenne sur 6 mois${data.partial ? ', mêmes jours' : ''}`}
        </p>
      </div>
    </div>
  )
}

function RowBar({
  item,
  share,
  color,
}: {
  item: Item
  share: number
  color: string
}) {
  const ratio = item.targetCents ? item.cents / item.targetCents : null
  const over = ratio !== null && ratio > 1
  const filled = ratio ?? share
  const expected =
    item.targetCents && item.expectedCents
      ? Math.min(1 - Math.min(1, filled), item.expectedCents / item.targetCents)
      : 0
  return (
    <div
      aria-hidden
      className="bg-muted flex h-1.5 overflow-hidden rounded-full"
    >
      <div
        className="h-full shrink-0"
        style={{
          width: `${Math.min(1, Math.max(0, filled)) * 100}%`,
          backgroundColor: over ? 'var(--chart-over)' : color,
        }}
      />
      {expected > 0 && (
        <div
          className="h-full shrink-0 opacity-35"
          style={{ width: `${expected * 100}%`, backgroundColor: color }}
        />
      )}
    </div>
  )
}

const percent = (ratio: number) => `${Math.round(ratio * 100)} %`

function Row({
  item,
  kind,
  comparison,
  sum,
}: {
  item: Item
  kind: Kind
  comparison: Comparison
  sum: number
}) {
  const color = item.color ?? 'var(--chart-other)'
  const base =
    comparison === 'previous' ? item.previousCents : item.averageCents
  const notYet = item.cents === 0 && (item.expectedCents ?? 0) > 0
  const ratio = item.targetCents ? item.cents / item.targetCents : null
  return (
    <li>
      <a
        href="#operations"
        onClick={(event) => event.preventDefault()}
        aria-label={`${item.name} : ${formatEuros(item.cents)}, voir les opérations`}
        className="hover:bg-muted/60 flex items-center gap-2.5 rounded-lg px-2 py-2.5"
      >
        <ItemIcon item={item} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {item.name}
            </span>
            <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
              {kind === 'savings'
                ? signed(item.cents, false)
                : formatEuros(item.cents)}
            </span>
          </div>
          <RowBar
            item={item}
            share={sum > 0 ? item.cents / sum : 0}
            color={color}
          />
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {kind === 'savings' ? (
                <span className="tabular-nums">
                  {item.outCents
                    ? `Versé ${formatWholeEuros(item.inCents ?? 0)} · retiré ${formatWholeEuros(item.outCents)}`
                    : item.group}
                </span>
              ) : ratio === null ? (
                <span className="tabular-nums">
                  {percent(sum > 0 ? item.cents / sum : 0)} du total
                </span>
              ) : (
                <span
                  className={cn(
                    'tabular-nums',
                    kind === 'expense' &&
                      ratio > 1 &&
                      'text-chart-delta-bad font-medium',
                  )}
                >
                  {percent(ratio)}{' '}
                  {kind === 'expense' ? 'du budget' : 'du prévu'} (
                  <span className="whitespace-nowrap">
                    {formatWholeEuros(item.targetCents!)}
                  </span>
                  )
                </span>
              )}
              {(item.expectedCents ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
                  <ClockIcon aria-hidden className="size-3.5 shrink-0" />
                  {formatWholeEuros(item.expectedCents!)} attendus
                </span>
              )}
            </span>
            {notYet ? (
              <span className="ml-auto">Pas encore ce mois-ci</span>
            ) : (
              <span className="ml-auto">
                <Delta cents={item.cents - base} kind={kind} />
              </span>
            )}
          </div>
        </div>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </a>
    </li>
  )
}

/** Rows with nothing this month (and nothing expected) fold away. */
function isQuiet(item: Item) {
  return item.cents === 0 && !item.expectedCents && !item.outCents
}

export function Ranking({
  kind,
  items,
  comparison,
}: {
  kind: Kind
  items: readonly Item[]
  comparison: Comparison
}) {
  const [open, setOpen] = useState(false)
  const moving = items
    .filter((item) => !isQuiet(item))
    .sort(
      (a, b) =>
        b.cents - a.cents || (b.expectedCents ?? 0) - (a.expectedCents ?? 0),
    )
  const quiet = items.filter(isQuiet)
  const shown = open ? [...moving, ...quiet] : moving
  const sum = moving.reduce((s, item) => s + Math.max(0, item.cents), 0)
  const what =
    kind === 'savings'
      ? 'les comptes sans mouvement'
      : `les catégories sans ${kind === 'expense' ? 'dépense' : 'revenu'}`
  return (
    <div className="space-y-2">
      <ul className="divide-y">
        {shown.map((item) => (
          <Row
            key={item.id}
            item={item}
            kind={kind}
            comparison={comparison}
            sum={sum}
          />
        ))}
      </ul>
      {quiet.length > 0 && (
        <Button
          variant="secondary"
          ghost
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDownIcon
            aria-hidden
            className={cn('transition-transform', open && 'rotate-180')}
          />
          {open ? `Masquer ${what}` : `Afficher ${what} (${quiet.length})`}
        </Button>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * The 12-month trend (a light copy of today's chart)
 * ------------------------------------------------------------------------- */

const MONTH_INITIAL = [
  'J',
  'F',
  'M',
  'A',
  'M',
  'J',
  'J',
  'A',
  'S',
  'O',
  'N',
  'D',
]
const MONTH_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]

const CHIP =
  'inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap'

export function Trend({
  kind,
  data,
  items,
  series,
}: {
  kind: Kind
  data: MonthData
  items: readonly Item[]
  /** A switch between kinds above the chips (direction C). */
  series?: ReactNode
}) {
  const [chip, setChip] = useState<string | null>(null)
  const chips = [...items]
    .filter((item) => item.averageCents > 0)
    .sort((a, b) => b.averageCents - a.averageCents)
    .slice(0, 4)
  const allAverage = totalOf(items, 'averageCents') || 1
  const picked = chips.find((c) => c.id === chip)
  const months = trend(kind, data.month).map((m, i, all) => {
    // A chip shows one row's share of each month (shaped, synthetic).
    if (!picked) return m
    const wobble = 1 + 0.18 * Math.sin(i * 1.7 + picked.id.length)
    const share = picked.averageCents / allAverage
    return {
      ...m,
      cents:
        i === all.length - 1
          ? picked.cents
          : Math.round((m.cents * share * wobble) / 100) * 100,
    }
  })
  const max = Math.max(...months.map((m) => m.cents), 1) * 1.15
  // The 6 months before the one shown, as the KPIs.
  const before = months.slice(-7, -1)
  const average =
    before.reduce((s, m) => s + m.cents, 0) / Math.max(1, before.length)
  const color = picked?.color ?? KIND_COLOR[kind]
  const last = months.at(-1)!
  return (
    <div className="@container space-y-3">
      {series}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          className={cn(
            CHIP,
            chip === null
              ? 'border-primary bg-primary/10 text-primary'
              : 'bg-background hover:bg-muted',
          )}
          onClick={() => setChip(null)}
        >
          Tout
        </button>
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className={cn(
              CHIP,
              chip === c.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'bg-background hover:bg-muted',
            )}
            onClick={() => setChip(c.id)}
          >
            <ItemIcon item={c} size="sm" />
            {c.name}
          </button>
        ))}
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">
          {MONTH_SHORT[Number(last.month.slice(5)) - 1]}
          {data.partial ? ` (au ${data.partial.through})` : ''} :{' '}
        </span>
        <span className="font-semibold tabular-nums">
          {formatWholeEuros(last.cents)}
        </span>
        <span className="text-muted-foreground">
          {' '}
          · moyenne {formatWholeEuros(average)}
        </span>
      </p>
      <div className="relative h-[168px] @[34rem]:h-[232px]">
        <div
          aria-hidden
          className="border-muted-foreground/60 absolute inset-x-0 border-t border-dashed"
          style={{ bottom: `${(average / max) * 100}%` }}
        />
        <div className="absolute inset-0 flex items-end gap-1">
          {months.map((m, i) => {
            const selected = i === months.length - 1
            const partial = selected && data.partial !== null
            return (
              <div
                key={m.month}
                className="h-full flex-1"
                title={`${MONTH_SHORT[Number(m.month.slice(5)) - 1]} : ${formatWholeEuros(m.cents)}`}
              >
                <div className="flex h-full items-end">
                  <div
                    className={cn(
                      'w-full rounded-t-sm',
                      !selected && 'opacity-45',
                    )}
                    style={{
                      height: `${(m.cents / max) * 100}%`,
                      background: partial
                        ? `repeating-linear-gradient(135deg, ${color} 0 4px, color-mix(in oklch, ${color} 35%, transparent) 4px 8px)`
                        : color,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="text-muted-foreground flex gap-1 text-[0.65rem]">
        {months.map((m, i) => (
          <span
            key={m.month}
            className={cn(
              'flex-1 text-center',
              i === months.length - 1 && 'text-foreground font-semibold',
            )}
          >
            {MONTH_INITIAL[Number(m.month.slice(5)) - 1]}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * The notes under the figures
 * ------------------------------------------------------------------------- */

export function Notes({
  kind,
  data,
  oneOffs,
}: {
  kind: Kind
  data: MonthData
  oneOffs: boolean
}) {
  const expected = totalOf(data[kind], 'expectedCents')
  return (
    <p className="text-muted-foreground text-xs">
      {kind === 'savings'
        ? 'Virements de vos comptes courants vers vos livrets et placements, retraits déduits. Ni revenu, ni dépense. '
        : 'Virements entre vos comptes exclus. '}
      {kind === 'expense' &&
        data.oneOffCents > 0 &&
        (oneOffs
          ? `Dont ${formatWholeEuros(data.oneOffCents)} de dépenses exceptionnelles. `
          : `Dépenses exceptionnelles exclues : ${formatWholeEuros(data.oneOffCents)}. `)}
      {expected > 0 &&
        (kind === 'expense'
          ? `Abonnements et charges fixes attendus d’ici la fin du mois : ${formatWholeEuros(expected)}, non comptés.`
          : `Attendu d’ici la fin du mois : ${formatWholeEuros(expected)}, non compté.`)}
    </p>
  )
}

/** One kind's detail as today's Dépenses page: KPIs, donut + ranking, trend. */
export function KindDetail({
  kind,
  data,
  oneOffs,
  hideTotal = false,
  trendSeries,
  withTrend = true,
}: {
  kind: Kind
  data: MonthData
  oneOffs: boolean
  hideTotal?: boolean
  trendSeries?: ReactNode
  withTrend?: boolean
}) {
  const [comparison, setComparison] = useState<Comparison>('previous')
  const items = data[kind]
  const monthName = data.label.split(' ')[0].toLowerCase()
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Kpis kind={kind} data={data} items={items} hideTotal={hideTotal} />
        <Notes kind={kind} data={data} oneOffs={oneOffs} />
      </div>
      <div className="grid items-start gap-4 @3xl:grid-cols-2">
        <Section title="Répartition" className="@3xl:sticky @3xl:top-4">
          <Donut kind={kind} items={items} monthLabel={monthName} />
        </Section>
        <Section title={kind === 'savings' ? 'Par compte' : 'Par catégorie'}>
          <ComparisonControl
            value={comparison}
            onChange={setComparison}
            data={data}
          />
          <Ranking kind={kind} items={items} comparison={comparison} />
        </Section>
      </div>
      {withTrend && (
        <Section title="Tendance sur 12 mois">
          <Trend kind={kind} data={data} items={items} series={trendSeries} />
        </Section>
      )}
    </div>
  )
}
