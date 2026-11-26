import type { Meta, StoryObj } from '@storybook/react-vite'
import { Card, cn } from '@capi/ui'
import {
  ArrowRightIcon,
  ChevronDownIcon,
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
 The owner chose « B. La prochaine » (the most pressing task large with
 * « Y aller »), but not its row of badges of different sizes for the next
 * ones. Three ways to show them, every item the same size:
 *
 * B1. Pastilles: identical round badges, the number as a dot on the corner.
 * B2. Lignes: two thin rows (icon, sentence), « n autres » under them.
 * B3. Tuiles: identical square tiles in one row, icon and a word.
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
 * B. La prochaine: the top part
 * ----------------------------------------------------------------------- */

function Next({ task }: { task: Task }) {
  return (
    <div className="from-warning/25 to-warning/5 flex items-center gap-3 bg-gradient-to-br px-4 py-3.5">
      <span
        className={cn(
          'grid size-[44px] shrink-0 place-items-center rounded-2xl [&_svg]:size-[22px]',
          SOLID[task.tone],
        )}
      >
        <task.icon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{task.title}</span>
        <span className="text-muted-foreground block text-xs">
          {task.subtitle}
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
  )
}

function Prochaine({ children }: { children: ReactNode }) {
  return (
    <Card className="gap-0 overflow-hidden p-0">
      <Next task={TASKS[0]} />
      {children}
    </Card>
  )
}

const REST = TASKS.slice(1)

/** A number worth a dot: a count, not a date or an amount. */
const count = (task: Task) =>
  task.figure && /^\d+$/.test(task.figure) ? task.figure : undefined

/* B1. Identical round badges, the count as a dot on the corner. */
function Pastilles() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-muted-foreground text-xs font-medium">Ensuite</span>
      <ul className="flex flex-1 justify-end gap-2">
        {REST.slice(0, 4).map((task) => (
          <li key={task.key}>
            <span
              className={cn(
                'relative grid size-[38px] place-items-center rounded-full [&_svg]:size-[18px]',
                BADGE[task.tone],
              )}
            >
              <task.icon />
              {count(task) && (
                <span
                  className={cn(
                    'absolute -top-1 -right-1 grid h-[16px] min-w-[16px] place-items-center rounded-full px-[3px] text-[10px] leading-none font-bold tabular-nums',
                    SOLID[task.tone],
                  )}
                >
                  {count(task)}
                </span>
              )}
            </span>
          </li>
        ))}
        <li>
          <span className="text-muted-foreground grid size-[38px] place-items-center rounded-full border border-dashed text-xs font-semibold">
            +{REST.length - 4}
          </span>
        </li>
      </ul>
    </div>
  )
}

/* B2. Two thin rows, the rest behind « n autres ». */
function Lignes() {
  return (
    <div className="px-2 pt-1 pb-1.5">
      <ul>
        {REST.slice(0, 2).map((task) => (
          <li
            key={task.key}
            className="flex min-h-[44px] items-center gap-3 rounded-lg px-2"
          >
            <span
              className={cn(
                'grid size-[28px] shrink-0 place-items-center rounded-full [&_svg]:size-[15px]',
                BADGE[task.tone],
              )}
            >
              <task.icon />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {task.title}
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-muted-foreground flex min-h-[36px] w-full items-center justify-center gap-1 text-xs font-medium"
      >
        {REST.length - 2} autres
        <ChevronDownIcon className="size-4" />
      </button>
    </div>
  )
}

/* B3. Identical square tiles in one row: icon and a word. */
function Tuiles() {
  return (
    <ul className="grid grid-cols-3 gap-1.5 px-3 py-3">
      {REST.slice(0, 5).map((task) => (
        <li key={task.key}>
          <span className="bg-muted/50 flex h-[64px] flex-col items-center justify-center gap-1 rounded-xl">
            <span
              className={cn(
                'relative grid size-[28px] place-items-center rounded-full [&_svg]:size-[15px]',
                BADGE[task.tone],
              )}
            >
              <task.icon />
              {count(task) && (
                <span
                  className={cn(
                    'absolute -top-1 -right-2 grid h-[15px] min-w-[15px] place-items-center rounded-full px-[3px] text-[9px] leading-none font-bold tabular-nums',
                    SOLID[task.tone],
                  )}
                >
                  {count(task)}
                </span>
              )}
            </span>
            <span className="w-full truncate px-1 text-center text-[11px] font-medium">
              {task.word}
            </span>
          </span>
        </li>
      ))}
      <li>
        <span className="text-muted-foreground flex h-[64px] items-center justify-center rounded-xl border border-dashed text-xs font-medium">
          +{REST.length - 5}
        </span>
      </li>
    </ul>
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

export const B1_Pastilles: Story = {
  name: 'B1. Pastilles',
  render: ({ width }) => (
    <Frame width={width}>
      <Prochaine>
        <Pastilles />
      </Prochaine>
    </Frame>
  ),
}

export const B2_Lignes: Story = {
  name: 'B2. Lignes',
  render: ({ width }) => (
    <Frame width={width}>
      <Prochaine>
        <Lignes />
      </Prochaine>
    </Frame>
  ),
}

export const B3_Tuiles: Story = {
  name: 'B3. Tuiles',
  render: ({ width }) => (
    <Frame width={width}>
      <Prochaine>
        <Tuiles />
      </Prochaine>
    </Frame>
  ),
}
