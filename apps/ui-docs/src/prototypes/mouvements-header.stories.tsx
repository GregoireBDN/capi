import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  Card,
  CardContent,
  cn,
  FilterControl,
  FilterToggle,
  Label,
  Switch,
} from '@finances/ui'
import {
  CalendarRangeIcon,
  ChevronDownIcon,
  LandmarkIcon,
  SlidersHorizontalIcon,
  TrendingDownIcon,
  ZapIcon,
} from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Prototypes for #410, after the comparison bars: the owner dislikes the
 * period note (« Mois en cours : données jusqu’au 12 nov., comparées au
 * 1–12 oct. ») and finds the three filters (« Comptes », « Moy. 6 mois »,
 * « Exceptionnelles ») unclear about what they act on. Synthetic data, not
 * app code: the file goes once the owner has chosen.
 *
 * A. À sa place : no filter row, no note. « Compte » beside the title (it
 *    acts on the whole page); the average's months chosen in the average
 *    bar itself; « Exceptionnelles » a switch under the bars, with the
 *    amount it adds.
 * B. Avec leur nom : the Opérations controls (#406), each with its name on
 *    it (« Compte Tous », « Moyenne 6 mois », « Exceptionnelles »), and a
 *    short line saying they act on the whole page; the note shortened to
 *    « Données jusqu’au 12 nov. ».
 * C. En une phrase : one sentence says what the page shows, each choice in
 *    it a link that opens its options: « Tous les comptes · comparés à la
 *    moyenne de 6 mois · sans les opérations exceptionnelles ».
 *
 * In A and C the note goes: the bars say how far the month goes and what it
 * is compared with (« Novembre, jusqu’au 12 », « Octobre, du 1er au 12 »).
 */
const meta: Meta<Args> = {
  title: 'Prototypes/Mouvements, en-tête et filtres (#410)',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
}
export default meta

type Direction = 'A' | 'B' | 'C'
type Width = 320 | 390 | 1280

interface Args {
  direction: Direction
  width: Width
}

/* ---------------------------------------------------------------------------
 * Shared pieces (static, synthetic: novembre au 12)
 * ------------------------------------------------------------------------- */

function Title({ end }: { end?: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold md:text-2xl">Mouvements</h1>
        {end && <span className="ml-auto">{end}</span>}
      </div>
      <p className="text-muted-foreground text-sm">
        Ce qui entre, ce qui sort et ce que vous mettez de côté.
      </p>
    </div>
  )
}

function Tiles() {
  const tiles = [
    ['Revenus', '689 €', 'var(--chart-income)'],
    ['Dépenses', '924 €', 'var(--chart-expense)'],
    ['Épargne', '300 €', 'var(--chart-savings)'],
  ] as const
  return (
    <Card size="sm" className="gap-3 px-2 md:px-3">
      <div className="grid grid-cols-3 gap-1.5 md:gap-2">
        {tiles.map(([label, value, color], i) => (
          <div
            key={label}
            className={cn(
              '@container rounded-xl border px-2 pt-2.5 pb-2',
              i === 1 ? 'border-primary bg-primary/5 ring-primary ring-1' : '',
            )}
            style={{ boxShadow: `inset 0 3px 0 ${color}` }}
          >
            <p className="text-muted-foreground truncate text-[clamp(0.5rem,13cqi,0.875rem)]">
              {label}
            </p>
            <p className="mt-1 text-[clamp(0.75rem,18cqi,1.5rem)] font-semibold whitespace-nowrap">
              {value}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Bar({
  label,
  value,
  ratio,
  strong,
  difference,
}: {
  label: ReactNode
  value: string
  ratio: number
  strong?: boolean
  difference?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2 text-sm">
        <span
          className={cn(
            'min-w-0 flex-1 break-normal',
            strong ? 'font-medium' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            'whitespace-nowrap tabular-nums',
            strong ? 'font-semibold' : 'text-muted-foreground',
          )}
        >
          {value}
        </span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            width: `${ratio * 100}%`,
            background: strong
              ? 'var(--chart-expense)'
              : 'color-mix(in oklch, var(--muted-foreground) 45%, transparent)',
          }}
        />
      </div>
      {difference && (
        <p className="text-chart-delta-good inline-flex items-center gap-1 text-xs font-medium">
          <TrendingDownIcon aria-hidden className="size-3.5" />
          {difference}
        </p>
      )}
    </div>
  )
}

/** The comparison card; A puts the average's months and the one-off switch in it. */
function Comparisons({
  averageLabel,
  footer,
}: {
  averageLabel?: ReactNode
  footer?: ReactNode
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <Bar label="Novembre, jusqu’au 12" value="924 €" ratio={0.71} strong />
        <Bar
          label="Octobre, du 1er au 12"
          value="1 023 €"
          ratio={0.79}
          difference="99 € de moins en novembre"
        />
        <Bar
          label={averageLabel ?? 'Moyenne des 6 mois précédents, du 1er au 12'}
          value="1 301 €"
          ratio={1}
          difference="378 € de moins en novembre"
        />
        {footer}
      </CardContent>
    </Card>
  )
}

function Heading() {
  return (
    <h2 className="flex items-center gap-2 px-1 text-lg font-semibold tracking-tight">
      <span
        aria-hidden
        className="size-2.5 rounded-full"
        style={{ background: 'var(--chart-expense)' }}
      />
      Dépenses
    </h2>
  )
}

const MONTHS = [3, 6, 12] as const

/* ---------------------------------------------------------------------------
 * A. À sa place
 * ------------------------------------------------------------------------- */

function AccountControl() {
  return (
    <FilterControl
      label="Compte"
      icon={<LandmarkIcon />}
      emptyLabel="Tous"
      onClear={() => undefined}
    >
      <p className="p-3 text-sm">
        Tous les comptes · Compte courant · Livret A
      </p>
    </FilterControl>
  )
}

function DirectionA() {
  const [months, setMonths] = useState<(typeof MONTHS)[number]>(6)
  const [oneOffs, setOneOffs] = useState(false)
  const id = useId()
  return (
    <>
      <Title end={<AccountControl />} />
      <Tiles />
      <Heading />
      <Comparisons
        averageLabel={
          <span className="inline-flex flex-wrap items-baseline gap-x-1">
            Moyenne des
            <label className="relative inline-flex items-center">
              <span className="sr-only">Mois de la moyenne</span>
              <select
                value={months}
                onChange={(event) => setMonths(Number(event.target.value) as 6)}
                className="text-foreground decoration-muted-foreground/60 appearance-none bg-transparent pr-4 font-medium underline decoration-dotted underline-offset-4"
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m} mois
                  </option>
                ))}
              </select>
              <ChevronDownIcon
                aria-hidden
                className="pointer-events-none absolute right-0 size-3.5"
              />
            </label>
            précédents, du 1er au 12
          </span>
        }
        footer={
          <div className="flex min-h-11 items-center gap-3 border-t pt-3">
            <Switch id={id} checked={oneOffs} onCheckedChange={setOneOffs} />
            <Label htmlFor={id} className="text-sm font-normal break-normal">
              Compter les dépenses exceptionnelles
              <span className="text-muted-foreground"> (250 € ce mois-ci)</span>
            </Label>
          </div>
        }
      />
    </>
  )
}

/* ---------------------------------------------------------------------------
 * B. Avec leur nom
 * ------------------------------------------------------------------------- */

function DirectionB({ wide }: { wide: boolean }) {
  const [oneOffs, setOneOffs] = useState(false)
  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      <AccountControl />
      <FilterControl
        label="Moyenne"
        icon={<CalendarRangeIcon />}
        value={{ label: '6 mois' }}
        onClear={() => undefined}
      >
        <p className="p-3 text-sm">3 mois · 6 mois · 12 mois</p>
      </FilterControl>
      <FilterToggle
        label="Exceptionnelles"
        icon={<ZapIcon />}
        pressed={oneOffs}
        onPressedChange={setOneOffs}
      />
    </div>
  )
  return (
    <>
      <Title
        end={
          wide ? undefined : (
            <Button
              variant="secondary"
              outline
              className="rounded-full px-3"
              iconStart={<SlidersHorizontalIcon aria-hidden />}
            >
              Filtres
            </Button>
          )
        }
      />
      {wide ? (
        <div className="space-y-1.5">
          {controls}
          <p className="text-muted-foreground px-1 text-xs">
            Pour toute la page · données jusqu’au 12 nov.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground px-1 text-xs">
          Tous les comptes · moyenne sur 6 mois · sans les exceptionnelles ·
          données jusqu’au 12 nov.
        </p>
      )}
      <Tiles />
      <Heading />
      <Comparisons />
    </>
  )
}

/* ---------------------------------------------------------------------------
 * C. En une phrase
 * ------------------------------------------------------------------------- */

function Choice({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className="text-foreground decoration-muted-foreground/60 pointer-coarse:touch-hitbox relative inline-flex items-baseline gap-0.5 font-medium underline decoration-dotted underline-offset-4"
    >
      {children}
      <ChevronDownIcon aria-hidden className="size-3.5 self-center" />
    </button>
  )
}

function DirectionC() {
  return (
    <>
      <Title />
      <p className="text-muted-foreground px-1 text-sm leading-relaxed">
        <Choice>Tous les comptes</Choice>, comparés à la{' '}
        <Choice>moyenne de 6 mois</Choice>,{' '}
        <Choice>sans les opérations exceptionnelles</Choice>.
      </p>
      <Tiles />
      <Heading />
      <Comparisons />
    </>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

function Page({ direction, width }: Args) {
  const wide = width >= 768
  return (
    <div
      className="bg-background text-foreground @container mx-auto space-y-5 border-x"
      style={{ width, padding: wide ? 24 : 16 }}
    >
      <div className="text-muted-foreground -mx-4 -mt-4 mb-2 flex h-11 items-center justify-center border-b text-sm font-semibold md:-mx-6 md:-mt-6">
        ‹ &nbsp; Novembre 2026 &nbsp; ›
      </div>
      {direction === 'A' && <DirectionA />}
      {direction === 'B' && <DirectionB wide={wide} />}
      {direction === 'C' && <DirectionC />}
    </div>
  )
}

const ARG_TYPES = {
  direction: { control: 'inline-radio', options: ['A', 'B', 'C'] },
  width: { control: 'inline-radio', options: [320, 390, 1280] },
} as const

export const UnePage: StoryObj<Args> = {
  name: 'Une page',
  args: { direction: 'A', width: 390 },
  argTypes: ARG_TYPES,
  render: (args) => <Page {...args} />,
}

const NAMES: Record<Direction, string> = {
  A: 'À sa place',
  B: 'Avec leur nom',
  C: 'En une phrase',
}

export const CoteACote: StoryObj<Pick<Args, 'width'>> = {
  name: 'Côte à côte',
  args: { width: 390 },
  argTypes: { width: ARG_TYPES.width },
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
          <Page direction={direction} width={args.width} />
        </div>
      ))}
    </div>
  ),
}
