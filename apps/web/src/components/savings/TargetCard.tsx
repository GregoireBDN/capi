import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleCheckIcon, PencilIcon, TargetIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import type { SavingsOverviewDto } from '#/api/types.gen'
import {
  centsToInput,
  parseEurosToCents,
  targetError,
} from '#/components/budget/amount'
import { formatMonth } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { savingsErrorMessage } from './errors'
import { afterSavingsChanged, saveTarget } from './queries'
import { SavingsMeter } from './SavingsMeter'

/**
 * The monthly savings target ("Épargne cible") against this month's net
 * savings, how many recent full months reached it, and the target itself,
 * edited in place.
 */
export function TargetCard({ overview }: { overview: SavingsOverviewDto }) {
  const target = overview.monthlyTargetCents
  const [editing, setEditing] = useState(false)

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Épargne cible</CardTitle>
        <CardDescription>
          {target === null
            ? 'Combien vous voulez mettre de côté chaque mois.'
            : `${formatCents(target)} par mois`}
        </CardDescription>
        {!editing && target !== null && (
          <CardAction>
            <Button
              ghost
              size="sm"
              onClick={() => setEditing(true)}
              aria-label="Modifier l’épargne cible"
            >
              <PencilIcon aria-hidden />
              Modifier
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <TargetForm target={target} onDone={() => setEditing(false)} />
        ) : target === null ? (
          <Button outline variant="secondary" onClick={() => setEditing(true)}>
            <TargetIcon aria-hidden />
            Définir une cible
          </Button>
        ) : (
          <TargetProgress overview={overview} target={target} />
        )}
      </CardContent>
    </Card>
  )
}

function TargetProgress({
  overview,
  target,
}: {
  overview: SavingsOverviewDto
  target: number
}) {
  const current = overview.months.at(-1)!
  const gap = current.netCents - target
  // Last 6 full months (fewer when the history is shorter).
  const recent = overview.months.filter((m) => m.complete).slice(-6)
  const reachedCount = recent.filter((m) => m.netCents >= target).length

  return (
    <>
      <div className="space-y-1.5">
        <SavingsMeter
          name={`${formatMonth(current.month)} (en cours)`}
          valueCents={current.netCents}
          targetCents={target}
        />
        <p className="text-muted-foreground flex items-center gap-1 text-xs">
          {gap >= 0 ? (
            <>
              <CircleCheckIcon
                aria-hidden
                className="text-chart-delta-good size-3.5 shrink-0"
              />
              <span>
                Cible atteinte : {formatCents(current.netCents)} épargnés
                {gap > 0 && ` (+${formatCents(gap)})`}
              </span>
            </>
          ) : (
            <span>Reste {formatCents(-gap)} à épargner ce mois-ci</span>
          )}
        </p>
      </div>
      {recent.length > 0 && (
        <p className="text-sm">
          Cible atteinte{' '}
          <span className="font-medium tabular-nums">
            {reachedCount} mois sur {recent.length}
          </span>{' '}
          <span className="text-muted-foreground">
            (derniers mois complets)
          </span>
        </p>
      )}
    </>
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
        <InputGroup className="max-w-48">
          <InputGroupInput
            id={`${id}-target`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="860"
            autoFocus
            value={amount}
            aria-invalid={showError}
            onChange={(event) => setAmount(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>€</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
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
