import { useRegisterPageAction } from '#/components/app-shell/page-actions'
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import { ArchiveIcon, FlagIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import type { SavingsGoalDto } from '#/api/types.gen'
import { GoalEditor } from './GoalEditor'
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

/** `juil. 2027` (the deadline), `prévu févr. 2027` without one, or null. */
export function goalWhen(goal: SavingsGoalDto): string | null {
  if (goal.reached) return null
  if (goal.targetDate !== null) return formatShortMonthOf(goal.targetDate)
  if (goal.projection.projectedDate !== null) {
    return `prévu ${formatShortMonthOf(goal.projection.projectedDate)}`
  }
  return null
}

const TONE: Record<GoalTone, string> = {
  good: 'text-chart-delta-good',
  bad: 'text-chart-delta-bad',
  neutral: 'text-muted-foreground',
}

/**
 * One goal in three lines (owner's « A. Lignes compactes », chosen in
 * PR #349): its name and status, its bar, then what is left · its deadline
 * and the %. The whole goal opens its editor.
 */
function GoalItem({
  goal,
  onEdit,
}: {
  goal: SavingsGoalDto
  onEdit: () => void
}) {
  const status = goalStatus(goal)
  const when = goalWhen(goal)
  const percent = `${Math.floor(goal.progressRatio * 100)} %`
  const amount = goal.reached
    ? `${formatWholeEuros(goal.currentCents)} sur ${formatWholeEuros(goal.targetCents)}`
    : `${formatWholeEuros(goal.remainingCents)} restants`
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Modifier l’objectif ${goal.name} : ${status.label}, ${amount}${when ? ` · ${when}` : ''}, ${percent}`}
        className="hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring block w-full space-y-1.5 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="min-w-0 font-medium break-normal">{goal.name}</span>
          <span
            className={cn(
              'text-xs font-medium whitespace-nowrap',
              TONE[status.tone],
            )}
          >
            {status.label}
          </span>
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
        <span className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-x-3 text-xs tabular-nums">
          <span>
            <span className="whitespace-nowrap">{amount}</span>
            {when && (
              <>
                {' · '}
                <span className="whitespace-nowrap">{when}</span>
              </>
            )}
          </span>
          <span className="text-foreground font-medium whitespace-nowrap">
            {percent}
          </span>
        </span>
      </button>
    </li>
  )
}

/**
 * Savings goals, one compact row each (status, bar, what is left, deadline,
 * %), projected at the average monthly savings, one-offs excluded. The
 * monthly effort is in the goal's editor. Added, changed, archived and
 * deleted in a sheet.
 */
export function GoalsSection({
  projectionAverageCents,
}: {
  /** Average the projections use (6 full months, one-offs excluded). */
  projectionAverageCents: number | null
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
  // In the page's « ⋮ » inside the shell (#386).
  const inMenu = useRegisterPageAction({
    label: 'Ajouter un objectif',
    icon: <FlagIcon />,
    onSelect: () => open(),
  })

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Objectifs</CardTitle>
        <CardDescription>
          {projectionAverageCents === null
            ? 'Pas encore de mois complet pour projeter vos objectifs.'
            : `Au rythme de ${formatWholeEuros(projectionAverageCents)} par mois`}
        </CardDescription>
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
          <ul className="space-y-1">
            {list.map((goal) => (
              <GoalItem key={goal.id} goal={goal} onEdit={() => open(goal)} />
            ))}
          </ul>
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
