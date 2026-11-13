import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Label,
  ProgressMeter,
  Skeleton,
  Switch,
} from '@finances/ui'
import { useQuery } from '@tanstack/react-query'
import {
  CircleAlertIcon,
  CircleCheckIcon,
  FlagIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react'
import { useId, useState } from 'react'
import type { SavingsGoalDto } from '#/api/types.gen'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { GoalEditor } from './GoalEditor'
import { formatMonthOf } from './format'
import { savingsGoalsQuery } from './queries'

/** Plain-language status of a goal's projection, with its tone. */
function projectionText(goal: SavingsGoalDto): {
  text: string
  tone: 'good' | 'bad' | 'neutral'
} {
  const { projection } = goal
  if (goal.reached) return { text: 'Objectif atteint', tone: 'good' }
  if (!projection.reachable || projection.projectedDate === null) {
    return {
      text: 'Pas atteignable au rythme actuel (épargne moyenne nulle ou négative)',
      tone: 'bad',
    }
  }
  const when = `Atteint en ${formatMonthOf(projection.projectedDate)} au rythme actuel`
  if (projection.onTrack === false) {
    return { text: `${when}, après l’échéance`, tone: 'bad' }
  }
  if (projection.onTrack === true) {
    return { text: `${when}, dans les temps`, tone: 'good' }
  }
  return { text: when, tone: 'neutral' }
}

function GoalItem({
  goal,
  onEdit,
}: {
  goal: SavingsGoalDto
  onEdit: () => void
}) {
  const status = projectionText(goal)
  const StatusIcon =
    status.tone === 'good'
      ? CircleCheckIcon
      : status.tone === 'bad'
        ? CircleAlertIcon
        : null

  return (
    <li className="space-y-2 py-3">
      <ProgressMeter
        goal="reach"
        label={goal.name}
        value={goal.currentCents}
        target={goal.targetCents}
        valueFormatter={formatCents}
        // The goal's own lines below say what is left and when.
        hideStatus
        action={
          <Button
            ghost
            size="sm"
            className="-mt-1 shrink-0"
            onClick={onEdit}
            aria-label={`Modifier l’objectif ${goal.name}`}
          >
            <PencilIcon aria-hidden />
          </Button>
        }
      />
      <dl className="text-muted-foreground grid gap-0.5 text-xs">
        <div className="flex flex-wrap gap-x-1">
          <dt className="sr-only">Épargné</dt>
          <dd>
            {goal.reached
              ? `${formatCents(goal.currentCents)} épargnés`
              : `Reste ${formatCents(goal.remainingCents)}`}{' '}
            ({Math.floor(goal.progressRatio * 100)} %)
            {goal.archived && (
              <Badge variant="secondary" className="ml-2">
                Archivé
              </Badge>
            )}
          </dd>
        </div>
        {goal.targetDate !== null && (
          <div className="flex flex-wrap gap-x-1">
            <dt>Échéance :</dt>
            <dd>
              {formatCalendarDate(goal.targetDate)}
              {goal.targetDatePassed
                ? ' (dépassée)'
                : goal.requiredMonthlyCents !== null &&
                  !goal.reached &&
                  `, soit ${formatCents(goal.requiredMonthlyCents)} par mois pendant ${goal.monthsLeft} mois`}
            </dd>
          </div>
        )}
        <div className="flex items-center gap-1">
          <dt className="sr-only">Projection</dt>
          <dd
            className={
              status.tone === 'good'
                ? 'text-chart-delta-good flex items-center gap-1'
                : status.tone === 'bad'
                  ? 'text-chart-delta-bad flex items-center gap-1'
                  : 'flex items-center gap-1'
            }
          >
            {StatusIcon && (
              <StatusIcon aria-hidden className="size-3.5 shrink-0" />
            )}
            {status.text}
          </dd>
        </div>
      </dl>
    </li>
  )
}

/**
 * Savings goals: progress, deadline and monthly amount needed, projected
 * reach date at the average monthly savings, one-offs excluded (stated in
 * the description). Added, changed, archived and deleted in a sheet.
 */
export function GoalsSection({
  projectionAverageCents,
}: {
  /** Average the projections use (6 full months, one-offs excluded). */
  projectionAverageCents: number | null
}) {
  const id = useId()
  const [showArchived, setShowArchived] = useState(false)
  const goals = useQuery(savingsGoalsQuery(showArchived))
  const [editorOpen, setEditorOpen] = useState(false)
  const [edited, setEdited] = useState<SavingsGoalDto | undefined>()

  function open(goal?: SavingsGoalDto) {
    setEdited(goal)
    setEditorOpen(true)
  }

  const list = goals.data ?? []

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Objectifs</CardTitle>
        <CardDescription>
          {projectionAverageCents === null
            ? 'Pas encore de mois complet pour projeter vos objectifs.'
            : `Projetés à ${formatCents(projectionAverageCents)} par mois : votre épargne moyenne des 6 derniers mois complets, sans les revenus et dépenses ponctuels.`}
        </CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => open()}>
            <PlusIcon aria-hidden />
            Ajouter
          </Button>
        </CardAction>
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
          <ul className="divide-y">
            {list.map((goal) => (
              <GoalItem key={goal.id} goal={goal} onEdit={() => open(goal)} />
            ))}
          </ul>
        )}
        {goals.isSuccess && (
          <div className="flex items-center gap-2">
            <Switch
              id={`${id}-archived`}
              size="sm"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor={`${id}-archived`} className="font-normal">
              Afficher les objectifs archivés
            </Label>
          </div>
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
