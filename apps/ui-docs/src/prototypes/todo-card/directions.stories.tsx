import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card, cn } from '@capi/ui'
import {
  ArrowRightIcon,
  ChevronRightIcon,
  FileUpIcon,
  HandshakeIcon,
  InboxIcon,
  LineChartIcon,
  NotebookPenIcon,
  RefreshCwIcon,
  RepeatIcon,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * #495, the dashboard's « À faire » card: three directions, clickable
 * mockups with synthetic data, not app code (deleted once the owner has
 * chosen).
 *
 * A. Pastilles: one round badge per task in a row, its number on it, one
 *    word under it; what blocks the figures ringed in amber.
 * B. La prochaine: the most pressing task large with « Y aller », the
 *    others as small badges under it.
 * C. Tuiles: a grid of small tiles, a big number or word each, amber first.
 */
const meta: Meta<Args> = {
  title: 'Prototypes/Carte À faire (#495)',
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

type Tone = 'warning' | 'primary' | 'info'

interface Task {
  key: string
  icon: LucideIcon
  tone: Tone
  /** The row's sentence (today's card). */
  title: string
  subtitle?: string
  /** One or two words (A, C). */
  word: string
  /** A number on the badge, or a short figure. */
  figure?: string
}

/** Synthetic: what a usual end of month looks like. */
const TASKS: Task[] = [
  {
    key: 'import',
    icon: FileUpIcon,
    tone: 'warning',
    title: 'Importer un relevé',
    subtitle: 'Dernier relevé au 16 nov.',
    word: 'Relevé',
    figure: '10 j',
  },
  {
    key: 'close',
    icon: NotebookPenIcon,
    tone: 'warning',
    title: 'Clôturer octobre',
    subtitle: '2 comptes à mettre à jour avant',
    word: 'Clôture',
    figure: 'Oct.',
  },
  {
    key: 'review',
    icon: InboxIcon,
    tone: 'primary',
    title: '12 opérations à revoir',
    subtitle: 'Catégorie à vérifier',
    word: 'À revoir',
    figure: '12',
  },
  {
    key: 'repayment',
    icon: HandshakeIcon,
    tone: 'info',
    title: 'Alex t’a versé 40 €',
    subtitle: 'Un remboursement ? À lier',
    word: 'Alex',
    figure: '40 €',
  },
  {
    key: 'renewal',
    icon: RefreshCwIcon,
    tone: 'info',
    title: 'Antivirus fictif',
    subtitle: 'Se renouvelle le 30 nov.',
    word: 'Antivirus',
    figure: '30/11',
  },
  {
    key: 'subscriptions',
    icon: RepeatIcon,
    tone: 'info',
    title: '2 abonnements détectés',
    subtitle: 'À confirmer ou écarter',
    word: 'Abos',
    figure: '2',
  },
  {
    key: 'values',
    icon: LineChartIcon,
    tone: 'info',
    title: 'Un placement à mettre à jour',
    subtitle: 'Valeur ancienne',
    word: 'Placement',
    figure: '1',
  },
]

const BADGE: Record<Tone, string> = {
  warning: 'bg-warning/20 text-warning-foreground dark:text-warning',
  primary: 'bg-primary/10 text-primary',
  info: 'bg-info/15 text-info-foreground dark:text-info',
}

const SOLID: Record<Tone, string> = {
  warning: 'bg-warning text-warning-foreground',
  primary: 'bg-primary text-primary-foreground',
  info: 'bg-info text-white',
}

function Frame({ width, children }: { width: number; children: ReactNode }) {
  return (
    <div className="bg-background min-h-svh" style={{ width }}>
      <div className="space-y-3 px-3 pt-4 pb-8">
        <div className="px-1">
          <h1 className="text-xl font-semibold">Tableau de bord</h1>
          <p className="text-muted-foreground text-sm">Jeudi 26 novembre</p>
        </div>
        {children}
        {/* The next card, so the À faire card is seen in its place. */}
        <Card className="gap-1 px-4 py-3">
          <span className="text-muted-foreground text-xs">
            Reste à dépenser en novembre
          </span>
          <span className="text-3xl font-semibold tabular-nums">412 €</span>
          <span className="bg-muted mt-1 block h-2 rounded-full">
            <span className="bg-primary block h-full w-3/4 rounded-full" />
          </span>
        </Card>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------
 * Today
 * ----------------------------------------------------------------------- */

function Today() {
  return (
    <Card className="ring-warning/60 gap-0 px-2 pt-1 pb-2">
      <div className="flex min-h-8 items-center justify-between px-2">
        <h2 className="text-muted-foreground text-xs font-medium">À faire</h2>
        <span className="text-muted-foreground text-xs font-medium">
          4 autres ▾
        </span>
      </div>
      <ul>
        {TASKS.slice(0, 3).map((task) => (
          <li
            key={task.key}
            className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1"
          >
            <span
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-4',
                BADGE[task.tone],
              )}
            >
              <task.icon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{task.title}</span>
              <span className="text-muted-foreground block text-xs">
                {task.subtitle}
              </span>
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4" />
          </li>
        ))}
      </ul>
    </Card>
  )
}

/* -------------------------------------------------------------------------
 * A. Pastilles
 * ----------------------------------------------------------------------- */

function Pastilles() {
  const urgent = TASKS.filter((task) => task.tone === 'warning').length
  return (
    <Card className="gap-2 px-0 pt-2.5 pb-3">
      <div className="flex items-center gap-2 px-4">
        <h2 className="text-sm font-semibold">À faire</h2>
        <span className="bg-warning text-warning-foreground rounded-full px-2 text-xs font-semibold tabular-nums">
          {TASKS.length}
        </span>
        {urgent > 0 && (
          <span className="text-warning-foreground dark:text-warning ml-auto text-xs font-medium">
            {urgent} urgents
          </span>
        )}
      </div>
      {/* One row, scrolled sideways past the screen's edge. */}
      <ul className="flex gap-2 overflow-x-auto px-4 pt-1 pb-1 [scrollbar-width:none]">
        {TASKS.map((task) => (
          <li key={task.key} className="w-[60px] shrink-0">
            <button
              type="button"
              className="flex w-full flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  'relative grid size-[48px] place-items-center rounded-full [&_svg]:size-[22px]',
                  BADGE[task.tone],
                  task.tone === 'warning' &&
                    'ring-warning ring-offset-card ring-2 ring-offset-2',
                )}
              >
                <task.icon />
                {task.figure && /^\d+$/.test(task.figure) && (
                  <span
                    className={cn(
                      'absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full px-1 text-[0.6rem] font-bold tabular-nums',
                      SOLID[task.tone],
                    )}
                  >
                    {task.figure}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center text-[11px] font-medium">
                {task.word}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/* -------------------------------------------------------------------------
 * B. La prochaine
 * ----------------------------------------------------------------------- */

function Prochaine() {
  const [first, ...rest] = TASKS
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="from-warning/25 to-warning/5 flex items-center gap-3 bg-gradient-to-br px-4 py-3.5">
        <span
          className={cn(
            'grid size-[44px] shrink-0 place-items-center rounded-2xl [&_svg]:size-[22px]',
            SOLID[first.tone],
          )}
        >
          <first.icon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{first.title}</span>
          <span className="text-muted-foreground block text-xs">
            {first.subtitle}
          </span>
        </span>
        <button
          type="button"
          aria-label="Y aller"
          className="bg-foreground text-background grid size-[40px] shrink-0 place-items-center rounded-full [&_svg]:size-5"
        >
          <ArrowRightIcon />
        </button>
      </div>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="text-muted-foreground text-xs font-medium">
          Ensuite
        </span>
        <ul className="flex flex-1 flex-wrap gap-1.5">
          {rest.map((task) => (
            <li key={task.key}>
              <span
                className={cn(
                  'flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums [&_svg]:size-4',
                  BADGE[task.tone],
                )}
              >
                <task.icon />
                {task.figure && /^\d+$/.test(task.figure) && task.figure}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------
 * C. Tuiles
 * ----------------------------------------------------------------------- */

function Tuiles() {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 px-1 text-sm font-semibold">
        À faire
        <span className="bg-warning text-warning-foreground rounded-full px-2 text-xs font-semibold">
          {TASKS.length}
        </span>
      </h2>
      <ul className="grid grid-cols-3 gap-1.5">
        {TASKS.map((task) => (
          <li key={task.key}>
            <button
              type="button"
              className={cn(
                'bg-card flex h-full w-full flex-col gap-1 rounded-xl border px-2 py-2 text-left',
                task.tone === 'warning' && 'border-warning/70 bg-warning/10',
              )}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'grid size-[26px] shrink-0 place-items-center rounded-full [&_svg]:size-[14px]',
                    BADGE[task.tone],
                  )}
                >
                  <task.icon />
                </span>
                <span className="truncate text-sm leading-tight font-semibold tabular-nums">
                  {task.figure}
                </span>
              </span>
              <span className="text-muted-foreground block truncate text-[11px]">
                {task.word}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const Aujourdhui: Story = {
  name: 'Aujourd’hui',
  render: ({ width }) => (
    <Frame width={width}>
      <Today />
    </Frame>
  ),
}

export const A_Pastilles: Story = {
  name: 'A. Pastilles',
  render: ({ width }) => (
    <Frame width={width}>
      <Pastilles />
    </Frame>
  ),
}

export const B_LaProchaine: Story = {
  name: 'B. La prochaine',
  render: ({ width }) => (
    <Frame width={width}>
      <Prochaine />
    </Frame>
  ),
}

export const C_Tuiles: Story = {
  name: 'C. Tuiles',
  render: ({ width }) => (
    <Frame width={width}>
      <Tuiles />
    </Frame>
  ),
}
