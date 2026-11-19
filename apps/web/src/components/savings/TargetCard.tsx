import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Field,
  FieldError,
  FieldLabel,
  formatWholeEuros,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TargetIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { AmountField } from '#/components/amount/AmountField'
import type { MonthPeriodDto, SavingsOverviewDto } from '#/api/types.gen'
import {
  centsToInput,
  parseEurosToCents,
  targetError,
} from '#/components/budget/amount'
import { formatMonth } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { savingsErrorMessage } from './errors'
import { afterSavingsChanged, saveTarget } from './queries'

/**
 * The monthly savings target ("Épargne cible") against the page month's net
 * savings (the KPI tiles' month, so far while it is in progress) as one row
 * like a savings goal, how many recent full months reached it as dots, and
 * the target itself, edited in place by tapping the row.
 */
export function TargetCard({ overview }: { overview: SavingsOverviewDto }) {
  const target = overview.monthlyTargetCents
  const [editing, setEditing] = useState(false)

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Épargne cible</CardTitle>
        {target !== null && (
          <CardDescription>{`${formatWholeEuros(target)} par mois`}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <TargetForm target={target} onDone={() => setEditing(false)} />
        ) : target === null ? (
          <EmptyState
            variant="inline"
            icon={<TargetIcon />}
            title="Pas encore de cible"
            description="Fixez le montant à mettre de côté chaque mois : l’écart du mois et le graphique s’y compareront."
            actions={
              <Button onClick={() => setEditing(true)}>
                Définir une cible
              </Button>
            }
          />
        ) : (
          <TargetProgress
            overview={overview}
            target={target}
            onEdit={() => setEditing(true)}
          />
        )}
      </CardContent>
    </Card>
  )
}

type Tone = 'good' | 'bad' | 'neutral'

const TONE: Record<Tone, string> = {
  good: 'text-chart-delta-good',
  bad: 'text-chart-delta-bad',
  neutral: 'text-muted-foreground',
}

/**
 * The page month against the target in the goal rows' words: the status,
 * then the amount saved over the target and the gap (« reste 460 € » while
 * the month runs, « −460 € » once it is over, « +120 € » above it).
 */
export function targetMonthStatus(
  netCents: number,
  target: number,
  inProgress: boolean,
): { label: string; tone: Tone; gap: string; gapTone: Tone } {
  const gap = netCents - target
  if (gap >= 0) {
    return {
      label: 'Atteinte',
      tone: 'good',
      gap: gap > 0 ? `+${formatWholeEuros(gap)}` : '',
      gapTone: 'good',
    }
  }
  if (inProgress) {
    return {
      label: 'En cours',
      tone: 'neutral',
      gap: `reste ${formatWholeEuros(-gap)}`,
      gapTone: 'neutral',
    }
  }
  return {
    label: 'Sous la cible',
    tone: 'bad',
    gap: `−${formatWholeEuros(-gap)}`,
    gapTone: 'bad',
  }
}

/** « Novembre 2026 », « Octobre 2026 · jusqu’au 20 oct. » for a past partial month. */
function monthTitle(period: MonthPeriodDto, inProgress: boolean): string {
  const name = formatMonth(period.month)
  if (inProgress || period.status !== 'partial' || period.dataUntil === null) {
    return name
  }
  return `${name} · jusqu’au ${formatShortDay(period.dataUntil)}`
}

/**
 * The page month as one row like a savings goal (#344 follow-up): its name
 * and status, its bar, then « 400 € sur 860 € » and the gap; the whole row
 * edits the target. Then the last full months as dots, reached or not.
 */
function TargetProgress({
  overview,
  target,
  onEdit,
}: {
  overview: SavingsOverviewDto
  target: number
  onEdit: () => void
}) {
  // The page's month (the current one when it has data, else the month the
  // data stops in) and how far its data goes.
  const { period, current } = overview
  const inProgress = period.month === overview.currentMonth
  const status = targetMonthStatus(current.netCents, target, inProgress)
  const title = monthTitle(period, inProgress)
  const amount = `${formatWholeEuros(current.netCents)} sur ${formatWholeEuros(target)}`
  const ratio =
    target > 0 ? Math.min(Math.max(current.netCents / target, 0), 1) : 0
  // Last 6 full months (fewer when the history is shorter).
  const recent = overview.months.filter((m) => m.complete).slice(-6)
  const reachedCount = recent.filter((m) => m.netCents >= target).length

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Modifier l’épargne cible : ${title}, ${status.label}, ${amount}${status.gap ? `, ${status.gap}` : ''}`}
        className="hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-ring block w-full space-y-1.5 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-2"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="min-w-0 font-medium break-normal">{title}</span>
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
              status.tone === 'good' ? 'bg-chart-delta-good' : 'bg-primary',
            )}
            style={{ width: `${ratio * 100}%` }}
          />
        </span>
        <span className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-x-3 text-xs tabular-nums">
          <span className="whitespace-nowrap">{amount}</span>
          {status.gap && (
            <span
              className={cn(
                'font-medium whitespace-nowrap',
                status.gapTone === 'neutral'
                  ? 'text-foreground'
                  : TONE[status.gapTone],
              )}
            >
              {status.gap}
            </span>
          )}
        </span>
      </button>
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs">
          <ol
            aria-label="Derniers mois complets"
            className="flex items-center gap-1"
          >
            {recent.map((m) => {
              const reached = m.netCents >= target
              return (
                <li
                  key={m.month}
                  title={`${formatMonth(m.month)} : ${reached ? 'atteinte' : 'non atteinte'}`}
                  className={cn(
                    'size-[10px] rounded-full',
                    reached ? 'bg-chart-delta-good' : 'bg-muted-foreground/25',
                  )}
                >
                  <span className="sr-only">
                    {`${formatMonth(m.month)} : ${reached ? 'atteinte' : 'non atteinte'}`}
                  </span>
                </li>
              )
            })}
          </ol>
          <span className="text-muted-foreground">
            Atteinte{' '}
            <span className="text-foreground font-medium tabular-nums">
              {reachedCount} mois sur {recent.length}
            </span>
          </span>
        </div>
      )}
    </div>
  )
}

function TargetForm({
  target,
  onDone,
}: {
  target: number | null
  onDone: () => void
}) {
  const id = useId()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState(
    target === null ? '' : centsToInput(target),
  )
  const [submitted, setSubmitted] = useState(false)
  const error = targetError(amount)

  const save = useMutation({
    mutationFn: (cents: number | null) => saveTarget(cents),
    onSuccess: async (result) => {
      toast.success(
        result.monthlyTargetCents === null
          ? 'Épargne cible supprimée'
          : `Épargne cible : ${formatCents(result.monthlyTargetCents)} par mois`,
      )
      onDone()
      await afterSavingsChanged(queryClient)
    },
    onError: (failure) => toast.error(savingsErrorMessage(failure)),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (error) return
    save.mutate(parseEurosToCents(amount))
  }

  const showError = submitted && error !== null
  return (
    <form noValidate onSubmit={submit} className="space-y-3">
      <Field data-invalid={showError}>
        <FieldLabel htmlFor={`${id}-target`}>Épargne cible par mois</FieldLabel>
        <AmountField
          groupClassName="max-w-48"
          id={`${id}-target`}
          placeholder="860"
          autoFocus
          value={amount}
          aria-invalid={showError}
          onValueChange={(typed) => setAmount(typed)}
        />
        {showError && <FieldError>{error}</FieldError>}
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          Enregistrer
        </Button>
        <Button
          type="button"
          size="sm"
          ghost
          onClick={onDone}
          disabled={save.isPending}
        >
          Annuler
        </Button>
        {target !== null && (
          <Button
            type="button"
            size="sm"
            ghost
            variant="danger"
            className="ml-auto"
            disabled={save.isPending}
            onClick={() => save.mutate(null)}
          >
            Supprimer la cible
          </Button>
        )}
      </div>
    </form>
  )
}
