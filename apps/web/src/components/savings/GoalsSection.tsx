import { useRegisterPageAction } from '#/components/app-shell/page-actions'
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  formatWholeEuros,
  Skeleton,
} from '@capi/ui'
import { useQuery } from '@tanstack/react-query'
import {
  ArchiveIcon,
  CalendarCheckIcon,
  CalendarXIcon,
  CheckIcon,
  FlagIcon,
  PlusIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { SavingsGoalDto } from '#/api/types.gen'
import { GoalEditor } from './GoalEditor'
import { signedWholeEuros, Stat } from './figures'
import { formatShortMonthOf } from './format'
import { savingsGoalsQuery } from './queries'

type GoalTone = 'good' | 'bad' | 'neutral'

/** The goal's status in one word or two, with its tone (#344 follow-up). */
export function goalStatus(goal: SavingsGoalDto): {
  label: string
  tone: GoalTone
} {
  if (goal.archived) return { label: 'Archivé', tone: 'neutral' }
  if (goal.reached) return { label: 'Atteint', tone: 'good' }
  const { projection } = goal
  if (!projection.reachable || projection.projectedDate === null) {
    return { label: 'Hors de portée', tone: 'bad' }
  }
  if (goal.targetDatePassed) return { label: 'Échéance passée', tone: 'bad' }
  if (projection.onTrack === false) return { label: 'En retard', tone: 'bad' }
  if (projection.onTrack === true) {
    return { label: 'Dans les temps', tone: 'good' }
  }
  return { label: 'Sans date', tone: 'neutral' }
}

/**
 * When the goal is reached at the current pace (#407): the projected month
 * with its tone (green before the deadline, red after, neutral without
 * one), else why there is none. Null once reached.
 */
export function goalWhen(
  goal: SavingsGoalDto,
): { label: string; tone: GoalTone; late: boolean } | null {
  if (goal.reached || goal.archived) return null
  const status = goalStatus(goal)
  const { projectedDate, onTrack } = goal.projection
  if (projectedDate === null || goal.targetDatePassed) {
    return { label: status.label, tone: 'bad', late: true }
  }
  return {
    label: formatShortMonthOf(projectedDate),
    tone: onTrack === true ? 'good' : onTrack === false ? 'bad' : 'neutral',
    late: onTrack === false,
  }
}

/** What the active goals need per month together, null when none says. */
export function goalsMonthlyNeed(goals: SavingsGoalDto[]): number | null {
  const needs = goals
    .filter((goal) => !goal.archived && !goal.reached)
    .map((goal) => goal.requiredMonthlyCents)
    .filter((cents): cents is number => cents !== null)
  return needs.length === 0 ? null : needs.reduce((a, b) => a + b, 0)
}

/** The columns of a goal's row on a computer, and of their headings. */
const GOAL_COLUMNS =
  'grid-cols-[minmax(0,9rem)_minmax(5rem,1fr)_7rem_5.5rem_6.5rem]'

const TONE: Record<GoalTone, string> = {
  good: 'text-chart-delta-good',
  bad: 'text-chart-delta-bad',
  neutral: 'text-muted-foreground',
}

/**
 * One goal (#407): its name and what it needs per month (or « Atteint »),
 * its bar, then where it stands and when it is reached at this pace. The
 * whole goal opens its editor.
 */
function GoalItem({
  goal,
  onEdit,
  wide,
}: {
  goal: SavingsGoalDto
  onEdit: () => void
  wide: boolean
}) {
  const status = goalStatus(goal)
  const when = goalWhen(goal)
  const need = goal.reached || goal.archived ? null : goal.requiredMonthlyCents
  const amount = `${formatWholeEuros(goal.currentCents)} / ${formatWholeEuros(goal.targetCents)}`
  const WhenIcon = when?.late ? CalendarXIcon : CalendarCheckIcon
  const label = [
    `Modifier l’objectif ${goal.name}`,
    goal.reached || goal.archived ? status.label : null,
    need === null ? null : `${formatWholeEuros(need)} par mois`,
    amount,
    when === null
      ? null
      : when.late && goal.projection.projectedDate === null
        ? when.label
        : `atteint en ${when.label} à ce rythme`,
  ]
    .filter(Boolean)
    .join(', ')
  if (wide) {
    return (
      <li>
        <button
          type="button"
          onClick={onEdit}
          aria-label={label}
          className={cn(
            'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring grid min-h-11 w-full items-center gap-x-3 rounded-lg px-2 text-left text-sm outline-none focus-visible:ring-2',
            GOAL_COLUMNS,
          )}
        >
          <span className="min-w-0 truncate font-medium">{goal.name}</span>
          <span
            aria-hidden
            className="bg-muted block h-1.5 overflow-hidden rounded-full"
          >
            <span
              className={cn(
                'block h-full rounded-full',
                goal.reached ? 'bg-chart-delta-good' : 'bg-primary',
              )}
              style={{ width: `${Math.min(goal.progressRatio, 1) * 100}%` }}
            />
          </span>
          <span className="text-muted-foreground text-right text-xs whitespace-nowrap tabular-nums">
            {goal.reached ? formatWholeEuros(goal.currentCents) : amount}
          </span>
          <span className="text-right font-semibold whitespace-nowrap tabular-nums">
            {need === null ? (
              <span className="text-muted-foreground font-normal">—</span>
            ) : (
              <>
                {formatWholeEuros(need)}
                <span className="text-muted-foreground text-xs font-normal">
                  /mois
                </span>
              </>
            )}
          </span>
          <span
            className={cn(
              'flex items-center justify-end gap-1 text-xs font-medium whitespace-nowrap',
              goal.reached || goal.archived
                ? TONE[status.tone]
                : when
                  ? TONE[when.tone]
                  : undefined,
            )}
          >
            {goal.reached || goal.archived ? (
              <>
                {goal.reached && !goal.archived && (
                  <CheckIcon aria-hidden className="size-3.5" />
                )}
                {status.label}
              </>
            ) : (
              when && (
                <>
                  <WhenIcon aria-hidden className="size-3.5" />
                  {when.label}
                </>
              )
            )}
          </span>
        </button>
      </li>
    )
  }
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        aria-label={label}
        className="hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring block w-full space-y-1.5 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="min-w-0 font-medium break-normal">{goal.name}</span>
          {need !== null ? (
            <span className="font-semibold whitespace-nowrap tabular-nums">
              {formatWholeEuros(need)}
              <span className="text-muted-foreground text-xs font-normal">
                /mois
              </span>
            </span>
          ) : goal.reached || goal.archived ? (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium whitespace-nowrap',
                TONE[status.tone],
              )}
            >
              {goal.reached && !goal.archived && (
                <CheckIcon aria-hidden className="size-3" />
              )}
              {status.label}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden
          className="bg-muted block h-2 overflow-hidden rounded-full"
        >
          <span
            className={cn(
              'block h-full rounded-full',
              goal.reached ? 'bg-chart-delta-good' : 'bg-primary',
            )}
            style={{ width: `${Math.min(goal.progressRatio, 1) * 100}%` }}
          />
        </span>
        {!goal.reached && (
          <span className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-x-3 text-xs tabular-nums">
            <span className="whitespace-nowrap">{amount}</span>
            {when && (
              <span
                className={cn(
                  'flex items-center gap-1 font-medium whitespace-nowrap',
                  TONE[when.tone],
                )}
                title={
                  goal.targetDate === null
                    ? undefined
                    : `Échéance ${formatShortMonthOf(goal.targetDate)}`
                }
              >
                <WhenIcon aria-hidden className="size-3.5" />
                {when.label}
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  )
}

/**
 * Savings goals (#407): what the active ones need per month together and
 * the margin the average leaves (6 full months, one-offs excluded), then
 * one row per goal. Each goal is projected at that whole average, as the
 * API does. Added, changed, archived and deleted in a sheet.
 */
export function GoalsSection({
  projectionAverageCents,
  wide = false,
}: {
  /** Average the projections use (6 full months, one-offs excluded). */
  projectionAverageCents: number | null
  /** A computer: the two figures in the header, one table row per goal. */
  wide?: boolean
}) {
  const [showArchived, setShowArchived] = useState(false)
  const goals = useQuery(savingsGoalsQuery(showArchived))
  const [editorOpen, setEditorOpen] = useState(false)
  const [edited, setEdited] = useState<SavingsGoalDto | undefined>()

  function open(goal?: SavingsGoalDto) {
    setEdited(goal)
    setEditorOpen(true)
  }

  const list = goals.data ?? []
  const need = goalsMonthlyNeed(list)
  // In the page's « ⋮ » inside the shell (#386).
  const inMenu = useRegisterPageAction({
    label: 'Ajouter un objectif',
    icon: <FlagIcon />,
    onSelect: () => open(),
  })

  return (
    <Card className="min-w-0">
      <CardHeader
        className={cn(
          wide && 'flex flex-wrap items-baseline justify-between gap-x-4',
        )}
      >
        <CardTitle>Objectifs</CardTitle>
        {wide && need !== null && (
          <span className="text-muted-foreground text-sm">
            <span className="text-foreground font-semibold tabular-nums">
              {formatWholeEuros(need)}/mois
            </span>
            {projectionAverageCents !== null && (
              <>
                {' · marge '}
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    TONE[projectionAverageCents >= need ? 'good' : 'bad'],
                  )}
                >
                  {signedWholeEuros(projectionAverageCents - need)}
                </span>
              </>
            )}
          </span>
        )}
        {!inMenu && (
          <CardAction>
            <Button size="sm" onClick={() => open()}>
              <PlusIcon aria-hidden />
              Ajouter
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!wide && need !== null && (
          <div className="grid grid-cols-2 gap-2">
            <Stat value={formatWholeEuros(need)} label="par mois" />
            {projectionAverageCents !== null && (
              <Stat
                value={signedWholeEuros(projectionAverageCents - need)}
                label="de marge"
                tone={projectionAverageCents >= need ? 'good' : 'bad'}
              />
            )}
          </div>
        )}
        {goals.isPending ? (
          <div className="space-y-4" aria-busy="true" aria-label="Chargement">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : goals.isError ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Impossible de charger les objectifs.</span>
            <Button
              outline
              variant="secondary"
              size="sm"
              onClick={() => void goals.refetch()}
            >
              Réessayer
            </Button>
          </div>
        ) : list.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FlagIcon />
              </EmptyMedia>
              <EmptyTitle>
                {showArchived ? 'Aucun objectif' : 'Aucun objectif en cours'}
              </EmptyTitle>
              <EmptyDescription>
                Un fonds de secours, un voyage, un apport : fixez un montant et
                une date, l’app calcule l’effort mensuel.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => open()}>
                <PlusIcon aria-hidden />
                Ajouter un objectif
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div>
            {wide && (
              <div
                aria-hidden
                className={cn(
                  'text-muted-foreground grid gap-x-3 border-b px-2 pb-1.5 text-xs',
                  GOAL_COLUMNS,
                )}
              >
                <span className="truncate">Objectif</span>
                <span className="truncate">Avancement</span>
                <span className="text-right">Épargné</span>
                <span className="text-right">Il faut</span>
                <span className="text-right">À ce rythme</span>
              </div>
            )}
            <ul className={wide ? 'divide-y' : 'space-y-1'}>
              {list.map((goal) => (
                <GoalItem
                  key={goal.id}
                  goal={goal}
                  wide={wide}
                  onEdit={() => open(goal)}
                />
              ))}
            </ul>
          </div>
        )}
        {goals.isSuccess && (
          <button
            type="button"
            aria-pressed={showArchived}
            onClick={() => setShowArchived(!showArchived)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm outline-none focus-visible:ring-2"
          >
            <ArchiveIcon aria-hidden className="size-[16px] shrink-0" />
            <span className="flex-1 text-left">
              {showArchived ? 'Masquer les archivés' : 'Voir les archivés'}
            </span>
          </button>
        )}
      </CardContent>
      <GoalEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        goal={edited}
      />
    </Card>
  )
}
