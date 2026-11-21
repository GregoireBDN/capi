import { Button, Field, FieldError, FieldLabel } from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { AmountField } from '#/components/amount/AmountField'
import {
  centsToInput,
  parseEurosToCents,
  targetError,
} from '#/components/budget/amount'
import { formatCents } from '#/lib/money'
import { savingsErrorMessage } from './errors'
import { afterSavingsChanged, saveTarget } from './queries'

/**
 * The monthly savings target (« Cible »), edited in place in the month's
 * card: the amount, « Enregistrer », « Annuler », « Supprimer la cible ».
 */
export function TargetForm({
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
          ? 'Cible supprimée'
          : `Cible : ${formatCents(result.monthlyTargetCents)} par mois`,
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
        <FieldLabel htmlFor={`${id}-target`}>Cible par mois</FieldLabel>
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
