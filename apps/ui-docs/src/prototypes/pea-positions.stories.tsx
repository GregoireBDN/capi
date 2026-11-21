import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  AreaChart,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  formatSignedPercent,
  SegmentedControl,
  SegmentedControlItem,
  type ChartConfig,
} from '@finances/ui'
import {
  BanknoteIcon,
  CalendarClockIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  FileTextIcon,
  LandmarkIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
} from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

/**
 * Prototypes of a PEA's page with its lines (#413, ADR 0006), two
 * directions shown to the owner before one is built in `apps/web`.
 * Clickable mockups with synthetic data: invented ETFs whose ISINs start
 * with `ZZ` (valid check digits, never a real security), not app code.
 *
 * The page before (#360): « Valeur » (the typed value, « Investi » and its
 * bar, « Résultat » and « Sur 1 an »), the linked transfers, « Évolution »
 * and the values typed by hand. Nothing says what the PEA holds.
 *
 * A. Comme le Crypto : the summary keeps its shape and ends with the PEA's
 *    own facts (versements against the ceiling, the 5-year date); « Lignes »
 *    is the Crypto page's « Actifs »: one row per ETF (name, quantity and
 *    share, value and result), a tap unfolding its ISIN, « Investi »,
 *    « Résultat » and « Cours » as tiles; the cash last.
 * B. Tout à plat : the split by line heads the summary; « Lignes » shows
 *    every figure without unfolding (three short lines per ETF on a phone,
 *    a table with its columns on a computer), a tap opening the line's
 *    editor; « Le PEA » is a card of its own.
 *
 * Both: « Évolution » (value and invested), then « Relevés », the statements
 * the values come from (read by Claude or typed).
 */
const meta: Meta<PageArgs> = {
  title: 'Prototypes/Lignes du PEA (#413)',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic data (amounts in cents, quantities and prices as exact text)
 * ------------------------------------------------------------------------- */

interface Line {
  ticker: string
  name: string
  isin: string
  quantity: string
  /** PRU as the statement prints it. */
  unitCost: string | null
  price: string | null
  priceDay: string | null
  priceSource: 'relevé' | 'manuel' | null
  valueCents: number | null
  costCents: number | null
  color: string
}

const LINES: Line[] = [
  {
    ticker: 'MOND',
    name: 'ETF Monde (exemple)',
    isin: 'ZZ00MSCIWD03',
    quantity: '48',
    unitCost: '412,515',
    price: '498,32',
    priceDay: '31 oct.',
    priceSource: 'relevé',
    valueCents: 2_391_936,
    costCents: 1_980_072,
    color: 'var(--chart-1)',
  },
  {
    ticker: 'EMER',
    name: 'ETF Émergents (exemple)',
    isin: 'ZZ00EMMKT008',
    quantity: '210',
    unitCost: '24,182',
    price: '26,07',
    priceDay: '31 oct.',
    priceSource: 'relevé',
    valueCents: 547_470,
    costCents: 507_822,
    color: 'var(--chart-3)',
  },
  {
    ticker: 'EURO',
    name: 'ETF Europe 600 (exemple)',
    isin: 'ZZ00STOXX608',
    quantity: '35',
    unitCost: '118,90',
    price: '112,46',
    priceDay: '31 oct.',
    priceSource: 'relevé',
    valueCents: 393_610,
    costCents: 416_150,
    color: 'var(--chart-5)',
  },
]

/** A line added by hand today, its price not typed yet. */
const UNPRICED: Line = {
  ticker: 'NSDQ',
  name: 'ETF Nasdaq (exemple)',
  isin: 'ZZ00NASDAQ00',
  quantity: '6',
  unitCost: '101,40',
  price: null,
  priceDay: null,
  priceSource: null,
  valueCents: null,
  costCents: 60_840,
  color: 'var(--chart-2)',
}

const CASH_CENTS = 48_224
const VALUE_CENTS = 3_381_240
const INVESTED_CENTS = 3_040_000
const PREVIOUS_CENTS = 3_339_664
const YEAR_CHANGE_CENTS = 398_000
const YEAR_CHANGE_RATE = 0.1334
const CEILING_CENTS = 15_000_000

const HISTORY = [
  ['2025-11-30', 2_985_000, 2_640_000],
  ['2025-12-31', 3_020_000, 2_640_000],
  ['2026-01-31', 3_104_500, 2_740_000],
  ['2026-02-28', 3_062_000, 2_740_000],
  ['2026-03-31', 3_118_000, 2_840_000],
  ['2026-04-30', 3_051_400, 2_840_000],
  ['2026-05-31', 3_166_000, 2_940_000],
  ['2026-06-30', 3_210_900, 2_940_000],
  ['2026-07-31', 3_255_000, 3_040_000],
  ['2026-08-31', 3_190_200, 3_040_000],
  ['2026-09-30', 3_339_664, 3_040_000],
  ['2026-10-31', 3_381_240, 3_040_000],
].map(([date, value, contributions]) => ({
  date: date as string,
  value: value as number,
  contributions: contributions as number,
}))

const STATEMENTS = [
  { day: '31 oct. 2026', what: '3 lignes · lu par Claude', cents: 3_381_240 },
  { day: '30 sept. 2026', what: '3 lignes · lu par Claude', cents: 3_339_664 },
  { day: '31 août 2026', what: '3 lignes · saisi', cents: 3_190_200 },
  { day: '31 juil. 2026', what: 'valeur saisie', cents: 3_255_000 },
]

/* ---------------------------------------------------------------------------
 * Formatting
 * ------------------------------------------------------------------------- */

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})
const wholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const cents = (value: number) => euros.format(value / 100)
const whole = (value: number) => wholeEuros.format(value / 100)
const signed = (value: number) => `${value > 0 ? '+' : ''}${cents(value)}`
const signedWhole = (value: number) => `${value > 0 ? '+' : ''}${whole(value)}`
const tone = (value: number) =>
  cn(value > 0 && 'text-chart-delta-good', value < 0 && 'text-chart-delta-bad')
/** Exact text price → « 498,32 € » (display only). */
const price = (text: string) => `${text} €`
const share = (part: number, total: number) =>
  `${Math.round((part / total) * 1000) / 10} %`.replace('.', ',')
const parts = (quantity: string) =>
  `${quantity} part${quantity === '1' ? '' : 's'}`

/* ---------------------------------------------------------------------------
 * Frame: the app's header and page title around the page's column
 * ------------------------------------------------------------------------- */

type Width = 320 | 390 | 1280
type Direction = 'A' | 'B'
type Scenario = 'lignes' | 'sansCours' | 'vide'

interface PageArgs {
  direction: Direction
  scenario: Scenario
  width: Width
}

function Frame({ width, children }: { width: Width; children: ReactNode }) {
  const computer = width >= 768
  return (
    <div
      className="bg-background text-foreground mx-auto min-h-screen border-x"
      style={{ width }}
    >
      <header className="bg-background sticky top-0 z-10 flex h-12 items-center gap-2 border-b px-3">
        {computer && (
          <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md text-xs font-bold">
            F
          </span>
        )}
        <span className="text-muted-foreground inline-flex items-center gap-0.5 text-sm">
          <ChevronLeftIcon className="size-4" aria-hidden /> Comptes
        </span>
        <span className="ml-auto">
          <Button iconOnly variant="secondary" aria-label="Actions de la page">
            <EllipsisVerticalIcon />
          </Button>
        </span>
        <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-full text-xs font-semibold">
          GB
        </span>
      </header>
      <div className="flex">
        {computer && (
          <nav
            aria-hidden
            className="bg-sidebar text-muted-foreground w-56 shrink-0 space-y-2 border-r p-3 text-sm"
          >
            {['Tableau de bord', 'Dépenses', 'Budget', 'Revue du mois'].map(
              (item) => (
                <p key={item} className="px-2 py-1.5">
                  {item}
                </p>
              ),
            )}
            <p className="bg-primary/10 text-primary rounded-md px-2 py-1.5 font-medium">
              Comptes
            </p>
            {['Épargne', 'Crypto', 'Entre proches'].map((item) => (
              <p key={item} className="px-2 py-1.5">
                {item}
              </p>
            ))}
          </nav>
        )}
        <main
          className={cn(
            '@container min-w-0 flex-1 space-y-6',
            computer ? 'p-6' : 'px-4 py-4',
          )}
        >
          <div>
            <h1 className="text-xl font-semibold md:text-2xl">PEA</h1>
            <p className="text-muted-foreground text-sm">Banque Exemple</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

function CardHead({ title, status }: { title: string; status?: ReactNode }) {
  return (
    <CardHeader className="flex flex-row items-start gap-x-3">
      <div className="min-w-0 flex-1">
        <CardTitle>{title}</CardTitle>
        {status && (
          <p className="text-muted-foreground mt-0.5 text-sm">{status}</p>
        )}
      </div>
    </CardHeader>
  )
}

function LineBadge({ line }: { line: Pick<Line, 'ticker' | 'color'> }) {
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full text-[0.5rem] font-bold tracking-tighter text-white @max-[18rem]:hidden"
      style={{ background: line.color }}
    >
      {line.ticker}
    </span>
  )
}

function CashBadge() {
  return (
    <span
      aria-hidden
      className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full @max-[18rem]:hidden"
    >
      <BanknoteIcon className="size-4" />
    </span>
  )
}

function Tile({
  label,
  children,
  note,
  className,
  valueClassName,
}: {
  label: string
  children: ReactNode
  note?: ReactNode
  className?: string
  valueClassName?: string
}) {
  return (
    <div
      className={cn(
        'bg-muted/50 @container min-w-0 rounded-lg px-3 py-2',
        className,
      )}
    >
      <p className="text-muted-foreground truncate text-xs">{label}</p>
      <p
        className={cn(
          'text-[clamp(0.8rem,14cqi,1.15rem)] font-semibold whitespace-nowrap tabular-nums',
          valueClassName,
        )}
      >
        {children}
      </p>
      {note && <p className="text-xs whitespace-nowrap tabular-nums">{note}</p>}
    </div>
  )
}

/** « Investi 30 400 € » and the value split invested / result (#360). */
function InvestedBar({ value, invested }: { value: number; invested: number }) {
  const gain = value - invested
  const total = Math.max(value, invested)
  const pct = (part: number) => `${(part / total) * 100}%`
  return (
    <div className="bg-muted/50 space-y-2 rounded-lg px-3 py-2.5">
      <p className="flex items-baseline gap-3">
        <span className="text-muted-foreground text-sm">Investi</span>
        <span className="ml-auto text-base font-semibold whitespace-nowrap tabular-nums">
          {whole(invested)}
        </span>
      </p>
      <div className="bg-background flex h-2.5 overflow-hidden rounded-full">
        <span
          className="bg-muted-foreground/40 h-full"
          style={{ width: pct(Math.min(value, invested)) }}
        />
        <span
          className={cn(
            'border-background h-full border-l-2',
            gain > 0 ? 'bg-chart-delta-good' : 'bg-chart-delta-bad/60',
          )}
          style={{ width: pct(Math.abs(gain)) }}
        />
      </div>
    </div>
  )
}

/** The value as one bar of its lines and its cash, with a legend. */
function SplitBar({ lines }: { lines: Line[] }) {
  const priced = lines.filter((line) => line.valueCents !== null)
  const total =
    priced.reduce((sum, line) => sum + line.valueCents!, 0) + CASH_CENTS
  const segments = [
    ...priced.map((line) => ({
      key: line.ticker,
      label: line.name.replace(' (exemple)', ''),
      cents: line.valueCents!,
      color: line.color,
    })),
    {
      key: 'cash',
      label: 'Liquidités',
      cents: CASH_CENTS,
      color: 'var(--chart-other)',
    },
  ]
  return (
    <div className="space-y-2">
      <div
        role="img"
        aria-label="Répartition par ligne"
        className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            className="h-full"
            style={{
              width: `${(segment.cents / total) * 100}%`,
              background: segment.color,
            }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: segment.color }}
            />
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="tabular-nums">{share(segment.cents, total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ValueHead({ scenario }: { scenario: Scenario }) {
  return (
    <div className="space-y-1">
      <h2 className="text-muted-foreground text-sm">Valeur</h2>
      <p className="text-[clamp(1.5rem,12cqi,2.25rem)] leading-tight font-semibold whitespace-nowrap tabular-nums">
        {cents(VALUE_CENTS)}
      </p>
      <p className="text-muted-foreground text-sm">
        {scenario === 'vide'
          ? 'Saisie au 31 oct. · il y a 21 jours'
          : 'Au 31 oct. · d’après vos lignes'}
      </p>
      <p className="text-sm tabular-nums">
        <span className={tone(VALUE_CENTS - PREVIOUS_CENTS)}>
          {signed(VALUE_CENTS - PREVIOUS_CENTS)}
        </span>{' '}
        <span className="text-muted-foreground">depuis le 30 sept.</span>
      </p>
      {scenario === 'sansCours' && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          ETF Nasdaq n’a pas encore de cours : la valeur reste celle du 31 oct.
        </p>
      )}
    </div>
  )
}

function ResultTiles() {
  const gain = VALUE_CENTS - INVESTED_CENTS
  return (
    <div className="grid grid-cols-2 gap-2">
      <Tile
        label="Résultat"
        valueClassName={tone(gain)}
        note={
          <span className={tone(gain)}>
            {formatSignedPercent(gain / INVESTED_CENTS)}
          </span>
        }
      >
        {signedWhole(gain)}
      </Tile>
      <Tile
        label="Sur 1 an"
        valueClassName={tone(YEAR_CHANGE_CENTS)}
        note={
          <span className={tone(YEAR_CHANGE_CENTS)}>
            {formatSignedPercent(YEAR_CHANGE_RATE)}
          </span>
        }
      >
        {signedWhole(YEAR_CHANGE_CENTS)}
      </Tile>
    </div>
  )
}

function SourceLine() {
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p className="text-muted-foreground min-w-[9rem] flex-1 text-xs">
        Saisi au 2 janv. 2026 + 3 virements liés
      </p>
      <Button
        size="sm"
        variant="secondary"
        ghost
        iconStart={<PencilIcon />}
        className="ml-auto shrink-0"
      >
        Modifier
      </Button>
    </div>
  )
}

/** Versements against the 150 000 € ceiling, and the 5-year date. */
function PeaFacts() {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className="text-muted-foreground">Versements</span>
          <span className="ml-auto tabular-nums">
            <span className="font-semibold">{whole(INVESTED_CENTS)}</span>
            <span className="text-muted-foreground">
              {' '}
              sur {whole(CEILING_CENTS)}
            </span>
          </span>
        </p>
        <div className="bg-muted h-2 overflow-hidden rounded-full">
          <span
            className="bg-primary block h-full rounded-full"
            style={{ width: `${(INVESTED_CENTS / CEILING_CENTS) * 100}%` }}
          />
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          Encore {whole(CEILING_CENTS - INVESTED_CENTS)} possibles
        </p>
      </div>
      <p className="flex min-h-11 items-center gap-3 text-sm">
        <CalendarClockIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
        <span className="min-w-0 flex-1">
          5 ans le <span className="font-medium">12 mars 2027</span>
          <span className="text-muted-foreground block text-xs">
            Ouvert le 12 mars 2022 · retraits sans clôture ensuite
          </span>
        </span>
      </p>
    </div>
  )
}

function lineTotals(lines: Line[]) {
  const known = lines.filter(
    (line) => line.valueCents !== null && line.costCents !== null,
  )
  const cost = known.reduce((sum, line) => sum + line.costCents!, 0)
  const value = known.reduce((sum, line) => sum + line.valueCents!, 0)
  return { cost, gain: value - cost }
}

function linesOf(scenario: Scenario): Line[] {
  if (scenario === 'vide') return []
  return scenario === 'sansCours' ? [...LINES, UNPRICED] : LINES
}

function EmptyLines() {
  return (
    <div className="space-y-3 py-2 text-center">
      <p className="font-medium">Ce que contient votre PEA</p>
      <p className="text-muted-foreground mx-auto max-w-[28rem] text-sm">
        Ajoutez vos lignes pour voir chaque ETF, sa quantité, son prix de
        revient et son résultat. Claude peut aussi les lire sur votre relevé.
      </p>
      <div className="flex flex-col items-stretch gap-2 @min-[28rem]:flex-row @min-[28rem]:justify-center">
        <Button iconStart={<PlusIcon />}>Ajouter une ligne</Button>
        <Button outline variant="secondary" iconStart={<SparklesIcon />}>
          Lire un relevé avec Claude
        </Button>
      </div>
    </div>
  )
}

const chartConfig = {
  value: { label: 'Valeur', color: 'var(--chart-1)' },
  contributions: { label: 'Investi', color: 'var(--chart-2)' },
} satisfies ChartConfig

function EvolutionCard() {
  const [range, setRange] = useState<'6' | '12'>('12')
  const data = range === '6' ? HISTORY.slice(-6) : HISTORY
  return (
    <Card className="min-w-0">
      <CardHead title="Évolution" status="Valeur à chaque relevé" />
      <CardContent className="space-y-3">
        <SegmentedControl
          aria-label="Période"
          value={range}
          onValueChange={setRange}
          fullWidth
        >
          <SegmentedControlItem value="6">6 mois</SegmentedControlItem>
          <SegmentedControlItem value="12">1 an</SegmentedControlItem>
        </SegmentedControl>
        <AreaChart
          data={data}
          index="date"
          config={chartConfig}
          indexScale="time"
          indexLabel="Date"
          label="Valeur et montant investi du PEA à chaque relevé"
          height={200}
        />
      </CardContent>
    </Card>
  )
}

function StatementsCard() {
  return (
    <Card className="min-w-0">
      <CardHead
        title="Relevés"
        status="Chaque valeur, et les lignes qu’elle compte"
      />
      <CardContent>
        <ul className="divide-y">
          {STATEMENTS.map((statement) => (
            <li
              key={statement.day}
              className="flex min-h-11 items-center gap-3 py-2 text-sm"
            >
              <FileTextIcon
                aria-hidden
                className="text-muted-foreground size-4 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{statement.day}</span>
                <span className="text-muted-foreground block text-xs">
                  {statement.what}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">
                {cents(statement.cents)}
              </span>
              <ChevronRightIcon
                aria-hidden
                className="text-muted-foreground size-4 shrink-0"
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * A. Comme le Crypto
 * ------------------------------------------------------------------------- */

function SummaryA({ scenario }: { scenario: Scenario }) {
  return (
    <Card className="min-w-0">
      <CardContent className="@container space-y-4 pt-5">
        <ValueHead scenario={scenario} />
        <div className="space-y-2">
          <InvestedBar value={VALUE_CENTS} invested={INVESTED_CENTS} />
          <ResultTiles />
        </div>
        <SourceLine />
        <div className="border-t pt-4">
          <PeaFacts />
        </div>
      </CardContent>
    </Card>
  )
}

function LineRowA({ line, total }: { line: Line; total: number }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const gain =
    line.valueCents !== null && line.costCents !== null
      ? line.valueCents - line.costCents
      : null
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cn(
          'hover:bg-muted/60 flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm @min-[400px]:gap-3',
          open && 'bg-muted/40',
        )}
      >
        <LineBadge line={line} />
        <span className="block min-w-0 flex-1 space-y-0.5">
          <span className="block truncate font-medium">
            {line.name.replace(' (exemple)', '')}
          </span>
          <span className="text-muted-foreground block text-xs tabular-nums">
            <span className="whitespace-nowrap">{parts(line.quantity)}</span>
            {line.valueCents !== null && (
              <span className="whitespace-nowrap">
                {' '}
                · {share(line.valueCents, total)}
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 space-y-0.5 text-right">
          {line.valueCents === null ? (
            <Badge variant="warning" outline>
              Sans cours
            </Badge>
          ) : (
            <span className="block font-medium whitespace-nowrap tabular-nums">
              {cents(line.valueCents)}
            </span>
          )}
          {gain !== null && line.costCents !== null && (
            <span
              className={cn(
                'block text-xs whitespace-nowrap tabular-nums',
                tone(gain),
              )}
            >
              {formatSignedPercent(gain / line.costCents)}
            </span>
          )}
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      <div
        id={id}
        hidden={!open}
        className="mb-3 space-y-3 px-2 pt-1 text-xs @[18rem]:pl-[52px]"
      >
        <p className="text-muted-foreground tabular-nums">
          ISIN <span className="text-foreground font-mono">{line.isin}</span>
        </p>
        <div className="grid grid-cols-1 gap-1.5 @min-[400px]:grid-cols-3 @min-[400px]:gap-2">
          {line.costCents !== null && (
            <Fact label="Investi" note={`PRU ${price(line.unitCost!)}`}>
              {cents(line.costCents)}
            </Fact>
          )}
          {gain !== null && (
            <Fact
              label="Résultat"
              tone={tone(gain)}
              note={
                <span className={tone(gain)}>
                  {formatSignedPercent(gain / line.costCents!)}
                </span>
              }
            >
              {signed(gain)}
            </Fact>
          )}
          <Fact
            label="Cours"
            note={
              line.price
                ? `${line.priceSource}, ${line.priceDay}`
                : 'pas encore saisi'
            }
          >
            {line.price ? price(line.price) : '—'}
          </Fact>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            outline
            variant="secondary"
            iconStart={<PencilIcon />}
          >
            Modifier la ligne
          </Button>
          <Button size="sm" outline variant="secondary">
            {line.price ? 'Mettre à jour le cours' : 'Saisir le cours'}
          </Button>
        </div>
      </div>
    </li>
  )
}

/** A line on a phone (label left, figure right), a tile from 400px. */
function Fact({
  label,
  children,
  note,
  tone: toneClass,
}: {
  label: string
  children: ReactNode
  note?: ReactNode
  tone?: string
}) {
  return (
    <div className="bg-muted/50 flex min-w-0 items-center justify-between gap-3 rounded-lg px-3 py-2 @min-[400px]:block">
      <p className="text-muted-foreground min-w-0 truncate">{label}</p>
      <div className="shrink-0 text-right @min-[400px]:text-left">
        <p
          className={cn(
            'text-sm font-semibold whitespace-nowrap tabular-nums',
            toneClass,
          )}
        >
          {children}
        </p>
        {note && <p className="text-muted-foreground tabular-nums">{note}</p>}
      </div>
    </div>
  )
}

function LinesA({ scenario }: { scenario: Scenario }) {
  const lines = linesOf(scenario)
  const priced = lines.filter((line) => line.valueCents !== null)
  const total =
    priced.reduce((sum, line) => sum + line.valueCents!, 0) + CASH_CENTS
  const totals = lineTotals(lines)
  return (
    <Card className="min-w-0">
      <CardHead
        title="Lignes"
        status={
          lines.length > 0
            ? `${lines.length} lignes · cours du 31 oct.`
            : undefined
        }
      />
      <CardContent className="@container space-y-4">
        {lines.length === 0 ? (
          <EmptyLines />
        ) : (
          <>
            <SplitBar lines={lines} />
            <ul aria-label="Lignes" className="space-y-0.5">
              {lines.map((line) => (
                <LineRowA key={line.isin} line={line} total={total} />
              ))}
              <li className="flex min-h-11 items-center gap-2 px-2 py-2 text-sm @min-[400px]:gap-3">
                <CashBadge />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Liquidités</span>
                  <span className="text-muted-foreground block text-xs tabular-nums">
                    {share(CASH_CENTS, total)}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {cents(CASH_CENTS)}
                </span>
                <span aria-hidden className="size-4 shrink-0" />
              </li>
            </ul>
            <p className="text-muted-foreground border-t pt-3 text-xs tabular-nums">
              Prix de revient des lignes {whole(totals.cost)} · résultat{' '}
              <span className={tone(totals.gain)}>
                {signedWhole(totals.gain)}
              </span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PageA({ scenario }: { scenario: Scenario }) {
  return (
    <>
      <SummaryA scenario={scenario} />
      <LinesA scenario={scenario} />
      <EvolutionCard />
      <StatementsCard />
    </>
  )
}

/* ---------------------------------------------------------------------------
 * B. Tout à plat
 * ------------------------------------------------------------------------- */

function SummaryB({ scenario }: { scenario: Scenario }) {
  const lines = linesOf(scenario)
  return (
    <Card className="min-w-0">
      <CardContent className="@container space-y-4 pt-5">
        <ValueHead scenario={scenario} />
        {lines.length > 0 && <SplitBar lines={lines} />}
        <div className="space-y-2">
          <InvestedBar value={VALUE_CENTS} invested={INVESTED_CENTS} />
          <ResultTiles />
        </div>
        <SourceLine />
      </CardContent>
    </Card>
  )
}

/** Three short lines on a phone, every figure shown; a tap edits it. */
function LineRowB({ line, total }: { line: Line; total: number }) {
  const gain =
    line.valueCents !== null && line.costCents !== null
      ? line.valueCents - line.costCents
      : null
  return (
    <li>
      <button
        type="button"
        className="hover:bg-muted/60 flex w-full items-start gap-2 rounded-lg px-2 py-2.5 text-left text-sm @min-[400px]:gap-3"
      >
        <LineBadge line={line} />
        <span className="block min-w-0 flex-1 space-y-0.5">
          <span className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate font-medium">
              {line.name.replace(' (exemple)', '')}
            </span>
            {line.valueCents === null ? (
              <Badge variant="warning" outline>
                Sans cours
              </Badge>
            ) : (
              <span className="shrink-0 font-medium whitespace-nowrap tabular-nums">
                {cents(line.valueCents)}
              </span>
            )}
          </span>
          <span className="text-muted-foreground flex items-baseline gap-3 text-xs tabular-nums">
            <span className="min-w-0 flex-1 whitespace-nowrap">
              {line.quantity} × {line.price ? price(line.price) : '—'}
            </span>
            {line.valueCents !== null && (
              <span className="shrink-0">{share(line.valueCents, total)}</span>
            )}
          </span>
          <span className="text-muted-foreground flex items-baseline gap-3 text-xs tabular-nums">
            <span className="min-w-0 flex-1 whitespace-nowrap">
              PRU {line.unitCost ? price(line.unitCost) : '—'}
            </span>
            {gain !== null && (
              <span className={cn('shrink-0 whitespace-nowrap', tone(gain))}>
                {signed(gain)} · {formatSignedPercent(gain / line.costCents!)}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}

/** From 640px of card: one table, the columns the statement has. */
function LinesTable({ lines, total }: { lines: Line[]; total: number }) {
  const totals = lineTotals(lines)
  const head =
    'text-muted-foreground px-2 py-2 text-right text-xs font-normal whitespace-nowrap'
  const cell = 'px-2 py-2.5 text-right tabular-nums whitespace-nowrap'
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className={cn(head, 'text-left')}>Ligne</th>
          <th className={head}>Quantité</th>
          <th className={head}>PRU</th>
          <th className={head}>Cours</th>
          <th className={head}>Valeur</th>
          <th className={head}>Résultat</th>
          <th className={head}>Part</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {lines.map((line) => {
          const gain =
            line.valueCents !== null && line.costCents !== null
              ? line.valueCents - line.costCents
              : null
          return (
            <tr key={line.isin} className="hover:bg-muted/60 cursor-pointer">
              <td className="px-2 py-2.5">
                <span className="flex items-center gap-3">
                  <LineBadge line={line} />
                  <span className="min-w-0">
                    <span className="block font-medium">
                      {line.name.replace(' (exemple)', '')}
                    </span>
                    <span className="text-muted-foreground block font-mono text-xs">
                      {line.isin}
                    </span>
                  </span>
                </span>
              </td>
              <td className={cell}>{line.quantity}</td>
              <td className={cell}>
                {line.unitCost ? price(line.unitCost) : '—'}
              </td>
              <td className={cell}>
                {line.price ? (
                  <>
                    {price(line.price)}
                    <span className="text-muted-foreground block text-xs">
                      {line.priceDay}
                    </span>
                  </>
                ) : (
                  <Badge variant="warning" outline>
                    Sans cours
                  </Badge>
                )}
              </td>
              <td className={cn(cell, 'font-medium')}>
                {line.valueCents === null ? '—' : cents(line.valueCents)}
              </td>
              <td className={cn(cell, gain !== null && tone(gain))}>
                {gain === null ? (
                  '—'
                ) : (
                  <>
                    {signed(gain)}
                    <span className="block text-xs">
                      {formatSignedPercent(gain / line.costCents!)}
                    </span>
                  </>
                )}
              </td>
              <td className={cell}>
                {line.valueCents === null ? '—' : share(line.valueCents, total)}
              </td>
            </tr>
          )
        })}
        <tr>
          <td className="px-2 py-2.5">
            <span className="flex items-center gap-3">
              <CashBadge />
              <span className="font-medium">Liquidités</span>
            </span>
          </td>
          <td colSpan={3} />
          <td className={cn(cell, 'font-medium')}>{cents(CASH_CENTS)}</td>
          <td />
          <td className={cell}>{share(CASH_CENTS, total)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr className="border-t">
          <td className="text-muted-foreground px-2 py-2.5 text-xs">
            Prix de revient {whole(totals.cost)}
          </td>
          <td colSpan={3} />
          <td className={cn(cell, 'font-semibold')}>{cents(total)}</td>
          <td className={cn(cell, tone(totals.gain))}>{signed(totals.gain)}</td>
          <td className={cell}>100 %</td>
        </tr>
      </tfoot>
    </table>
  )
}

function LinesB({ scenario, width }: { scenario: Scenario; width: Width }) {
  const lines = linesOf(scenario)
  const priced = lines.filter((line) => line.valueCents !== null)
  const total =
    priced.reduce((sum, line) => sum + line.valueCents!, 0) + CASH_CENTS
  const totals = lineTotals(lines)
  return (
    <Card className="min-w-0">
      <CardHead
        title="Lignes"
        status={
          lines.length > 0
            ? `${lines.length} lignes · cours du 31 oct.`
            : undefined
        }
      />
      <CardContent className="@container">
        {lines.length === 0 ? (
          <EmptyLines />
        ) : width >= 768 ? (
          <LinesTable lines={lines} total={total} />
        ) : (
          <>
            <ul aria-label="Lignes" className="divide-y">
              {lines.map((line) => (
                <LineRowB key={line.isin} line={line} total={total} />
              ))}
              <li className="flex items-center gap-2 px-2 py-2.5 text-sm @min-[400px]:gap-3">
                <CashBadge />
                <span className="min-w-0 flex-1 font-medium">Liquidités</span>
                <span className="shrink-0 font-medium tabular-nums">
                  {cents(CASH_CENTS)}
                </span>
              </li>
            </ul>
            <p className="text-muted-foreground mt-2 border-t pt-3 text-xs tabular-nums">
              Prix de revient des lignes {whole(totals.cost)} · résultat{' '}
              <span className={tone(totals.gain)}>
                {signedWhole(totals.gain)}
              </span>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PeaCardB() {
  return (
    <Card className="min-w-0">
      <CardHead title="Le PEA" />
      <CardContent>
        <PeaFacts />
      </CardContent>
    </Card>
  )
}

function PageB({ scenario, width }: { scenario: Scenario; width: Width }) {
  return (
    <>
      <SummaryB scenario={scenario} />
      <LinesB scenario={scenario} width={width} />
      <PeaCardB />
      <EvolutionCard />
      <StatementsCard />
    </>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

function Page({ direction, scenario, width }: PageArgs) {
  return (
    <Frame width={width}>
      {direction === 'A' ? (
        <PageA scenario={scenario} />
      ) : (
        <PageB scenario={scenario} width={width} />
      )}
    </Frame>
  )
}

/**
 * One page: the direction, the case (« lignes » three ETFs and cash,
 * « sansCours » a line added without its price, « vide » no line yet) and
 * the width.
 */
export const UnePage: StoryObj<PageArgs> = {
  name: 'Une page',
  args: { direction: 'A', scenario: 'lignes', width: 390 },
  argTypes: {
    direction: { control: 'inline-radio', options: ['A', 'B'] },
    scenario: {
      control: 'inline-radio',
      options: ['lignes', 'sansCours', 'vide'],
    },
    width: { control: 'inline-radio', options: [320, 390, 1280] },
  },
  render: (args) => <Page {...args} />,
}

/** A and B at 390px, side by side. */
export const CoteACote: StoryObj<PageArgs> = {
  name: 'Côte à côte',
  args: { scenario: 'lignes' },
  argTypes: {
    scenario: {
      control: 'inline-radio',
      options: ['lignes', 'sansCours', 'vide'],
    },
  },
  render: ({ scenario }) => (
    <div className="flex items-start gap-6 p-6">
      {(['A', 'B'] as const).map((direction) => (
        <div key={direction} className="space-y-2">
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
            <LandmarkIcon className="size-4" aria-hidden />
            {direction === 'A' ? 'A. Comme le Crypto' : 'B. Tout à plat'}
          </p>
          <Page direction={direction} scenario={scenario} width={390} />
        </div>
      ))}
    </div>
  ),
}
