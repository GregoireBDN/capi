import type { Meta, StoryObj } from '@storybook/react-vite'
import { cn, PeriodBar, PeriodBarLabel } from '@capi/ui'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CarIcon,
  CheckIcon,
  ChevronRightIcon,
  FileUpIcon,
  HomeIcon,
  LockIcon,
  MenuIcon,
  PencilLineIcon,
  PiggyBankIcon,
  RepeatIcon,
  ShoppingCartIcon,
  SparklesIcon,
  TagIcon,
  TrendingUpIcon,
  UtensilsIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

/**
 * #541, the « Bilan du mois » redone: three directions on synthetic data
 * (octobre 2026, nothing real), phone and computer, each with what is left
 * and with nothing left. Not app code.
 *
 * A. La réponse d'abord: the month's figures on top, what is left as tiles.
 * B. L'anneau: what is left first, a ring that closes the month.
 * C. La carte du mois: the recap as it will be frozen, what is left pinned
 *    where it changes a figure.
 *
 * Deleted by the PR that builds the chosen direction.
 */
const meta: Meta = {
  title: 'Prototypes/Bilan du mois (#541)',
  parameters: { layout: 'fullscreen', docs: { disable: true } },
  tags: ['!autodocs'],
}

export default meta

type Story = StoryObj

/* ------------------------------------------------------------ the data */

const euros = (value: number) =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value)} €`

const MONTH = {
  income: 3120,
  expenses: 2480,
  saved: 640,
  rate: '21 %',
  previousExpenses: 2710,
  budget: 2600,
  netWorth: 48250,
  netWorthDelta: 1130,
}

const CATEGORIES: {
  name: string
  icon: LucideIcon
  color: string
  amount: number
  previous: number
  target?: number
}[] = [
  {
    name: 'Logement',
    icon: HomeIcon,
    color: '#3b82f6',
    amount: 920,
    previous: 920,
  },
  {
    name: 'Courses',
    icon: ShoppingCartIcon,
    color: '#eb6834',
    amount: 430,
    previous: 470,
  },
  {
    name: 'Restos',
    icon: UtensilsIcon,
    color: '#16a34a',
    amount: 260,
    previous: 180,
    target: 200,
  },
  {
    name: 'Transport',
    icon: CarIcon,
    color: '#8b5cf6',
    amount: 150,
    previous: 210,
  },
  {
    name: 'Loisirs',
    icon: SparklesIcon,
    color: '#db2777',
    amount: 120,
    previous: 160,
  },
]

interface Fix {
  key: string
  icon: LucideIcon
  count?: number
  label: string
  /** Under an icon (A). */
  short: string
  /** Where it sits on the recap (C). */
  pin: 'top' | 'expenses' | 'netWorth'
}

const FIXES: Fix[] = [
  {
    key: 'imports',
    icon: FileUpIcon,
    count: 6,
    label: 'jours manquants',
    short: 'Relevés',
    pin: 'top',
  },
  {
    key: 'review',
    icon: TagIcon,
    count: 4,
    label: 'à ranger',
    short: 'À ranger',
    pin: 'expenses',
  },
  {
    key: 'recurring',
    icon: RepeatIcon,
    count: 1,
    label: 'abonnement',
    short: 'Abos',
    pin: 'expenses',
  },
  {
    key: 'investments',
    icon: TrendingUpIcon,
    label: 'PEA',
    short: 'PEA',
    pin: 'netWorth',
  },
]

/** Seven steps the ring counts: done ones and the fixes left. */
const STEPS = 7

/* ----------------------------------------------------------- the frame */

function Chrome({ wide = false }: { wide?: boolean }) {
  return (
    <div className="glass-chrome relative z-20">
      <div className="flex h-12 items-center gap-2 px-2">
        <span className="bg-glass-fill text-foreground grid size-11 place-items-center rounded-full">
          <MenuIcon className="size-[1rem]" />
        </span>
        <span className="text-primary text-xl font-extrabold tracking-tight">
          Capi
        </span>
        {wide && (
          <span className="text-glass-muted-foreground ml-3 text-sm">
            Bilan du mois
          </span>
        )}
        <span className="bg-primary text-primary-foreground ml-auto grid size-11 place-items-center rounded-full text-xs font-semibold">
          CD
        </span>
      </div>
      <div className="@container px-2 pt-1 pb-2">
        <PeriodBar
          aria-label="Mois"
          previous={{ label: 'Mois précédent', onClick: () => {} }}
          next={{ label: 'Mois suivant', onClick: () => {} }}
        >
          <PeriodBarLabel
            aria-label="Octobre 2026"
            text="Octobre 2026"
            shortText="Oct. 2026"
          />
        </PeriodBar>
      </div>
    </div>
  )
}

function Phone({
  title,
  children,
  bar,
  sheet,
}: {
  title: string
  children: ReactNode
  bar?: ReactNode
  sheet?: ReactNode
}) {
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-muted-foreground px-1 text-xs">
        {title}
      </figcaption>
      <div
        data-glass-frame
        className="bg-background text-foreground relative flex h-[844px] w-[390px] flex-col overflow-hidden rounded-[1.6rem] shadow-[0_0_0_1px_rgb(0_0_0/8%)]"
      >
        <Chrome />
        <div className="flex-1 overflow-hidden px-3 pt-4 pb-28">{children}</div>
        {bar && <div className="absolute inset-x-3 bottom-4 z-10">{bar}</div>}
        {sheet}
      </div>
    </figure>
  )
}

function Computer({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-muted-foreground px-1 text-xs">
        {title}
      </figcaption>
      <div
        data-glass-frame
        className="bg-background text-foreground relative w-[1280px] overflow-hidden rounded-[1rem] shadow-[0_0_0_1px_rgb(0_0_0/8%)]"
      >
        <Chrome wide />
        <div className="mx-auto max-w-[1000px] p-6">{children}</div>
      </div>
    </figure>
  )
}

/* ------------------------------------------------------- shared pieces */

function Round({
  icon: Icon,
  color,
  className,
}: {
  icon: LucideIcon
  color: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'grid size-10 shrink-0 place-items-center rounded-full text-white',
        className,
      )}
      style={{ backgroundColor: color }}
    >
      <Icon className="size-[0.85rem]" />
    </span>
  )
}

const ORANGE = 'oklch(0.72 0.17 55)'
const GREEN = 'var(--chart-delta-good)'

/** A count in a disc, the app's review count (#502). */
function Count({ value, tone = 'primary' }: { value: number; tone?: string }) {
  return (
    <span
      className={cn(
        'grid size-[24px] place-items-center rounded-full text-[12px] font-semibold text-white',
        tone === 'primary' && 'bg-primary',
      )}
      style={tone === 'orange' ? { backgroundColor: ORANGE } : undefined}
    >
      {value}
    </span>
  )
}

function Delta({
  value,
  good,
  className,
}: {
  value: string
  good: boolean
  className?: string
}) {
  const Arrow = good ? ArrowDownIcon : ArrowUpIcon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        good
          ? 'bg-chart-delta-good/10 text-chart-delta-good'
          : 'bg-chart-delta-bad/10 text-chart-delta-bad',
        className,
      )}
    >
      <Arrow className="size-[0.7rem]" />
      {value}
    </span>
  )
}

/** Income and expenses as two bars of one scale, the saving between. */
function FlowBars() {
  const max = MONTH.income
  return (
    <div className="space-y-2.5">
      {[
        {
          label: 'Revenus',
          value: MONTH.income,
          color: GREEN,
          extra: null,
        },
        {
          label: 'Dépenses',
          value: MONTH.expenses,
          color: 'var(--chart-delta-bad)',
          extra: <Delta value={euros(230)} good />,
        },
      ].map((row) => (
        <div key={row.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="flex items-center gap-2">
              {row.extra}
              <span className="font-semibold tabular-nums">
                {euros(row.value)}
              </span>
            </span>
          </div>
          <div className="bg-glass-fill h-3 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.value / max) * 100}%`,
                backgroundColor: row.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** The budget: spent against the target, the target a notch. */
function BudgetLine() {
  const share = MONTH.expenses / MONTH.budget
  return (
    <div className="flex items-center gap-3">
      <WalletIcon className="text-muted-foreground size-[0.9rem] shrink-0" />
      <div className="bg-glass-fill relative h-2 flex-1 rounded-full">
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
        {euros(MONTH.expenses)} / {euros(MONTH.budget)}
      </span>
    </div>
  )
}

function CloseButton({
  ready,
  label = 'Clôturer',
  className,
}: {
  ready: boolean
  label?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'rounded-control flex h-12 items-center justify-center gap-2 px-5 text-sm font-semibold',
        ready
          ? 'bg-primary text-primary-foreground shadow-glass-primary'
          : 'bg-glass-fill text-foreground',
        className,
      )}
    >
      <LockIcon className="size-[0.85rem]" />
      {label}
    </span>
  )
}

function NoteButton() {
  return (
    <span
      aria-label="Note du mois"
      className="bg-glass-fill text-foreground grid size-12 shrink-0 place-items-center rounded-full"
    >
      <PencilLineIcon className="size-[0.9rem]" />
    </span>
  )
}

function Bar({ ready, left }: { ready: boolean; left?: number }) {
  return (
    <div className="glass-panel rounded-card flex items-center gap-2 p-2">
      <NoteButton />
      <CloseButton
        ready={ready}
        className="flex-1"
        label={ready ? 'Clôturer octobre' : 'Clôturer'}
      />
      {left !== undefined && left > 0 && <Count value={left} tone="orange" />}
    </div>
  )
}

/* ----------------------------------------- A · la réponse d'abord */

function AnswerCard({ big = false }: { big?: boolean }) {
  return (
    <section className="glass-card rounded-card space-y-4 p-4">
      <div className="flex items-center gap-3">
        <Round icon={PiggyBankIcon} color={GREEN} className="size-12" />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-chart-delta-good leading-none font-bold tabular-nums',
              big ? 'text-4xl' : 'text-3xl',
            )}
          >
            +{euros(MONTH.saved)}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            épargnés · {MONTH.rate}
          </p>
        </div>
      </div>
      <FlowBars />
      <BudgetLine />
    </section>
  )
}

function FixTile({ fix }: { fix: Fix }) {
  const Icon = fix.icon
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="relative">
        <span
          className="grid size-[52px] place-items-center rounded-full text-white shadow-[0_6px_14px_-8px_rgb(0_0_0/50%)]"
          style={{ backgroundColor: ORANGE }}
        >
          <Icon className="size-[1rem]" />
        </span>
        {fix.count !== undefined && (
          <span className="bg-foreground text-background absolute -top-1 -right-1 grid size-[24px] place-items-center rounded-full text-[12px] font-bold">
            {fix.count}
          </span>
        )}
      </span>
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {fix.short}
      </span>
    </div>
  )
}

function FixTiles() {
  return (
    <section className="glass-card rounded-card space-y-3 p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        À régler
      </h3>
      <div className="grid grid-cols-4 gap-1">
        {FIXES.map((fix) => (
          <FixTile key={fix.key} fix={fix} />
        ))}
      </div>
    </section>
  )
}

function AllGood() {
  return (
    <section className="glass-card rounded-card flex items-center gap-3 p-4">
      <span className="bg-chart-delta-good grid size-10 place-items-center rounded-full text-white">
        <CheckIcon className="size-[0.95rem]" strokeWidth={3} />
      </span>
      <span className="text-sm font-semibold">Tout est en ordre</span>
    </section>
  )
}

function TopCategories({ count = 3 }: { count?: number }) {
  return (
    <section className="glass-card rounded-card space-y-3 p-4">
      {CATEGORIES.slice(0, count).map((category) => (
        <div key={category.name} className="flex items-center gap-3">
          <Round icon={category.icon} color={category.color} />
          <span className="min-w-0 flex-1 text-sm">{category.name}</span>
          {category.amount !== category.previous && (
            <Delta
              value={euros(Math.abs(category.amount - category.previous))}
              good={category.amount < category.previous}
            />
          )}
          <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
            {euros(category.amount)}
          </span>
        </div>
      ))}
    </section>
  )
}

function PhoneA({ done = false }: { done?: boolean }) {
  return (
    <Phone
      title={done ? 'A · tout est réglé' : 'A · La réponse d’abord'}
      bar={<Bar ready={done} left={done ? 0 : FIXES.length} />}
    >
      <div className="space-y-4">
        <AnswerCard />
        {done ? <AllGood /> : <FixTiles />}
        {done && <TopCategories />}
      </div>
    </Phone>
  )
}

function ComputerA() {
  return (
    <Computer title="A · ordinateur">
      <div className="grid grid-cols-[1.3fr_1fr] items-start gap-6">
        <div className="space-y-4">
          <AnswerCard big />
          <TopCategories count={5} />
        </div>
        <div className="space-y-4">
          <FixTiles />
          <div className="flex gap-2">
            <NoteButton />
            <CloseButton ready={false} label="Clôturer" className="flex-1" />
          </div>
        </div>
      </div>
    </Computer>
  )
}

/* ------------------------------------------------------ B · l'anneau */

/** The steps as a ring: done ones green, the ones left orange. */
function Ring({ left, size = 210 }: { left: number; size?: number }) {
  const stroke = 16
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const gap = 6
  const segment = circumference / STEPS
  const done = STEPS - left
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        {Array.from({ length: STEPS }, (_, index) => (
          <circle
            key={index}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke={index < done ? GREEN : ORANGE}
            strokeDasharray={`${segment - gap - stroke} ${circumference}`}
            strokeDashoffset={-index * segment - stroke / 2}
          />
        ))}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {left === 0 ? (
          <span className="bg-primary text-primary-foreground shadow-glass-primary flex size-[132px] flex-col items-center justify-center gap-1 rounded-full text-sm font-semibold">
            <LockIcon className="size-[1.2rem]" />
            Clôturer
          </span>
        ) : (
          <span className="text-center leading-none">
            <span className="block text-5xl font-bold tabular-nums">
              {left}
            </span>
            <span className="text-muted-foreground mt-1 block text-sm">
              à régler
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

function FixRows() {
  return (
    <section className="glass-card rounded-card space-y-0.5 p-1.5">
      {FIXES.map((fix) => {
        const Icon = fix.icon
        return (
          <div
            key={fix.key}
            className="flex min-h-11 items-center gap-3 rounded-xl px-2"
          >
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full text-white"
              style={{ backgroundColor: ORANGE }}
            >
              <Icon className="size-[0.8rem]" />
            </span>
            <span className="min-w-0 flex-1 text-sm">
              {fix.count !== undefined && (
                <span className="font-bold tabular-nums">{fix.count} </span>
              )}
              {fix.label}
            </span>
            <ChevronRightIcon className="text-muted-foreground size-[0.9rem]" />
          </div>
        )
      })}
    </section>
  )
}

function MonthTiles() {
  const tiles = [
    { label: 'Revenus', value: euros(MONTH.income), tone: '' },
    {
      label: 'Dépenses',
      value: euros(MONTH.expenses),
      tone: '',
    },
    {
      label: 'Épargné',
      value: `+${euros(MONTH.saved)}`,
      tone: 'text-chart-delta-good',
    },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="glass-card rounded-card flex flex-col items-start p-3"
        >
          <span className="text-muted-foreground text-xs">{tile.label}</span>
          <span
            className={cn(
              'text-sm font-bold whitespace-nowrap tabular-nums',
              tile.tone,
            )}
          >
            {tile.value}
          </span>
          {tile.delta}
        </div>
      ))}
    </div>
  )
}

function PhoneB({ done = false }: { done?: boolean }) {
  return (
    <Phone title={done ? 'B · tout est réglé' : 'B · L’anneau'}>
      <div className="space-y-4">
        <Ring left={done ? 0 : FIXES.length} size={190} />
        {done ? <AllGoodRow /> : <FixRows />}
        <MonthTiles />
        {!done && (
          <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-xs">
            <LockIcon className="size-[0.7rem]" />
            Clôturer quand même
          </p>
        )}
      </div>
    </Phone>
  )
}

function AllGoodRow() {
  return (
    <p className="text-chart-delta-good flex items-center justify-center gap-2 text-sm font-semibold">
      <CheckIcon className="size-[0.9rem]" strokeWidth={3} />
      Tout est en ordre
    </p>
  )
}

function ComputerB() {
  return (
    <Computer title="B · ordinateur">
      <div className="grid grid-cols-[1fr_1.3fr] items-start gap-6">
        <div className="glass-card rounded-card space-y-4 p-6">
          <Ring left={FIXES.length} size={240} />
          <FixRows />
        </div>
        <div className="space-y-4">
          <MonthTiles />
          <TopCategories count={5} />
        </div>
      </div>
    </Computer>
  )
}

/* ---------------------------------------------- C · la carte du mois */

function Pin({ fix, className }: { fix: Fix; className?: string }) {
  const Icon = fix.icon
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-bold whitespace-nowrap text-white shadow-[0_4px_10px_-4px_rgb(0_0_0/40%)]',
        className,
      )}
      style={{ backgroundColor: ORANGE }}
    >
      <Icon className="size-[0.65rem]" />
      {fix.count !== undefined ? fix.count : fix.label}
      {fix.key === 'imports' && ' j'}
    </span>
  )
}

const pinsAt = (place: Fix['pin']) => FIXES.filter((fix) => fix.pin === place)

function RecapCard({
  pins,
  closed = false,
  wide = false,
  rows = 5,
}: {
  pins: boolean
  closed?: boolean
  wide?: boolean
  rows?: number
}) {
  const max = Math.max(...CATEGORIES.map((c) => Math.max(c.amount, c.previous)))
  return (
    <section className="glass-card rounded-card relative space-y-4 p-4">
      <header className="flex items-center gap-2">
        <h2 className="text-lg font-bold">Octobre</h2>
        {closed ? (
          <span className="bg-primary/10 text-primary ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
            <LockIcon className="size-[0.65rem]" /> Clôturé
          </span>
        ) : (
          pins &&
          pinsAt('top').map((fix) => (
            <Pin key={fix.key} fix={fix} className="ml-auto" />
          ))
        )}
      </header>

      <div
        className={cn(
          'grid items-start gap-x-3 gap-y-4',
          wide ? 'grid-cols-4' : 'grid-cols-2',
        )}
      >
        <Figure label="Revenus" value={euros(MONTH.income)} />
        <Figure
          label="Dépenses"
          value={euros(MONTH.expenses)}
          extra={<Delta value={euros(230)} good />}
          pins={pins ? pinsAt('expenses') : []}
        />
        <Figure
          label="Épargné"
          value={`+${euros(MONTH.saved)}`}
          tone="text-chart-delta-good"
          extra={
            <span className="text-muted-foreground text-xs">{MONTH.rate}</span>
          }
        />
        <Figure
          label="Patrimoine"
          value={euros(MONTH.netWorth)}
          extra={
            <span className="text-chart-delta-good text-xs font-semibold">
              +{euros(MONTH.netWorthDelta)}
            </span>
          }
          pins={pins ? pinsAt('netWorth') : []}
        />
      </div>

      <BudgetLine />

      <div className="space-y-2.5">
        {CATEGORIES.slice(0, rows).map((category) => (
          <div key={category.name} className="flex items-center gap-2.5">
            <Round
              icon={category.icon}
              color={category.color}
              className="size-8"
            />
            <div className="relative h-6 flex-1">
              {/* Last month: a ghost bar behind. */}
              <div
                className="bg-glass-fill absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${(category.previous / max) * 100}%` }}
              />
              <div
                className="absolute inset-y-1 left-0 rounded-full"
                style={{
                  width: `${(category.amount / max) * 100}%`,
                  backgroundColor: category.color,
                }}
              />
              {category.target && (
                <div
                  className="bg-foreground absolute -inset-y-0.5 w-[2px] rounded-full"
                  style={{ left: `${(category.target / max) * 100}%` }}
                />
              )}
            </div>
            <span className="w-16 text-right text-sm font-semibold whitespace-nowrap tabular-nums">
              {euros(category.amount)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Figure({
  label,
  value,
  tone,
  extra,
  pins = [],
}: {
  label: string
  value: string
  tone?: string
  extra?: ReactNode
  pins?: Fix[]
}) {
  return (
    <div
      className="bg-glass-fill relative rounded-xl p-2.5"
      style={
        pins.length > 0
          ? {
              backgroundColor: `color-mix(in oklch, ${ORANGE} 14%, transparent)`,
            }
          : undefined
      }
    >
      <span className="text-muted-foreground block text-xs">{label}</span>
      <span
        className={cn(
          'block text-lg leading-tight font-bold whitespace-nowrap tabular-nums',
          tone,
        )}
      >
        {value}
      </span>
      {extra && <span className="mt-0.5 block">{extra}</span>}
      {pins.length > 0 && (
        <span className="mt-2 flex gap-1">
          {pins.map((fix) => (
            <Pin key={fix.key} fix={fix} />
          ))}
        </span>
      )}
    </div>
  )
}

function PhoneC({ done = false }: { done?: boolean }) {
  return (
    <Phone
      title={done ? 'C · tout est réglé' : 'C · La carte du mois'}
      bar={<Bar ready={done} left={done ? 0 : FIXES.length} />}
    >
      <RecapCard pins={!done} rows={4} />
    </Phone>
  )
}

function ComputerC() {
  return (
    <Computer title="C · ordinateur">
      <div className="space-y-4">
        <RecapCard pins wide />
        <div className="flex justify-end gap-2">
          <NoteButton />
          <CloseButton ready={false} />
        </div>
      </div>
    </Computer>
  )
}

/* --------------------------------------------- shared: a fix's sheet */

const TO_FILE = [
  { label: 'CB CARREFOUR 12/10', amount: '−54,20 €', guess: CATEGORIES[1] },
  { label: 'PRLV SEPA FREE MOBILE', amount: '−19,99 €', guess: null },
  { label: 'CB LE PETIT BISTROT', amount: '−38,00 €', guess: CATEGORIES[2] },
  { label: 'VIR M. DUPONT', amount: '+25,00 €', guess: null },
]

function ReviewSheet() {
  return (
    <>
      <div className="glass-overlay absolute inset-0 z-30" />
      <div className="glass-panel rounded-t-sheet absolute inset-x-0 bottom-0 z-40 space-y-3 p-4 pb-6">
        <div className="bg-foreground/20 mx-auto h-1 w-10 rounded-full" />
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <TagIcon className="size-[0.9rem]" /> À ranger
          <Count value={4} tone="orange" />
        </h3>
        <div className="space-y-2">
          {TO_FILE.map((row) => (
            <div
              key={row.label}
              className="glass-card rounded-card flex items-center gap-2.5 p-2.5"
            >
              {row.guess ? (
                <Round
                  icon={row.guess.icon}
                  color={row.guess.color}
                  className="size-9"
                />
              ) : (
                <span className="bg-glass-fill text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full">
                  <TagIcon className="size-[0.75rem]" />
                </span>
              )}
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-xs">{row.label}</span>
                <span className="text-sm font-semibold tabular-nums">
                  {row.amount}
                </span>
              </span>
              {row.guess ? (
                <span className="bg-chart-delta-good grid size-10 place-items-center rounded-full text-white">
                  <CheckIcon className="size-[0.85rem]" strokeWidth={3} />
                </span>
              ) : (
                <span className="bg-glass-fill rounded-control px-3 py-2 text-xs font-semibold">
                  Choisir
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ClosedPhone() {
  return (
    <Phone
      title="Mois clôturé (C, comme A et B)"
      bar={
        <div className="flex justify-center">
          <span className="glass-panel rounded-control text-muted-foreground flex h-11 items-center gap-2 px-4 text-sm">
            Rouvrir
          </span>
        </div>
      }
    >
      <RecapCard pins={false} closed rows={4} />
    </Phone>
  )
}

/* ------------------------------------------------------------- stories */

function Board({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-svh flex-wrap items-start gap-6 p-6">
      {children}
    </div>
  )
}

export const Comparaison: Story = {
  render: () => (
    <Board>
      <PhoneA />
      <PhoneB />
      <PhoneC />
    </Board>
  ),
}

export const ToutRegle: Story = {
  render: () => (
    <Board>
      <PhoneA done />
      <PhoneB done />
      <PhoneC done />
    </Board>
  ),
}

export const FeuilleEtClos: Story = {
  render: () => (
    <Board>
      <Phone
        title="Toucher « 4 à ranger » : une feuille"
        sheet={<ReviewSheet />}
      >
        <div className="space-y-4">
          <AnswerCard />
          <FixTiles />
        </div>
      </Phone>
      <ClosedPhone />
    </Board>
  ),
}

export const OrdinateurA: Story = { render: () => <ComputerA /> }
export const OrdinateurB: Story = { render: () => <ComputerB /> }
export const OrdinateurC: Story = { render: () => <ComputerC /> }
