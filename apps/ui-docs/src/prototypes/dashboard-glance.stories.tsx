import type { Meta, StoryObj } from '@storybook/react-vite'
import { CategoryIcon, PeriodBar, PeriodBarLabel, cn } from '@finances/ui'
import type { CategoryIconName } from '@finances/ui'
import {
  BitcoinIcon,
  CalendarCheckIcon,
  CalendarClockIcon,
  ChartPieIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  EllipsisVerticalIcon,
  HandCoinsIcon,
  InboxIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  MenuIcon,
  PiggyBankIcon,
  PlusIcon,
  RefreshCwIcon,
  RepeatIcon,
  SettingsIcon,
  TargetIcon,
  TriangleAlertIcon,
  UploadIcon,
  WalletIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

/**
 * Prototypes of the dashboard for a quick daily glance (#405). Clickable
 * mockups with synthetic figures, not app code. The need, and what stays,
 * moves or goes, is in the issue; every direction answers, in this order:
 * is there anything to do? how much can I still spend this month? do I end
 * the month in the green? where does my net worth stand?
 *
 * A. À faire, puis un chiffre: the things to do as rows on top (only when
 *   there are some), then one figure, « Reste à dépenser », large, with the
 *   pace and the end-of-month forecast under it; the envelopes as compact
 *   rows with their « + »; the net worth as one line.
 * B. Trois réponses: the things to do as one row of chips; then three
 *   answers, each a question in small over a sentence with its figure (how
 *   much is left, with the envelopes as chips that add an expense; how the
 *   month ends; the net worth).
 * C. Selon le moment: one card in front that changes with the moment of
 *   the month (the month to close, a statement to import, the forecast when
 *   it runs low, the budget otherwise), with its one action; the other
 *   answers as small tiles under it, then what's left to do and the
 *   envelopes.
 *
 * Common: the page follows today, not a month (past months are read in
 * « Revue du mois »; `monthBar` shows the frame's bar to compare); the
 * figures leave for their pages (accounts → Comptes, the month's income and
 * expenses → Revue du mois and Épargne, the 12-month chart → Épargne).
 */
const meta: Meta<FrameArgs> = {
  title: 'Prototypes/Tableau de bord du quotidien (#405)',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
  argTypes: {
    direction: { control: 'inline-radio', options: ['A', 'B', 'C'] },
    moment: {
      control: 'inline-radio',
      options: ['ordinaire', 'cloture', 'perime', 'fin', 'calme'],
      description:
        'ordinaire: 21 nov., à jour · cloture: 4 déc., novembre à clôturer · perime: 21 nov., données au 11 nov. · fin: 28 nov., le compte passe sous le seuil · calme: rien à faire',
    },
    width: { control: 'inline-radio', options: [320, 390, 1280] },
    monthBar: { control: 'boolean' },
  },
}
export default meta

type Direction = 'A' | 'B' | 'C'
type Moment = 'ordinaire' | 'cloture' | 'perime' | 'fin' | 'calme'

interface FrameArgs {
  direction: Direction
  moment: Moment
  width: 320 | 390 | 1280
  /** The frame's month bar (#401), kept to compare. */
  monthBar: boolean
}

/* ---------------------------------------------------------------------------
 * Synthetic data
 * ------------------------------------------------------------------------- */

type Tone = 'warning' | 'info' | 'primary' | 'bad'

interface Todo {
  id: string
  icon: LucideIcon
  tone: Tone
  /** « 7 opérations à revoir ». */
  title: string
  /** Under the title. */
  detail?: string
  /** For the chips of B. */
  chip: string
  count?: number
}

interface Envelope {
  name: string
  icon: CategoryIconName
  color: string
  spentCents: number
  targetCents: number
}

interface Scenario {
  /** « Samedi 21 novembre ». */
  today: string
  monthName: string
  monthLabel: string
  day: number
  days: number
  /** The last day the bank data covers: « 19 nov. ». */
  dataUntil: string
  /** Data more than 7 days old: the figures say so, the forecast is indicative. */
  stale: boolean
  todos: Todo[]
  budget: { targetCents: number; spentCents: number }
  forecast: {
    endCents: number
    lowCents: number
    lowDate: string
    thresholdCents: number
    /** The day the balance goes under the threshold. */
    belowOn?: string
    endDate: string
  }
  envelopes: Envelope[]
  netWorth: { totalCents: number; changeCents: number; since: string }
  /** The month left to close, start of a month. */
  close?: { month: string; missing: number; review: number }
}

const REVIEW = (count: number): Todo => ({
  id: 'review',
  icon: InboxIcon,
  tone: 'primary',
  title: `${count} opérations à revoir`,
  detail: 'Catégorie à vérifier',
  chip: 'À revoir',
  count,
})

const ENVELOPES_NOV: Envelope[] = [
  {
    name: 'Courses',
    icon: 'shopping-cart',
    color: '#16a34a',
    spentCents: 31_240,
    targetCents: 50_000,
  },
  {
    name: 'Restaurants & cafés',
    icon: 'utensils',
    color: '#ea580c',
    spentCents: 15_100,
    targetCents: 18_000,
  },
  {
    name: 'Transport',
    icon: 'train-front',
    color: '#0891b2',
    spentCents: 4_200,
    targetCents: 15_000,
  },
]

const SCENARIOS: Record<Moment, Scenario> = {
  ordinaire: {
    today: 'Samedi 21 novembre',
    monthName: 'novembre',
    monthLabel: 'Novembre 2026',
    day: 21,
    days: 30,
    dataUntil: '19 nov.',
    stale: false,
    todos: [
      REVIEW(7),
      {
        id: 'repayment',
        icon: HandCoinsIcon,
        tone: 'info',
        title: 'Camille t’a versé 24 €',
        detail: 'Un remboursement ? À lier',
        chip: 'Camille 24 €',
      },
    ],
    budget: { targetCents: 222_500, spentCents: 118_000 },
    forecast: {
      endCents: 758_831,
      lowCents: 481_910,
      lowDate: '26 nov.',
      thresholdCents: 50_000,
      endDate: '30 nov.',
    },
    envelopes: ENVELOPES_NOV,
    netWorth: { totalCents: 5_111_062, changeCents: 124_000, since: '31 oct.' },
  },
  cloture: {
    today: 'Vendredi 4 décembre',
    monthName: 'décembre',
    monthLabel: 'Décembre 2026',
    day: 4,
    days: 31,
    dataUntil: '2 déc.',
    stale: false,
    todos: [
      {
        id: 'close',
        icon: ListChecksIcon,
        tone: 'warning',
        title: 'Clôturer novembre',
        detail: '2 comptes à mettre à jour avant',
        chip: 'Clôturer novembre',
      },
      REVIEW(3),
    ],
    budget: { targetCents: 222_500, spentCents: 21_000 },
    forecast: {
      endCents: 812_000,
      lowCents: 395_000,
      lowDate: '12 déc.',
      thresholdCents: 50_000,
      endDate: '31 déc.',
    },
    envelopes: [
      { ...ENVELOPES_NOV[0], spentCents: 6_420 },
      { ...ENVELOPES_NOV[1], spentCents: 2_850 },
      { ...ENVELOPES_NOV[2], spentCents: 0 },
    ],
    netWorth: { totalCents: 5_160_400, changeCents: 21_000, since: '30 nov.' },
    close: { month: 'novembre', missing: 2, review: 3 },
  },
  perime: {
    today: 'Samedi 21 novembre',
    monthName: 'novembre',
    monthLabel: 'Novembre 2026',
    day: 11,
    days: 30,
    dataUntil: '11 nov.',
    stale: true,
    todos: [
      {
        id: 'import',
        icon: UploadIcon,
        tone: 'warning',
        title: 'Importer un relevé',
        detail: 'Données au 11 nov., il y a 10 jours',
        chip: 'Relevé à importer',
      },
      REVIEW(7),
    ],
    budget: { targetCents: 222_500, spentCents: 97_900 },
    forecast: {
      endCents: 758_831,
      lowCents: 481_910,
      lowDate: '26 nov.',
      thresholdCents: 50_000,
      endDate: '30 nov.',
    },
    envelopes: [
      { ...ENVELOPES_NOV[0], spentCents: 9_788 },
      { ...ENVELOPES_NOV[1], spentCents: 8_551 },
      { ...ENVELOPES_NOV[2], spentCents: 0 },
    ],
    netWorth: { totalCents: 5_111_062, changeCents: -10_500, since: '31 oct.' },
  },
  fin: {
    today: 'Samedi 28 novembre',
    monthName: 'novembre',
    monthLabel: 'Novembre 2026',
    day: 28,
    days: 30,
    dataUntil: '27 nov.',
    stale: false,
    todos: [
      {
        id: 'renewal',
        icon: RefreshCwIcon,
        tone: 'info',
        title: 'Antivirus se renouvelle le 2 déc.',
        detail: 'Prépayé 12 mois · 49,99 €',
        chip: 'Renouvellement',
      },
    ],
    budget: { targetCents: 222_500, spentCents: 241_000 },
    forecast: {
      endCents: 31_200,
      lowCents: 18_400,
      lowDate: '30 nov.',
      thresholdCents: 50_000,
      belowOn: '29 nov.',
      endDate: '30 nov.',
    },
    envelopes: [
      { ...ENVELOPES_NOV[0], spentCents: 46_800 },
      { ...ENVELOPES_NOV[1], spentCents: 21_450 },
      { ...ENVELOPES_NOV[2], spentCents: 9_800 },
    ],
    netWorth: { totalCents: 5_098_000, changeCents: -13_000, since: '31 oct.' },
  },
  calme: {
    today: 'Dimanche 15 novembre',
    monthName: 'novembre',
    monthLabel: 'Novembre 2026',
    day: 15,
    days: 30,
    dataUntil: '14 nov.',
    stale: false,
    todos: [],
    budget: { targetCents: 222_500, spentCents: 96_000 },
    forecast: {
      endCents: 812_400,
      lowCents: 512_000,
      lowDate: '26 nov.',
      thresholdCents: 50_000,
      endDate: '30 nov.',
    },
    envelopes: [
      { ...ENVELOPES_NOV[0], spentCents: 22_100 },
      { ...ENVELOPES_NOV[1], spentCents: 7_300 },
      { ...ENVELOPES_NOV[2], spentCents: 3_900 },
    ],
    netWorth: { totalCents: 5_122_000, changeCents: 135_000, since: '31 oct.' },
  },
}

/* ---------------------------------------------------------------------------
 * Figures
 * ------------------------------------------------------------------------- */

const wholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const signedWholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})
const euros = (cents: number) => wholeEuros.format(Math.round(cents / 100))
const signed = (cents: number) =>
  signedWholeEuros.format(Math.round(cents / 100))

/** What an even pace through the month would have spent by now. */
function paceOf(s: Scenario, target: number): number {
  return Math.round((target * s.day) / s.days)
}

function budgetState(s: Scenario) {
  const { targetCents, spentCents } = s.budget
  const left = targetCents - spentCents
  const pace = paceOf(s, targetCents)
  const ahead = spentCents - pace
  return { left, pace, ahead, over: left < 0 }
}

/** « 377 € sous le rythme » / « 163 € au-dessus du rythme ». */
function paceText(s: Scenario): {
  text: string
  tone: 'good' | 'warn' | 'bad'
} {
  const { ahead, over } = budgetState(s)
  if (over) return { text: `Jour ${s.day} sur ${s.days}`, tone: 'bad' }
  if (Math.abs(ahead) < 1_000) return { text: 'Dans le rythme', tone: 'good' }
  return ahead < 0
    ? { text: `${euros(-ahead)} sous le rythme`, tone: 'good' }
    : { text: `${euros(ahead)} au-dessus du rythme`, tone: 'warn' }
}

const TONE_TEXT = {
  good: 'text-chart-delta-good',
  warn: 'text-warning-foreground dark:text-warning',
  bad: 'text-chart-delta-bad',
} as const

const TONE_TILE: Record<Tone, string> = {
  warning: 'bg-warning/20 text-warning-foreground dark:text-warning',
  info: 'bg-info/15 text-info-foreground dark:text-info',
  primary: 'bg-primary/10 text-primary',
  bad: 'bg-destructive/10 text-destructive',
}

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

/** The app runs at a 22px root; the frames follow it. */
function AppScale({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    const before = root.style.fontSize
    root.style.fontSize = '22px'
    return () => {
      root.style.fontSize = before
    }
  }, [])
  return <>{children}</>
}

function Card({
  children,
  className,
  label,
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  return (
    <section
      aria-label={label}
      className={cn('bg-card min-w-0 rounded-xl border p-4', className)}
    >
      {children}
    </section>
  )
}

function CardTitle({ children, link }: { children: ReactNode; link?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h2 className="text-sm font-semibold">{children}</h2>
      {link && (
        <a
          href="#"
          className="text-muted-foreground flex min-h-8 items-center gap-0.5 text-xs"
        >
          {link}
          <ChevronRightIcon aria-hidden className="size-3.5" />
        </a>
      )}
    </div>
  )
}

/** A whole row that opens a page: icon tile, title, detail, ›. */
function LinkRow({
  icon: Icon,
  tone,
  title,
  detail,
  value,
  className,
}: {
  icon: LucideIcon
  tone: Tone
  title: ReactNode
  detail?: ReactNode
  /** On the title's line, at its end (an amount). */
  value?: ReactNode
  className?: string
}) {
  return (
    <a
      href="#"
      className={cn(
        'hover:bg-muted/60 flex min-h-8 items-center gap-3 rounded-lg px-2 py-1 text-sm',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[0.85rem]',
          TONE_TILE[tone],
        )}
      >
        <Icon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 font-medium break-normal">{title}</span>
          {value && (
            <span className="font-semibold whitespace-nowrap tabular-nums">
              {value}
            </span>
          )}
        </span>
        {detail && (
          <span className="text-muted-foreground block text-xs break-normal">
            {detail}
          </span>
        )}
      </span>
      <ChevronRightIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
    </a>
  )
}

/** Spent against the target, with the even-pace mark. */
function PaceBar({
  spent,
  target,
  pace,
  thick,
}: {
  spent: number
  target: number
  pace: number | null
  thick?: boolean
}) {
  const ratio = target > 0 ? spent / target : 0
  return (
    <span
      aria-hidden
      className={cn(
        'bg-muted relative block rounded-full',
        thick ? 'h-3' : 'h-1.5',
      )}
    >
      <span
        className={cn(
          'absolute inset-y-0 left-0 rounded-full',
          ratio > 1
            ? 'bg-chart-over'
            : pace !== null && spent > pace && ratio >= 0.8
              ? 'bg-chart-warning'
              : 'bg-primary',
        )}
        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
      />
      {pace !== null && (
        <span
          className="bg-foreground absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded"
          style={{ left: `${Math.min(pace / target, 1) * 100}%` }}
        />
      )}
    </span>
  )
}

/** « à jour au 19 nov. » or, stale, the warning tone. */
function DataNote({ s, className }: { s: Scenario; className?: string }) {
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-xs',
        s.stale
          ? 'text-warning-foreground dark:text-warning font-medium'
          : 'text-muted-foreground',
        className,
      )}
    >
      {s.stale ? (
        <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" />
      ) : (
        <CalendarCheckIcon aria-hidden className="size-3.5 shrink-0" />
      )}
      {s.stale ? `Chiffres au ${s.dataUntil}` : `À jour au ${s.dataUntil}`}
    </p>
  )
}

/** The forecast as one row with a chevron. */
function ForecastRow({ s }: { s: Scenario }) {
  const f = s.forecast
  const below = f.belowOn !== undefined && !s.stale
  return (
    <a
      href="#"
      className={cn(
        'flex min-h-8 items-center gap-3 rounded-lg px-2 py-1 text-sm',
        below ? 'bg-warning/15' : 'hover:bg-muted/60',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[0.85rem]',
          below ? TONE_TILE.warning : 'bg-muted text-muted-foreground',
        )}
      >
        {below ? <TriangleAlertIcon /> : <CalendarClockIcon />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-x-2">
          <span className="min-w-0 truncate font-medium">Fin de mois</span>
          <span className="font-semibold whitespace-nowrap tabular-nums">
            {euros(f.endCents)}
          </span>
        </span>
        <span
          className={cn(
            'block text-xs',
            below
              ? 'text-warning-foreground dark:text-warning font-medium'
              : 'text-muted-foreground',
          )}
        >
          {below
            ? `Sous ${euros(f.thresholdCents)} le ${f.belowOn}`
            : `Point bas ${euros(f.lowCents)} le ${f.lowDate}`}
          {s.stale && ' · indicatif'}
        </span>
      </span>
      <ChevronRightIcon
        aria-hidden
        className="text-muted-foreground size-4 shrink-0"
      />
    </a>
  )
}

/** One envelope on one line: icon, name and bar, what's left, « + ». */
function EnvelopeRow({ e, s }: { e: Envelope; s: Scenario }) {
  const left = e.targetCents - e.spentCents
  const pace = paceOf(s, e.targetCents)
  const aheadOfPace = e.spentCents > pace && left >= 0
  return (
    <li>
      <button
        type="button"
        aria-label={`Ajouter une dépense ${e.name}`}
        className="hover:bg-muted/60 flex min-h-8 w-full items-center gap-3 rounded-lg px-2 py-1 text-left text-sm"
      >
        <CategoryIcon icon={e.icon} color={e.color} />
        <span className="min-w-0 flex-1 space-y-1.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{e.name}</span>
            <span
              className={cn(
                'text-xs font-medium whitespace-nowrap tabular-nums',
                left < 0 && 'text-chart-delta-bad',
                aheadOfPace && TONE_TEXT.warn,
              )}
            >
              {left < 0 ? `−${euros(-left)}` : euros(left)}
            </span>
          </span>
          <PaceBar spent={e.spentCents} target={e.targetCents} pace={pace} />
        </span>
        <span
          aria-hidden
          className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full"
        >
          <PlusIcon className="size-[0.95rem]" strokeWidth={2.5} />
        </span>
      </button>
    </li>
  )
}

function Envelopes({ s }: { s: Scenario }) {
  return (
    <Card label="Enveloppes" className="px-2 pt-3 pb-2">
      <div className="px-2">
        <CardTitle link="Budget">Enveloppes</CardTitle>
      </div>
      <ul className="space-y-1">
        {s.envelopes.map((e) => (
          <EnvelopeRow key={e.name} e={e} s={s} />
        ))}
      </ul>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * A. À faire, puis un chiffre
 * ------------------------------------------------------------------------- */

function TodoCard({ todos }: { todos: Todo[] }) {
  if (todos.length === 0) return null
  return (
    <Card label="À faire" className="border-warning/50 px-2 pt-2 pb-1.5">
      <h2 className="text-muted-foreground px-2 text-xs font-medium">
        À faire
      </h2>
      <ul>
        {todos.map((t) => (
          <li key={t.id}>
            <LinkRow
              icon={t.icon}
              tone={t.tone}
              title={t.title}
              detail={t.detail}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function DirectionA({ s }: { s: Scenario }) {
  const b = budgetState(s)
  const pace = paceText(s)
  const n = s.netWorth
  return (
    <>
      <TodoCard todos={s.todos} />
      <Card label="L’essentiel" className="space-y-2 px-2 pt-3 pb-2">
        <div className="space-y-2 px-2 pb-1">
          <div className="flex flex-wrap items-end justify-between gap-x-4">
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">
                {b.over ? 'Budget dépassé' : 'Reste à dépenser'} en{' '}
                {s.monthName}
              </p>
              <p
                className={cn(
                  'text-[2rem] leading-tight font-semibold tracking-tight tabular-nums',
                  b.over && 'text-chart-delta-bad',
                )}
              >
                {euros(Math.abs(b.left))}
              </p>
            </div>
            <p className={cn('pb-1 text-xs font-medium', TONE_TEXT[pace.tone])}>
              {pace.text}
            </p>
          </div>
          <PaceBar
            thick
            spent={s.budget.spentCents}
            target={s.budget.targetCents}
            pace={b.pace}
          />
          <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
            <span className="text-muted-foreground tabular-nums">
              {euros(s.budget.spentCents)} sur {euros(s.budget.targetCents)}
            </span>
            <DataNote s={s} />
          </div>
        </div>
        <div className="space-y-0.5 border-t pt-1.5">
          <ForecastRow s={s} />
          <LinkRow
            icon={LandmarkIcon}
            tone="primary"
            title="Patrimoine"
            detail={`${signed(n.changeCents)} depuis le ${n.since}`}
            value={euros(n.totalCents)}
          />
        </div>
      </Card>
      <Envelopes s={s} />
    </>
  )
}

/* ---------------------------------------------------------------------------
 * B. Trois réponses
 * ------------------------------------------------------------------------- */

function TodoChips({ todos }: { todos: Todo[] }) {
  if (todos.length === 0) {
    return (
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <CircleCheckIcon aria-hidden className="text-chart-delta-good size-4" />
        Rien à faire, tout est à jour.
      </p>
    )
  }
  return (
    <div
      aria-label="À faire"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-2 pb-1 [scrollbar-width:none]"
    >
      {todos.map((t) => (
        <a
          key={t.id}
          href="#"
          className={cn(
            'relative flex min-h-8 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap',
            t.tone === 'warning'
              ? 'border-warning/60 bg-warning/15'
              : 'bg-card',
          )}
        >
          <t.icon
            aria-hidden
            className={cn(
              'size-4',
              t.tone === 'warning'
                ? 'text-warning-foreground dark:text-warning'
                : t.tone === 'info'
                  ? 'text-info-foreground dark:text-info'
                  : 'text-primary',
            )}
          />
          {t.chip}
          {t.count !== undefined && (
            <span className="bg-primary text-primary-foreground absolute -top-2 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] leading-none font-semibold ring-2 ring-[var(--background)]">
              {t.count}
            </span>
          )}
        </a>
      ))}
    </div>
  )
}

function Answer({
  question,
  children,
  className,
}: {
  question: string
  children: ReactNode
  className?: string
}) {
  return (
    <a
      href="#"
      className={cn(
        'hover:bg-muted/40 block min-w-0 space-y-1 px-4 py-2.5',
        className,
      )}
    >
      <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
        {question}
        <ChevronRightIcon aria-hidden className="size-4 shrink-0" />
      </span>
      {children}
    </a>
  )
}

function DirectionB({ s }: { s: Scenario }) {
  const b = budgetState(s)
  const pace = paceText(s)
  const f = s.forecast
  const below = f.belowOn !== undefined && !s.stale
  return (
    <>
      <TodoChips todos={s.todos} />
      <section
        aria-label="L’essentiel"
        className="bg-card divide-y overflow-hidden rounded-xl border"
      >
        <Answer question="Combien me reste-t-il ?">
          <p className="text-base break-normal">
            {b.over ? (
              <>
                Budget dépassé de{' '}
                <strong className="text-chart-delta-bad text-2xl tabular-nums">
                  {euros(-b.left)}
                </strong>
              </>
            ) : (
              <>
                <strong className="text-2xl tabular-nums">
                  {euros(b.left)}
                </strong>{' '}
                <span className="text-muted-foreground text-sm">
                  d’ici le {s.days}
                </span>
              </>
            )}
          </p>
          <PaceBar
            spent={s.budget.spentCents}
            target={s.budget.targetCents}
            pace={b.pace}
          />
          <span className="flex flex-wrap justify-between gap-x-3 text-xs">
            <span className={cn('font-medium', TONE_TEXT[pace.tone])}>
              {pace.text}
            </span>
            <DataNote s={s} />
          </span>
        </Answer>
        {/* The envelopes as chips: a tap notes an expense in one. */}
        <div className="flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none]">
          {s.envelopes.map((e) => {
            const left = e.targetCents - e.spentCents
            return (
              <button
                key={e.name}
                type="button"
                aria-label={`Ajouter une dépense ${e.name}`}
                className="hover:bg-muted/60 flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1.5 text-xs whitespace-nowrap"
              >
                <CategoryIcon icon={e.icon} color={e.color} size="sm" />
                <span className="font-medium">{e.name.split(' ')[0]}</span>
                <span
                  className={cn(
                    'tabular-nums',
                    left < 0 ? 'text-chart-delta-bad' : 'text-muted-foreground',
                  )}
                >
                  {left < 0 ? `−${euros(-left)}` : euros(left)}
                </span>
                <PlusIcon aria-hidden className="text-primary size-3.5" />
              </button>
            )
          })}
        </div>
        <Answer question="Je finis le mois dans le vert ?">
          <p className="text-base break-normal">
            {below ? (
              <>
                <strong className={cn('text-2xl', TONE_TEXT.warn)}>Non</strong>{' '}
                : sous {euros(f.thresholdCents)} le {f.belowOn}
              </>
            ) : (
              <>
                <strong className="text-2xl">
                  {s.stale ? 'Sans doute' : 'Oui'}
                </strong>
                , <span className="tabular-nums">{euros(f.endCents)}</span> le{' '}
                {f.endDate}
              </>
            )}
          </p>
          <span className="text-muted-foreground block text-xs">
            {below
              ? `Fin de mois prévue ${euros(f.endCents)}`
              : `Point bas ${euros(f.lowCents)} le ${f.lowDate}`}
            {s.stale && ' · indicatif tant que le relevé manque'}
          </span>
        </Answer>
        <Answer question="Et mon patrimoine ?">
          <p className="text-base break-normal">
            <strong className="text-2xl tabular-nums">
              {euros(s.netWorth.totalCents)}
            </strong>
            <span
              className={cn(
                'block text-xs font-medium whitespace-nowrap',
                s.netWorth.changeCents >= 0
                  ? TONE_TEXT.good
                  : 'text-muted-foreground',
              )}
            >
              {signed(s.netWorth.changeCents)} depuis le {s.netWorth.since}
            </span>
          </p>
        </Answer>
      </section>
    </>
  )
}

/* ---------------------------------------------------------------------------
 * C. Selon le moment
 * ------------------------------------------------------------------------- */

type Focus = 'close' | 'import' | 'forecast' | 'budget'

function focusOf(s: Scenario): Focus {
  if (s.close) return 'close'
  if (s.stale) return 'import'
  if (s.forecast.belowOn) return 'forecast'
  return 'budget'
}

function FocusCard({ s, focus }: { s: Scenario; focus: Focus }) {
  const b = budgetState(s)
  const pace = paceText(s)
  if (focus === 'close' && s.close) {
    const steps = [
      { label: 'Relevés à jour', left: s.close.missing },
      { label: 'Opérations revues', left: s.close.review },
      { label: 'Clôture', left: 1 },
    ]
    return (
      <Card
        label={`Clôturer ${s.close.month}`}
        className="border-warning/60 bg-warning/10 space-y-3"
      >
        <p className="text-muted-foreground text-xs">Le mois est terminé</p>
        <p className="text-xl font-semibold">Clôturer {s.close.month}</p>
        <ol className="space-y-1.5 text-sm">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-2">
              <span
                aria-hidden
                className="border-warning-foreground/40 dark:border-warning/50 flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold"
              >
                {step.left > 1 ? step.left : ''}
              </span>
              <span className="flex-1">{step.label}</span>
              <span className="text-muted-foreground text-xs">
                {step.label === 'Clôture'
                  ? 'ensuite'
                  : step.label === 'Relevés à jour'
                    ? `${step.left} comptes`
                    : `${step.left} à revoir`}
              </span>
            </li>
          ))}
        </ol>
        <a
          href="#"
          className="bg-primary text-primary-foreground flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium"
        >
          <ListChecksIcon aria-hidden className="size-4" />
          Commencer la revue
        </a>
      </Card>
    )
  }
  if (focus === 'import') {
    return (
      <Card
        label="Importer un relevé"
        className="border-warning/60 bg-warning/10 space-y-3"
      >
        <p className="text-muted-foreground text-xs">
          Dernier relevé il y a 10 jours
        </p>
        <p className="text-xl font-semibold break-normal">
          Les chiffres s’arrêtent au {s.dataUntil}
        </p>
        <p className="text-muted-foreground text-xs break-normal">
          Le reste à dépenser et la fin de mois en dépendent : importez le
          relevé de la banque pour les mettre à jour.
        </p>
        <a
          href="#"
          className="bg-primary text-primary-foreground flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium"
        >
          <UploadIcon aria-hidden className="size-4" />
          Importer un relevé
        </a>
      </Card>
    )
  }
  if (focus === 'forecast') {
    const f = s.forecast
    return (
      <Card
        label="Fin de mois"
        className="border-warning/60 bg-warning/10 space-y-2"
      >
        <p className="text-muted-foreground text-xs">Fin de mois serrée</p>
        <p className="text-xl font-semibold break-normal">
          Sous {euros(f.thresholdCents)} le {f.belowOn}
        </p>
        <p className="text-xs break-normal">
          Compte courant :{' '}
          <span className="font-semibold tabular-nums">
            {euros(f.endCents)}
          </span>{' '}
          prévus le {f.endDate} ; point bas {euros(f.lowCents)} le {f.lowDate}
        </p>
        <a
          href="#"
          className="border-border bg-card flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm font-medium"
        >
          <CalendarClockIcon aria-hidden className="size-4" />
          Voir la prévision
        </a>
      </Card>
    )
  }
  return (
    <Card label="Reste à dépenser" className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-x-4">
        <div>
          <p className="text-muted-foreground text-xs">
            Reste à dépenser en {s.monthName}
          </p>
          <p className="text-[2rem] leading-tight font-semibold tracking-tight tabular-nums">
            {euros(b.left)}
          </p>
        </div>
        <p className={cn('pb-1 text-xs font-medium', TONE_TEXT[pace.tone])}>
          {pace.text}
        </p>
      </div>
      <PaceBar
        thick
        spent={s.budget.spentCents}
        target={s.budget.targetCents}
        pace={b.pace}
      />
      <DataNote s={s} />
    </Card>
  )
}

function MiniTile({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: keyof typeof TONE_TEXT
}) {
  return (
    <a
      href="#"
      className="bg-card hover:bg-muted/40 block min-w-0 rounded-xl border px-3 py-2"
    >
      <span className="text-muted-foreground flex items-center justify-between gap-1 text-xs">
        <span className="truncate">{label}</span>
        <ChevronRightIcon aria-hidden className="size-3.5 shrink-0" />
      </span>
      <span
        className={cn(
          'block text-base font-semibold whitespace-nowrap tabular-nums',
          tone && TONE_TEXT[tone],
        )}
      >
        {value}
      </span>
      {note && (
        <span className="text-muted-foreground block text-[0.7rem] leading-snug">
          {note}
        </span>
      )}
    </a>
  )
}

function DirectionC({ s }: { s: Scenario }) {
  const focus = focusOf(s)
  const b = budgetState(s)
  const f = s.forecast
  const shownTodo =
    focus === 'close' ? 'close' : focus === 'import' ? 'import' : null
  const rest = s.todos.filter(
    (t) => t.id !== shownTodo && !(focus === 'close' && t.id === 'review'),
  )
  const tiles = [
    focus !== 'budget' && (
      <MiniTile
        key="budget"
        label="Reste"
        value={b.over ? `−${euros(-b.left)}` : euros(b.left)}
        note={paceText(s).text}
        tone={b.over ? 'bad' : undefined}
      />
    ),
    focus !== 'forecast' && (
      <MiniTile
        key="forecast"
        label="Fin de mois"
        value={euros(f.endCents)}
        note={s.stale ? 'indicatif' : `bas ${euros(f.lowCents)}`}
      />
    ),
    <MiniTile
      key="net"
      label="Patrimoine"
      value={euros(s.netWorth.totalCents)}
      note={`${signed(s.netWorth.changeCents)} depuis le ${s.netWorth.since}`}
    />,
  ].filter(Boolean)
  return (
    <>
      <FocusCard s={s} focus={focus} />
      {rest.length > 0 && (
        <Card label="À faire" className="p-2">
          <ul>
            {rest.map((t) => (
              <li key={t.id}>
                <LinkRow
                  icon={t.icon}
                  tone={t.tone}
                  title={t.title}
                  detail={t.detail}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-2 [&>*:nth-child(3)]:col-span-2">
        {tiles}
      </div>
      <Envelopes s={s} />
    </>
  )
}

/* ---------------------------------------------------------------------------
 * Frame
 * ------------------------------------------------------------------------- */

const ICON_BUTTON =
  'flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-[1.1rem]'

function PhoneHeader() {
  return (
    <header className="bg-background flex h-12 shrink-0 items-center gap-1 border-b px-2">
      <span className={ICON_BUTTON} aria-hidden>
        <MenuIcon />
      </span>
      <span className="flex flex-1 items-center gap-1.5 font-semibold">
        <WalletIcon aria-hidden className="text-primary size-5" />
        Finances
      </span>
      <span className={cn(ICON_BUTTON, 'bg-secondary')} aria-hidden>
        <EllipsisVerticalIcon />
      </span>
      <span
        aria-hidden
        className="bg-primary text-primary-foreground ml-1 flex size-8 items-center justify-center rounded-full text-xs font-semibold"
      >
        CD
      </span>
    </header>
  )
}

const NAV: { label: string; icon: LucideIcon; active?: boolean }[] = [
  { label: 'Tableau de bord', icon: LayoutDashboardIcon, active: true },
  { label: 'Dépenses', icon: ChartPieIcon },
  { label: 'Budget', icon: TargetIcon },
  { label: 'Revue du mois', icon: CalendarCheckIcon },
  { label: 'Comptes', icon: LandmarkIcon },
  { label: 'Épargne', icon: PiggyBankIcon },
  { label: 'Crypto', icon: BitcoinIcon },
  { label: 'Entre proches', icon: HandCoinsIcon },
  { label: 'Abonnements', icon: RepeatIcon },
  { label: 'Import', icon: UploadIcon },
]

function DesktopSidebar() {
  return (
    <nav className="bg-sidebar flex w-[11rem] shrink-0 flex-col border-r p-2 text-sm">
      <ul className="space-y-0.5">
        {NAV.map(({ label, icon: Icon, active }) => (
          <li
            key={label}
            className={cn(
              'flex h-9 items-center gap-2 rounded-md px-2',
              active && 'bg-primary/10 text-primary font-medium',
            )}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </li>
        ))}
      </ul>
      <span className="mt-auto flex h-9 items-center gap-2 px-2">
        <SettingsIcon aria-hidden className="size-4" />
        Réglages
      </span>
    </nav>
  )
}

function MonthBar({ s }: { s: Scenario }) {
  return (
    <div className="bg-background sticky top-0 z-10 border-b px-2 py-1.5 @container">
      <PeriodBar
        previous={{ label: 'Mois précédent', onClick: () => {} }}
        next={{ label: 'Mois suivant', onClick: () => {}, disabled: true }}
      >
        <PeriodBarLabel text={s.monthLabel} />
      </PeriodBar>
    </div>
  )
}

const DIRECTIONS: Record<Direction, (props: { s: Scenario }) => ReactNode> = {
  A: DirectionA,
  B: DirectionB,
  C: DirectionC,
}

/** The phone's own bars (status 47px, home indicator 34px) at 390 × 844. */
const STATUS_BAR = 47
const HOME_BAR = 34

function Frame({ direction, moment, width, monthBar }: FrameArgs) {
  const phone = width < 768
  const s = SCENARIOS[moment]
  const Body = DIRECTIONS[direction]
  return (
    <div
      data-frame
      style={{ width, height: phone ? 844 : 820 }}
      className="bg-background text-foreground relative flex shrink-0 flex-col overflow-hidden rounded-xl border shadow-sm"
    >
      {phone && <div aria-hidden style={{ height: STATUS_BAR }} />}
      {phone ? (
        <PhoneHeader />
      ) : (
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <WalletIcon aria-hidden className="text-primary size-5" />
          <span className="flex-1 font-semibold">Finances</span>
          <span className={cn(ICON_BUTTON, 'bg-secondary')} aria-hidden>
            <EllipsisVerticalIcon />
          </span>
          <span
            aria-hidden
            className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-xs font-semibold"
          >
            CD
          </span>
        </header>
      )}
      <div className="flex min-h-0 flex-1">
        {!phone && <DesktopSidebar />}
        <main
          className={cn(
            '@container min-w-0 flex-1 overflow-y-auto',
            phone && '[scrollbar-width:none]',
          )}
        >
          {monthBar && <MonthBar s={s} />}
          <div
            className={cn(
              'w-full',
              phone ? 'space-y-3 px-4 pt-4' : 'space-y-4 px-6 py-6',
            )}
            style={phone ? { paddingBottom: HOME_BAR + 16 } : undefined}
          >
            <header>
              <h1 className="text-xl font-semibold tracking-tight whitespace-nowrap @[600px]:text-2xl">
                Tableau de bord
              </h1>
              <p className="text-muted-foreground text-xs">{s.today}</p>
            </header>
            <Body s={s} />
          </div>
        </main>
      </div>
      {phone && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center pb-2"
          style={{ height: HOME_BAR }}
        >
          <span className="bg-foreground/80 h-[5px] w-[134px] rounded-full" />
        </div>
      )}
      {/* Where the first screen ends on an iPhone 390 × 844. */}
      {phone && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-red-500/60"
          style={{ top: 844 - HOME_BAR }}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

const LABELS: Record<Direction, string> = {
  A: 'A. À faire, puis un chiffre',
  B: 'B. Trois réponses',
  C: 'C. Selon le moment',
}

const MOMENT_LABELS: Record<Moment, string> = {
  ordinaire: 'Un jour ordinaire (21 nov.)',
  cloture: 'Un mois à clôturer (4 déc.)',
  perime: 'Données de 10 jours (21 nov.)',
  fin: 'Fin de mois serrée (28 nov.)',
  calme: 'Rien à faire (15 nov.)',
}

export const Prototype: StoryObj<FrameArgs> = {
  name: 'Une page',
  args: { direction: 'A', moment: 'ordinaire', width: 390, monthBar: false },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 min-h-screen p-4">
        <Frame {...args} />
      </div>
    </AppScale>
  ),
}

/** A, B and C side by side, for one moment and one width. */
export const SideBySide: StoryObj<FrameArgs> = {
  name: 'Côte à côte',
  args: { direction: 'A', moment: 'ordinaire', width: 390, monthBar: false },
  argTypes: { direction: { table: { disable: true } } },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 flex min-h-screen flex-wrap gap-4 p-4">
        {(['A', 'B', 'C'] as const).map((direction) => (
          <div key={direction} className="space-y-1.5">
            <p className="text-sm font-semibold">{LABELS[direction]}</p>
            <Frame {...args} direction={direction} />
          </div>
        ))}
      </div>
    </AppScale>
  ),
}

/** One direction through the month: every moment side by side. */
export const Moments: StoryObj<FrameArgs> = {
  name: 'Au fil du mois',
  args: { direction: 'A', moment: 'ordinaire', width: 390, monthBar: false },
  argTypes: { moment: { table: { disable: true } } },
  render: (args) => (
    <AppScale>
      <div className="bg-muted/30 flex min-h-screen flex-wrap gap-4 p-4">
        {(Object.keys(MOMENT_LABELS) as Moment[]).map((moment) => (
          <div key={moment} className="space-y-1.5">
            <p className="text-sm font-semibold">{MOMENT_LABELS[moment]}</p>
            <Frame {...args} moment={moment} />
          </div>
        ))}
      </div>
    </AppScale>
  ),
}
