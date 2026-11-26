import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card, cn } from '@capi/ui'
import {
  CheckIcon,
  ChevronRightIcon,
  DropletIcon,
  HouseIcon,
  ShieldIcon,
  TriangleAlertIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * #495, two more dashboard cards the owner found unclear: « Prélèvements »
 * (a debit is always money out, so no minus sign) and « Reste à dépenser »
 * (too many sentences). Three directions each, mockups with synthetic data,
 * not app code (deleted once the owner has chosen).
 */
const meta: Meta<Args> = {
  title: 'Prototypes/Prélèvements et reste à dépenser (#495)',
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

/** The app's card header: a muted title opening its page. */
function Head({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="text-muted-foreground flex min-h-9 items-center justify-between gap-3 px-2 text-xs">
      <span>{title}</span>
      <span className="flex items-center gap-2">
        {aside}
        <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
      </span>
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return <Card className="min-w-0 gap-0.5 px-2 pt-1.5 pb-2">{children}</Card>
}

/* ---------------------------------------------------------------------------
 * Prélèvements
 * ------------------------------------------------------------------------- */

// Today is Thursday 26 November.
const DEBITS: {
  day: number
  month: 'nov.' | 'déc.'
  when: string
  name: string
  cents: number
  icon: LucideIcon
  weekday: number // index in the strip, 0 = tomorrow
}[] = [
  {
    day: 27,
    month: 'nov.',
    when: 'Demain',
    name: 'Eau',
    cents: 8_400,
    icon: DropletIcon,
    weekday: 0,
  },
  {
    day: 28,
    month: 'nov.',
    when: 'Sam. 28',
    name: 'Antivirus',
    cents: 6_000,
    icon: ShieldIcon,
    weekday: 1,
  },
  {
    day: 1,
    month: 'déc.',
    when: 'Mar. 1er',
    name: 'Loyer',
    cents: 95_000,
    icon: HouseIcon,
    weekday: 4,
  },
  {
    day: 3,
    month: 'déc.',
    when: 'Jeu. 3',
    name: 'Électricité',
    cents: 6_100,
    icon: ZapIcon,
    weekday: 6,
  },
]
const DEBITS_TOTAL = DEBITS.reduce((sum, d) => sum + d.cents, 0)
const STRIP = ['V', 'S', 'D', 'L', 'M', 'M', 'J']

function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full"
    >
      <Icon className="size-4" />
    </span>
  )
}

/** A. The week's total on top, then each debit with its day under its name. */
function DebitsTotal() {
  return (
    <Shell>
      <Head title="Prélèvements · 7 j" />
      <div className="px-2 pb-2">
        <span className="text-[2rem] leading-tight font-semibold tracking-tight tabular-nums">
          {eur(DEBITS_TOTAL)}
        </span>
      </div>
      <ul className="border-t pt-1">
        {DEBITS.map((d) => (
          <li key={d.name} className="flex min-h-12 items-center gap-3 px-2">
            <IconBadge icon={d.icon} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{d.name}</span>
              <span className="text-muted-foreground block text-xs">
                {d.when}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {eur(d.cents)}
            </span>
          </li>
        ))}
      </ul>
    </Shell>
  )
}

/** B. The 7 days as a strip, a bar on each day that has a debit. */
function DebitsStrip() {
  const max = Math.max(...DEBITS.map((d) => d.cents))
  return (
    <Shell>
      <Head
        title="Prélèvements · 7 j"
        aside={
          <span className="text-foreground text-sm font-semibold tabular-nums">
            {eur(DEBITS_TOTAL)}
          </span>
        }
      />
      <div className="grid grid-cols-7 gap-1.5 px-2 pt-1 pb-3">
        {STRIP.map((letter, i) => {
          const debit = DEBITS.find((d) => d.weekday === i)
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="flex h-16 w-full items-end">
                <span
                  className={cn(
                    'w-full rounded-md',
                    debit ? 'bg-primary' : 'bg-muted',
                  )}
                  style={{
                    height: debit
                      ? `${Math.max(18, (debit.cents / max) * 100)}%`
                      : 4,
                  }}
                />
              </span>
              <span
                className={cn(
                  'text-xs',
                  i === 0 ? 'font-semibold' : 'text-muted-foreground',
                )}
              >
                {letter}
              </span>
            </div>
          )
        })}
      </div>
      <ul className="border-t pt-1">
        {DEBITS.map((d) => (
          <li
            key={d.name}
            className="flex min-h-10 items-center gap-3 px-2 text-sm"
          >
            <span className="text-muted-foreground w-16 shrink-0 text-xs">
              {d.when}
            </span>
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <span className="font-semibold tabular-nums">{eur(d.cents)}</span>
          </li>
        ))}
      </ul>
    </Shell>
  )
}

/** C. The next debit in large (like « À faire »), the others as thin rows. */
function DebitsNext() {
  const [next, ...rest] = DEBITS
  const NextIcon = next.icon
  return (
    <Shell>
      <Head
        title="Prélèvements · 7 j"
        aside={<span className="tabular-nums">{eur(DEBITS_TOTAL)}</span>}
      />
      <div className="bg-info/10 mx-1 mb-1 flex items-center gap-3 rounded-xl px-3 py-3">
        <span
          aria-hidden
          className="bg-info/20 text-info-foreground dark:text-info flex size-11 shrink-0 items-center justify-center rounded-full"
        >
          <NextIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-info-foreground dark:text-info block text-xs font-medium">
            {next.when}
          </span>
          <span className="block truncate text-base font-semibold">
            {next.name}
          </span>
        </span>
        <span className="text-xl font-semibold tabular-nums">
          {eur(next.cents)}
        </span>
      </div>
      <ul>
        {rest.map((d) => (
          <li
            key={d.name}
            className="flex min-h-10 items-center gap-3 px-3 text-sm"
          >
            <span className="text-muted-foreground w-16 shrink-0 text-xs">
              {d.when}
            </span>
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
            <span className="tabular-nums">{eur(d.cents)}</span>
          </li>
        ))}
      </ul>
    </Shell>
  )
}

/* ---------------------------------------------------------------------------
 * Reste à dépenser
 * ------------------------------------------------------------------------- */

// Budget 2 225 €, spent 1 070 €, figures known to 16 Nov. (14 days left),
// an even pace would be at 1 187 € on the 16th.
const TARGET = 222_500
const SPENT = 107_000
const PACE = 118_700
const LEFT = TARGET - SPENT
const DAYS_LEFT = 14
const PER_DAY = Math.floor(LEFT / DAYS_LEFT / 100) * 100

/** The data note, now a small chip beside the title. */
function DataChip() {
  return (
    <span className="bg-warning/15 text-warning-foreground dark:text-warning flex items-center gap-1 rounded-full px-2 py-0.5 font-medium">
      <TriangleAlertIcon aria-hidden className="size-3" />
      au 16 nov.
    </span>
  )
}

function Bar({ thin = false }: { thin?: boolean }) {
  return (
    <span
      className={cn(
        'bg-muted relative block rounded-full',
        thin ? 'h-2' : 'h-3',
      )}
    >
      <span
        className="bg-primary absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${(SPENT / TARGET) * 100}%` }}
      />
      <span
        aria-hidden
        className="bg-foreground absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded"
        style={{ left: `${(PACE / TARGET) * 100}%` }}
      />
    </span>
  )
}

function OnTrack() {
  return (
    <span className="bg-chart-delta-good/10 text-chart-delta-good flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
      <CheckIcon aria-hidden className="size-3.5" />
      Bon rythme
    </span>
  )
}

/** A. No sentences: the figure, a « Bon rythme » pill, the bar's two ends. */
function LeftPlain() {
  return (
    <Shell>
      <Head title="Reste · novembre" aside={<DataChip />} />
      <div className="space-y-3 px-2 pb-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[2rem] leading-tight font-semibold tracking-tight tabular-nums">
            {eur(LEFT)}
          </span>
          <OnTrack />
        </div>
        <Bar />
        <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
          <span>{eur(SPENT)} dépensés</span>
          <span>{eur(TARGET)}</span>
        </div>
      </div>
    </Shell>
  )
}

/** B. What can be spent per day in large, the total left under it. */
function LeftPerDay() {
  return (
    <Shell>
      <Head title="Reste · novembre" aside={<DataChip />} />
      <div className="space-y-3 px-2 pb-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[2rem] leading-tight font-semibold tracking-tight tabular-nums">
            {eur(PER_DAY)}
          </span>
          <span className="text-muted-foreground text-base">/ jour</span>
        </div>
        <Bar thin />
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="tabular-nums">
            <span className="font-semibold">{eur(LEFT)}</span>
            <span className="text-muted-foreground"> · {DAYS_LEFT} j</span>
          </span>
          <OnTrack />
        </div>
      </div>
    </Shell>
  )
}

/** C. A half-circle gauge with the figure inside, the pace as a tick. */
function LeftGauge() {
  const r = 80
  const arc = Math.PI * r
  const at = (ratio: number) => {
    const angle = Math.PI * (1 - ratio)
    return { x: 100 + r * Math.cos(angle), y: 100 - r * Math.sin(angle) }
  }
  const tickIn = at(PACE / TARGET)
  const tickOut = {
    x: 100 + (tickIn.x - 100) * 1.18,
    y: 100 + (tickIn.y - 100) * 1.18,
  }
  const tickInner = {
    x: 100 + (tickIn.x - 100) * 0.82,
    y: 100 + (tickIn.y - 100) * 0.82,
  }
  return (
    <Shell>
      <Head title="Reste · novembre" aside={<DataChip />} />
      <div className="flex flex-col items-center px-2 pb-2">
        <div className="relative w-full max-w-[240px]">
          <svg viewBox="0 0 200 112" className="block w-full">
            <path
              d="M20,100 A80,80 0 0 1 180,100"
              fill="none"
              strokeWidth="16"
              strokeLinecap="round"
              className="stroke-muted"
            />
            <path
              d="M20,100 A80,80 0 0 1 180,100"
              fill="none"
              strokeWidth="16"
              strokeLinecap="round"
              className="stroke-primary"
              strokeDasharray={`${(SPENT / TARGET) * arc} ${arc}`}
            />
            <line
              x1={tickInner.x}
              y1={tickInner.y}
              x2={tickOut.x}
              y2={tickOut.y}
              strokeWidth="2.5"
              strokeLinecap="round"
              className="stroke-foreground"
            />
          </svg>
          <div className="absolute inset-x-0 bottom-0 text-center">
            <span className="block text-[1.75rem] leading-tight font-semibold tracking-tight tabular-nums">
              {eur(LEFT)}
            </span>
            <span className="text-muted-foreground text-xs">
              sur {eur(TARGET)}
            </span>
          </div>
        </div>
        <div className="pt-2">
          <OnTrack />
        </div>
      </div>
    </Shell>
  )
}

/** Today's card, for comparison. */
function LeftToday() {
  return (
    <Shell>
      <Head title="Reste à dépenser en novembre" />
      <div className="space-y-2 px-2 pb-2">
        <span className="flex items-end justify-between gap-x-4">
          <span className="text-[2rem] leading-tight font-semibold tracking-tight tabular-nums">
            {eur(LEFT)}
          </span>
        </span>
        <span className="text-chart-delta-good block text-xs font-medium">
          116 € sous le rythme
        </span>
        <Bar />
        <span className="text-muted-foreground block text-xs tabular-nums">
          {eur(SPENT)} sur {eur(TARGET)} · 418 € hors budget
        </span>
        <span className="text-warning-foreground dark:text-warning flex items-center gap-1.5 text-xs font-medium">
          <TriangleAlertIcon aria-hidden className="size-3.5" />
          Chiffres au 16 nov.
        </span>
      </div>
    </Shell>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

export const Prelevements: Story = {
  name: 'Prélèvements',
  render: ({ width }) => (
    <Page width={width}>
      <Option letter="A" name="Total en tête">
        <DebitsTotal />
      </Option>
      <Option letter="B" name="Semaine">
        <DebitsStrip />
      </Option>
      <Option letter="C" name="Le prochain en grand">
        <DebitsNext />
      </Option>
    </Page>
  ),
}

export const ResteADepenser: Story = {
  name: 'Reste à dépenser',
  render: ({ width }) => (
    <Page width={width}>
      <Option letter="0" name="Aujourd’hui">
        <LeftToday />
      </Option>
      <Option letter="A" name="Sans phrases">
        <LeftPlain />
      </Option>
      <Option letter="B" name="Par jour">
        <LeftPerDay />
      </Option>
      <Option letter="C" name="Jauge">
        <LeftGauge />
      </Option>
    </Page>
  ),
}
