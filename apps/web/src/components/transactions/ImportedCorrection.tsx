import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@finances/ui'
import { useId, useState } from 'react'
import type { CorrectTransactionDto, TransactionDto } from '#/api/types.gen'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { formatCalendarDate, formatCents } from '#/lib/money'

/** Highest amount the API accepts (1 000 000 €). */
const MAX_CENTS = 100_000_000

/**
 * Signed cents typed for a correction ("-12,50" or "12,50"), or an error.
 * A leading minus is money out, like the bank's.
 */
export function parseSignedCents(
  text: string,
): { cents: number } | { error: string } {
  const trimmed = text.trim().replace(/^[−–]/, '-')
  if (trimmed === '') return { error: 'Indiquez un montant' }
  const negative = trimmed.startsWith('-')
  const cents = parseEurosToCents(negative ? trimmed.slice(1) : trimmed)
  if (cents === null) return { error: 'Montant invalide (ex. -12,50)' }
  if (cents === 0) return { error: 'Le montant ne peut pas être nul' }
  if (cents > MAX_CENTS) return { error: 'Montant trop élevé' }
  return { cents: negative ? -cents : cents }
}

interface ImportedCorrectionProps {
  item: TransactionDto
  onCorrect: (body: CorrectTransactionDto) => void
  onRestore: () => void
}

/**
 * "Modifier une opération importée": the amount and date of a bank row can
 * be corrected on purpose, behind a button. The bank values stay shown and
 * keep feeding balances and later imports; one click puts them back.
 */
export function ImportedCorrection({
  item,
  onCorrect,
  onRestore,
}: ImportedCorrectionProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const corrected =
    item.originalAmountCents !== null || item.originalBookingDate !== null
  const split = item.splits.length > 0

  const parsed = parseSignedCents(amount)
  const amountError = 'error' in parsed ? parsed.error : null
  const dateError = date === '' ? 'Indiquez une date' : null

  function start() {
    setAmount(
      `${item.amountCents < 0 ? '-' : ''}${centsToInput(Math.abs(item.amountCents))}`,
    )
    setDate(item.bookingDate)
    setSubmitted(false)
    setOpen(true)
  }

  return (
    <div className="bg-muted/50 space-y-2 rounded-lg p-3 text-sm">
      {corrected && (
        <p className="text-muted-foreground text-xs">
          Corrigée à la main. Banque :{' '}
          {formatCents(item.originalAmountCents ?? item.amountCents)} le{' '}
          {formatCalendarDate(item.originalBookingDate ?? item.bookingDate)}.
        </p>
      )}
      {open ? (
        <form
          noValidate
          aria-label="Modifier une opération importée"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
            if (amountError || dateError || !('cents' in parsed)) return
            const body: CorrectTransactionDto = {}
            if (parsed.cents !== item.amountCents)
              body.amountCents = parsed.cents
            if (date !== item.bookingDate) body.bookingDate = date
            setOpen(false)
            if (Object.keys(body).length > 0) onCorrect(body)
          }}
        >
          <p className="text-muted-foreground text-xs">
            Le solde du compte et les prochains imports gardent les valeurs de
            la banque.
          </p>
          <Field data-invalid={submitted && amountError !== null}>
            <FieldLabel htmlFor={`${id}-amount`}>Montant corrigé</FieldLabel>
            <InputGroup>
              <InputGroupInput
                id={`${id}-amount`}
                inputMode="text"
                autoComplete="off"
                value={amount}
                disabled={split}
                aria-invalid={submitted && amountError !== null}
                onChange={(event) => setAmount(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupText>€</InputGroupText>
              </InputGroupAddon>
            </InputGroup>
            {split && (
              <p className="text-muted-foreground text-xs">
                Opération répartie : annulez la répartition pour changer son
                montant.
              </p>
            )}
            {submitted && amountError && <FieldError>{amountError}</FieldError>}
          </Field>
          <Field data-invalid={submitted && dateError !== null}>
            <FieldLabel htmlFor={`${id}-date`}>Date corrigée</FieldLabel>
            <Input
              id={`${id}-date`}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            {submitted && dateError && <FieldError>{dateError}</FieldError>}
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              ghost
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Annuler
            </Button>
            <Button type="submit" size="sm">
              Enregistrer la correction
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            outline
            variant="secondary"
            onClick={start}
          >
            Modifier une opération importée
          </Button>
          {corrected && (
            <Button
              type="button"
              size="sm"
              ghost
              variant="secondary"
              onClick={onRestore}
            >
              Rétablir les valeurs de la banque
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
