import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  formatWholeEuros,
} from '@finances/ui'
import {
  ArchiveIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  PlusIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

/**
 * Prototypes of the « Objectifs » card of Épargne on phones, shown to the
 * owner before one is built in `apps/web`. Synthetic data, not app code.
 *
 * The card before (`GoalsSection`): a four-line description of how goals are
 * projected, then per goal its name and a pencil, « 1 200,00 € / 4 000,00 € »,
 * the bar, and three sentences (« Reste 2 800,00 € (30 %) », « Échéance :
 * 1 juil. 2027, soit 350,00 € par mois pendant 8 mois », « Atteint en février
 * 2027 au rythme actuel, dans les temps »): five to seven lines per goal at
 * 375px, amounts in cents, a switch for the archived goals.
 *
 * Shared by every direction: whole euros, months as « juil. 2027 », one status
 * word in its colour (Atteint, Dans les temps, En retard, Hors de portée,
 * Sans date), the projection explained in one line, the whole goal one target
 * opening its editor (no pencil), « Objectifs archivés » as a link at the end.
 *
 * A. Lignes compactes : the envelope rows of the dashboard. The name and the
 *    status, the bar, then « 2 800 € restants · juil. 2027 » and the %.
 * B. Anneaux : a tile per goal (two per row from 400px), its ring with the %
 *    beside the name, « 1 200 € sur 4 000 € » and the status.
 * C. Effort mensuel : what each goal asks per month, against what you save on
 *    average (« 782 € par mois pour vos objectifs · vous épargnez 717 € »).
 * D. Repliés : one line per goal (name, small bar, status icon); a tap unfolds
 *    its figures in a short list.
 *
 * Every story shows the card at 320, 375 and 430px. Switch the theme in the
 * toolbar for dark.
 */
const meta: Meta = {
  title: 'Prototypes/Savings goals',
  parameters: {
    layout: 'fullscreen',
    docs: { disable: true },
  },
  tags: ['!autodocs'],
}

export default meta

/* ---------------------------------------------------------------------------
 * Synthetic data
 * ------------------------------------------------------------------------- */

type Status = 'reached' | 'onTrack' | 'late' | 'unreachable' | 'noDate'

interface Goal {
  name: string
  current: number
  target: number
  /** Deadline, `YYYY-MM-DD`; null without one. */
  deadline: string | null
  /** Needed per month to meet the deadline; null when reached or no date. */
  monthly: number | null
  /** Reach date at the average savings; null when out of reach. */
  projected: string | null
  status: Status
}

/** Average monthly savings the projections use (6 full months). */
const AVERAGE = 71_694

const GOALS: Goal[] = [
  {
    name: 'Voyage au Japon',
    current: 120_000,
    target: 400_000,
    deadline: '2027-07-01',
    monthly: 35_000,
    projected: '2027-02-01',
    status: 'onTrack',
  },
  {
    name: 'Apport immobilier',
    current: 2_407_264,
    target: 5_000_000,
    deadline: '2031-11-01',
    monthly: 43_213,
    projected: '2029-11-01',
    status: 'onTrack',
  },
  {
    name: 'Nouvelle voiture',
    current: 200_000,
    target: 1_500_000,
    deadline: '2027-03-01',
    monthly: 325_000,
    projected: '2028-09-01',
    status: 'late',
  },
  {
    name: 'Vélo cargo',
    current: 30_000,
    target: 250_000,
    deadline: null,
    monthly: null,
    projected: '2027-02-01',
    status: 'noDate',
  },
  {
    name: 'Épargne de précaution',
    current: 1_081_850,
    target: 1_000_000,
    deadline: null,
    monthly: null,
    projected: null,
    status: 'reached',
  },
]

/* ---------------------------------------------------------------------------
 * Formatting
 * ------------------------------------------------------------------------- */

const euros = (cents: number) => formatWholeEuros(cents)
const monthYear = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const month = (date: string) => monthYear.format(new Date(`${date}T00:00:00Z`))
const ratio = (goal: Goal) => goal.current / goal.target
const percent = (goal: Goal) => `${Math.floor(ratio(goal) * 100)} %`
const left = (goal: Goal) => Math.max(goal.target - goal.current, 0)

const STATUS: Record<
  Status,
  { label: string; icon: LucideIcon; className: string }
> = {
  reached: {
    label: 'Atteint',
    icon: CircleCheckIcon,
    className: 'text-chart-delta-good',
  },
  onTrack: {
    label: 'Dans les temps',
    icon: CircleCheckIcon,
    className: 'text-chart-delta-good',
  },
  late: {
    label: 'En retard',
    icon: CircleAlertIcon,
    className: 'text-chart-delta-bad',
  },
  unreachable: {
    label: 'Hors de portée',
    icon: CircleAlertIcon,
    className: 'text-chart-delta-bad',
  },
  noDate: {
    label: 'Sans date',
    icon: ClockIcon,
    className: 'text-muted-foreground',
  },
}

/** The status word in its colour, with or without its icon. */
function StatusText({
  goal,
  icon = true,
  className,
}: {
  goal: Goal
  icon?: boolean
  className?: string
}) {
  const { label, icon: Icon, className: tone } = STATUS[goal.status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium whitespace-nowrap',
        tone,
        className,
      )}
    >
      {icon && <Icon aria-hidden className="size-[14px] shrink-0" />}
      {label}
    </span>
  )
}

/** « juil. 2027 », « prévu fév. 2027 » without a deadline, or nothing. */
function whenText(goal: Goal): string | null {
  if (goal.status === 'reached') return null
  if (goal.deadline) return month(goal.deadline)
  if (goal.projected) return `prévu ${month(goal.projected)}`
  return null
}

/* ---------------------------------------------------------------------------
 * Shared pieces
 * ------------------------------------------------------------------------- */

/** The app's 22px root, so rem-sized mockups look like the app. */
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

function Bar({ goal, className }: { goal: Goal; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-muted block h-2 overflow-hidden rounded-full',
        className,
      )}
    >
      <span
        className={cn(
          'block h-full rounded-full',
          goal.status === 'reached' ? 'bg-chart-delta-good' : 'bg-primary',
        )}
        style={{ width: `${Math.min(ratio(goal), 1) * 100}%` }}
      />
    </span>
  )
}

/** One goal as one target (it opens the goal's editor in the app). */
function GoalButton({
  goal,
  className,
  children,
  ...props
}: {
  goal: Goal
  className?: string
  children: ReactNode
} & React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label={`${goal.name} : ${percent(goal)}, ${STATUS[goal.status].label}`}
      className={cn(
        'hover:bg-muted/60 focus-visible:ring-ring block w-full rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

/** The card's frame: title, one-line projection note, « Ajouter ». */
function GoalsCard({
  description = `Au rythme de ${euros(AVERAGE)} par mois`,
  children,
}: {
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Objectifs</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Button size="sm" iconStart={<PlusIcon />}>
            Ajouter
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-2">
        {children}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm"
        >
          <ArchiveIcon aria-hidden className="size-[16px]" />
          <span className="flex-1 text-left">Objectifs archivés (1)</span>
          <ChevronRightIcon aria-hidden className="size-4" />
        </button>
      </CardContent>
    </Card>
  )
}

/* ---------------------------------------------------------------------------
 * A. Lignes compactes
 * ------------------------------------------------------------------------- */

function GoalsA() {
  return (
    <GoalsCard>
      <ul className="space-y-1">
        {GOALS.map((goal) => {
          const when = whenText(goal)
          return (
            <li key={goal.name}>
              <GoalButton goal={goal} className="space-y-1.5">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="min-w-0 font-medium break-normal">
                    {goal.name}
                  </span>
                  <StatusText goal={goal} icon={false} className="text-xs" />
                </span>
                <Bar goal={goal} />
                <span className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-x-3 text-xs tabular-nums">
                  <span>
                    <span className="whitespace-nowrap">
                      {goal.status === 'reached'
                        ? `${euros(goal.current)} sur ${euros(goal.target)}`
                        : `${euros(left(goal))} restants`}
                    </span>
                    {when && (
                      <>
                        {' · '}
                        <span className="whitespace-nowrap">{when}</span>
                      </>
                    )}
                  </span>
                  <span className="text-foreground font-medium whitespace-nowrap">
                    {percent(goal)}
                  </span>
                </span>
              </GoalButton>
            </li>
          )
        })}
      </ul>
    </GoalsCard>
  )
}

/* ---------------------------------------------------------------------------
 * B. Anneaux
 * ------------------------------------------------------------------------- */

function Ring({ goal }: { goal: Goal }) {
  const radius = 26
  const length = 2 * Math.PI * radius
  const filled = Math.min(ratio(goal), 1) * length
  return (
    <span className="relative block size-[56px] shrink-0">
      <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="7"
          className="stroke-muted"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${length}`}
          className={
            goal.status === 'reached'
              ? 'stroke-chart-delta-good'
              : 'stroke-primary'
          }
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold tabular-nums">
        {percent(goal)}
      </span>
    </span>
  )
}

function GoalsB() {
  return (
    <GoalsCard>
      <ul className="@container grid grid-cols-1 gap-2 @min-[400px]:grid-cols-2">
        {GOALS.map((goal) => (
          <li key={goal.name} className="min-w-0">
            <GoalButton
              goal={goal}
              className="bg-muted/40 flex h-full items-center gap-3 p-3"
            >
              <Ring goal={goal} />
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block font-medium break-normal">
                  {goal.name}
                </span>
                <span className="text-muted-foreground block text-xs tabular-nums">
                  <span className="whitespace-nowrap">
                    {euros(goal.current)}
                  </span>{' '}
                  sur{' '}
                  <span className="whitespace-nowrap">
                    {euros(goal.target)}
                  </span>
                </span>
                <StatusText goal={goal} className="text-xs" />
              </span>
            </GoalButton>
          </li>
        ))}
      </ul>
    </GoalsCard>
  )
}

/* ---------------------------------------------------------------------------
 * C. Effort mensuel
 * ------------------------------------------------------------------------- */

function GoalsC() {
  const needed = GOALS.reduce((total, goal) => total + (goal.monthly ?? 0), 0)
  const short = needed > AVERAGE
  return (
    <GoalsCard
      description={
        <span className="block space-y-1">
          <span className="text-foreground block text-2xl font-semibold whitespace-nowrap tabular-nums">
            {euros(needed)}{' '}
            <span className="text-muted-foreground text-sm font-normal">
              par mois
            </span>
          </span>
          <span className="block">
            pour tenir les échéances ·{' '}
            <span
              className={cn(
                'font-medium whitespace-nowrap',
                short ? 'text-chart-delta-bad' : 'text-chart-delta-good',
              )}
            >
              vous épargnez {euros(AVERAGE)}
            </span>
          </span>
        </span>
      }
    >
      <ul className="space-y-1">
        {GOALS.map((goal) => (
          <li key={goal.name}>
            <GoalButton goal={goal} className="space-y-1.5">
              <span className="flex items-baseline gap-3">
                <span className="min-w-0 flex-1 font-medium break-normal">
                  {goal.name}
                </span>
                <span className="text-right whitespace-nowrap tabular-nums">
                  {goal.monthly !== null ? (
                    <>
                      <span className="font-medium">{euros(goal.monthly)}</span>
                      <span className="text-muted-foreground text-xs">
                        {' '}
                        / mois
                      </span>
                    </>
                  ) : (
                    <StatusText goal={goal} icon={false} className="text-xs" />
                  )}
                </span>
              </span>
              <Bar goal={goal} className="h-1.5" />
              <span className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs tabular-nums">
                <span>
                  {euros(goal.current)} sur {euros(goal.target)}
                </span>
                {goal.deadline && goal.status !== 'reached' && (
                  <span
                    className={cn(
                      'whitespace-nowrap',
                      goal.status === 'late' && 'text-chart-delta-bad',
                    )}
                  >
                    jusqu’en {month(goal.deadline)}
                  </span>
                )}
                {goal.status === 'noDate' && goal.projected && (
                  <span className="whitespace-nowrap">
                    sans date · prévu {month(goal.projected)}
                  </span>
                )}
              </span>
            </GoalButton>
          </li>
        ))}
      </ul>
    </GoalsCard>
  )
}

/* ---------------------------------------------------------------------------
 * D. Repliés
 * ------------------------------------------------------------------------- */

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  )
}

function GoalD({ goal }: { goal: Goal }) {
  const [open, setOpen] = useState(false)
  const { icon: Icon, className: tone, label } = STATUS[goal.status]
  return (
    <li>
      <GoalButton
        goal={goal}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 items-center gap-3"
      >
        <Icon aria-label={label} className={cn('size-[18px] shrink-0', tone)} />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 font-medium break-normal">
              {goal.name}
            </span>
            <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
              {percent(goal)}
            </span>
          </span>
          <Bar goal={goal} className="h-1.5" />
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            'text-muted-foreground size-4 shrink-0 transition-transform',
            open && 'rotate-180',
          )}
        />
      </GoalButton>
      {open && (
        <dl className="mx-2 mb-2 rounded-lg border px-3 py-1 text-xs">
          <Detail label="Épargné">
            {euros(goal.current)} sur {euros(goal.target)}
          </Detail>
          {goal.status !== 'reached' && (
            <Detail label="Reste">{euros(left(goal))}</Detail>
          )}
          {goal.deadline && goal.status !== 'reached' && (
            <Detail label="Échéance">{month(goal.deadline)}</Detail>
          )}
          {goal.monthly !== null && (
            <Detail label="Il faut">{euros(goal.monthly)} / mois</Detail>
          )}
          {goal.projected && goal.status !== 'reached' && (
            <Detail label="À votre rythme">
              <span className={tone}>{month(goal.projected)}</span>
            </Detail>
          )}
          <div className="py-1">
            <Button size="sm" outline variant="secondary" className="w-full">
              Modifier
            </Button>
          </div>
        </dl>
      )}
    </li>
  )
}

function GoalsD() {
  const late = GOALS.filter((goal) => goal.status === 'late').length
  return (
    <GoalsCard
      description={
        late > 0
          ? `${late} en retard au rythme de ${euros(AVERAGE)} par mois`
          : `Tous dans les temps au rythme de ${euros(AVERAGE)} par mois`
      }
    >
      <ul className="space-y-0.5">
        {GOALS.map((goal) => (
          <GoalD key={goal.name} goal={goal} />
        ))}
      </ul>
    </GoalsCard>
  )
}

/* ---------------------------------------------------------------------------
 * Stories
 * ------------------------------------------------------------------------- */

function Widths({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <AppScale>
      <div className="bg-muted/40 text-foreground min-h-svh p-4">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-muted-foreground mb-4 max-w-[40rem] text-xs">
          {description}
        </p>
        <div className="flex items-start gap-6 overflow-x-auto pb-4">
          {[320, 375, 430].map((width) => (
            <div key={width} className="shrink-0" style={{ width }}>
              <p className="text-muted-foreground mb-2 px-4 text-xs">
                {width}px
              </p>
              <div className="bg-background border-x px-4 py-4">{children}</div>
            </div>
          ))}
        </div>
      </div>
    </AppScale>
  )
}

export const A_LignesCompactes: StoryObj = {
  name: 'A. Lignes compactes',
  render: () => (
    <Widths
      title="A. Lignes compactes"
      description="Comme les enveloppes du tableau de bord : le nom et le statut, la barre, puis « 2 800 € restants · juil. 2027 » et le %. Trois lignes par objectif ; toucher l’objectif l’ouvre."
    >
      <GoalsA />
    </Widths>
  ),
}

export const B_Anneaux: StoryObj = {
  name: 'B. Anneaux',
  render: () => (
    <Widths
      title="B. Anneaux"
      description="Une tuile par objectif (deux par ligne à partir de 400px) : l’anneau avec le %, à côté le nom, « 1 200 € sur 4 000 € » et le statut. Le reste (échéance, effort mensuel) dans l’objectif."
    >
      <GoalsB />
    </Widths>
  ),
}

export const C_EffortMensuel: StoryObj = {
  name: 'C. Effort mensuel',
  render: () => (
    <Widths
      title="C. Effort mensuel"
      description="Ce que chaque objectif demande par mois, et en tête leur total face à votre épargne moyenne. La barre et « jusqu’en juil. 2027 » dessous."
    >
      <GoalsC />
    </Widths>
  ),
}

export const D_Replies: StoryObj = {
  name: 'D. Repliés',
  render: () => (
    <Widths
      title="D. Repliés"
      description="Une ligne par objectif : son statut en icône, le nom, le % et une barre fine. Toucher l’objectif déplie ses chiffres en liste courte, avec « Modifier »."
    >
      <GoalsD />
    </Widths>
  ),
}
