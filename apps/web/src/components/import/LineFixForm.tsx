import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Field, FieldError, FieldLabel, Input } from '@capi/ui'
import { CheckIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { importsControllerFixLine } from '#/api'
import type { ImportDetailDto } from '#/api'
import { AmountField } from '#/components/amount/AmountField'
import {
  LARGE_AMOUNT_CENTS,
  signedCents,
  splitSignedCents,
} from '#/components/amount/signed-amount'
import type { AmountSign } from '#/components/amount/signed-amount'
import { importKeys, unwrap } from './api'
import { fixLineErrorMessage } from './errors'

/** The values a line starts from: what the file gave, or what was typed. */
export interface LineValues {
  bookingDate: string | null
  valueDate: string | null
  amountCents: number | null
  balanceAfterCents: number | null
  rawLabel: string | null
}

interface LineFixFormProps {
  importId: string
  lineNumber: number
  initial: LineValues | null
  onFixed: (detail: ImportDetailDto) => void
  /** Without it, the form has no « Annuler » (it is always open). */
  onCancel?: () => void
}

/** Longest label (mirrors `FIXED_LABEL_MAX`). */
const LABEL_MAX = 500

function signedText(
  cents: number | null,
  emptySign: AmountSign,
): { amount: string; sign: AmountSign } {
  return cents === null
    ? { amount: '', sign: emptySign }
    : splitSignedCents(cents)
}

/**
 * Types an unreadable line of the file in place (#433): its date, amount,
 * label and, when the file has one, its balance. Sent to the API, which
 * checks the line with the whole file again (dedupe, balances, rules); the
 * line then shows its new status. Nothing is imported before « Valider ».
 */
export function LineFixForm({
  importId,
  lineNumber,
  initial,
  onFixed,
  onCancel,
}: LineFixFormProps) {
  const id = useId()
  const queryClient = useQueryClient()
  const [date, setDate] = useState(initial?.bookingDate ?? '')
  const [label, setLabel] = useState(initial?.rawLabel ?? '')
  const [amount, setAmount] = useState(() =>
    signedText(initial?.amountCents ?? null, 'out'),
  )
  const [balance, setBalance] = useState(() =>
    signedText(initial?.balanceAfterCents ?? null, 'in'),
  )
  const [submitted, setSubmitted] = useState(false)

  const amountCents = signedCents(amount.amount, amount.sign)
  const balanceCents =
    balance.amount === '' ? null : signedCents(balance.amount, balance.sign)
  const errors = {
    date: date === '' ? 'Indiquez la date.' : null,
    amount:
      amount.amount === '' || amountCents === null
        ? 'Indiquez le montant.'
        : null,
    label: label.trim() === '' ? 'Indiquez le libellé.' : null,
  }
  const invalid = Object.values(errors).some((error) => error !== null)

  const fix = useMutation({
    mutationFn: () =>
      unwrap(
        importsControllerFixLine({
          path: { id: importId, lineNumber },
          body: {
            bookingDate: date,
            valueDate: initial?.valueDate ?? null,
            amountCents: amountCents!,
            balanceAfterCents: balanceCents,
            rawLabel: label.trim(),
          },
          throwOnError: false,
        }),
      ),
    onSuccess: (detail) => {
      void queryClient.invalidateQueries({ queryKey: importKeys.imports })
      onFixed(detail)
    },
  })

  const shown = (error: string | null) => (submitted ? error : null)

  return (
    <form
      aria-label={`Corriger la ligne ${lineNumber}`}
      className="@container space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        setSubmitted(true)
        if (!invalid) fix.mutate()
      }}
    >
      <div className="grid gap-3 @min-[17rem]:grid-cols-2">
        <Field data-invalid={shown(errors.date) !== null}>
          <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            aria-invalid={shown(errors.date) !== null}
            disabled={fix.isPending}
            onChange={(event) => setDate(event.target.value)}
          />
          {shown(errors.date) && <FieldError>{errors.date}</FieldError>}
        </Field>
        <Field data-invalid={shown(errors.amount) !== null}>
          <FieldLabel htmlFor={`${id}-amount`}>Montant</FieldLabel>
          <AmountField
            id={`${id}-amount`}
            value={amount.amount}
            sign={amount.sign}
            maxCents={LARGE_AMOUNT_CENTS}
            aria-invalid={shown(errors.amount) !== null}
            disabled={fix.isPending}
            onValueChange={(typed, typedSign) =>
              setAmount((current) => ({
                amount: typed,
                sign: typedSign ?? current.sign,
              }))
            }
            onSignChange={(sign) =>
              setAmount((current) => ({ ...current, sign }))
            }
          />
          {shown(errors.amount) && <FieldError>{errors.amount}</FieldError>}
        </Field>
        <Field
          data-invalid={shown(errors.label) !== null}
          className="@min-[17rem]:col-span-2"
        >
          <FieldLabel htmlFor={`${id}-label`}>Libellé</FieldLabel>
          <Input
            id={`${id}-label`}
            value={label}
            maxLength={LABEL_MAX}
            aria-invalid={shown(errors.label) !== null}
            disabled={fix.isPending}
            onChange={(event) => setLabel(event.target.value)}
          />
          {shown(errors.label) && <FieldError>{errors.label}</FieldError>}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-balance`}>Solde (facultatif)</FieldLabel>
          <AmountField
            id={`${id}-balance`}
            value={balance.amount}
            sign={balance.sign}
            maxCents={LARGE_AMOUNT_CENTS}
            disabled={fix.isPending}
            onValueChange={(typed, typedSign) =>
              setBalance((current) => ({
                amount: typed,
                sign: typedSign ?? current.sign,
              }))
            }
            onSignChange={(sign) =>
              setBalance((current) => ({ ...current, sign }))
            }
          />
        </Field>
      </div>
      {fix.isError && <FieldError>{fixLineErrorMessage(fix.error)}</FieldError>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            outline
            className="min-w-0"
            disabled={fix.isPending}
            onClick={onCancel}
          >
            Annuler
          </Button>
        )}
        <Button type="submit" className="min-w-0" loading={fix.isPending}>
          <CheckIcon />
          Vérifier
        </Button>
      </div>
    </form>
  )
}
