import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from '@finances/ui'
import { useId, useState } from 'react'
import type { CorrectTransactionDto, TransactionDto } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import {
  signedCents,
  splitSignedCents,
} from '#/components/amount/signed-amount'
import type { AmountSign } from '#/components/amount/signed-amount'
import { MAX_AMOUNT_CENTS } from '#/components/expenses/amount-entry'
import { formatCalendarDate, formatCents } from '#/lib/money'

/**
 * Signed cents of a correction, typed unsigned with its sign beside it
 * (#326: the iOS decimal pad has no « - »), or an error.
 */
export function correctionCents(
  amount: string,
  sign: AmountSign,
): { cents: number } | { error: string } {
  if (amount.trim() === '') return { error: 'Indiquez un montant' }
  const cents = signedCents(amount, sign)
  if (cents === null) return { error: 'Montant invalide (ex. 12,50)' }
  if (cents === 0) return { error: 'Le montant ne peut pas être nul' }
  if (Math.abs(cents) > MAX_AMOUNT_CENTS) return { error: 'Montant trop élevé' }
  return { cents }
}

interface ImportedCorrectionProps {
  item: TransactionDto
  onCorrect: (body: CorrectTransactionDto) => void
  onRestore: () => void
  /** Back to the editor's list, nothing saved. */
  onCancel: () => void
}

/**
 * "Corriger le montant ou la date" of a bank row, on its own screen of the
 * editor (#280). The bank values stay shown and keep feeding balances and
 * later imports; one click puts them back.
 */
export function ImportedCorrection({
  item,
  onCorrect,
  onRestore,
  onCancel,
}: ImportedCorrectionProps) {
  const id = useId()
  // The transaction's own sign, kept unless « − » / « + » is pressed.
  const [amount, setAmount] = useState(
    () => splitSignedCents(item.amountCents).amount,
  )
  const [sign, setSign] = useState(
    () => splitSignedCents(item.amountCents).sign,
  )
  const [date, setDate] = useState(item.bookingDate)
  const [submitted, setSubmitted] = useState(false)
  const corrected =
    item.originalAmountCents !== null || item.originalBookingDate !== null
  const split = item.splits.length > 0

  const parsed = correctionCents(amount, sign)
  const amountError = 'error' in parsed ? parsed.error : null
  const dateError = date === '' ? 'Indiquez une date' : null

  return (
    <div className="space-y-3 text-sm">
      {corrected && (
        <div className="bg-muted/50 space-y-2 rounded-lg p-3">
          <p className="text-muted-foreground text-xs">
            Corrigée à la main. Banque :{' '}
            {formatCents(item.originalAmountCents ?? item.amountCents)} le{' '}
            {formatCalendarDate(item.originalBookingDate ?? item.bookingDate)}.
          </p>
          <Button
            type="button"
            size="sm"
            outline
            variant="secondary"
            onClick={onRestore}
          >
            Rétablir les valeurs de la banque
          </Button>
        </div>
      )}
      <form
        noValidate
        aria-label="Modifier une opération importée"
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (amountError || dateError || !('cents' in parsed)) return
          const body: CorrectTransactionDto = {}
          if (parsed.cents !== item.amountCents) body.amountCents = parsed.cents
          if (date !== item.bookingDate) body.bookingDate = date
          if (Object.keys(body).length > 0) onCorrect(body)
          else onCancel()
        }}
      >
        {/* The editor's screen says the bank values stay (#280). */}
        <Field data-invalid={submitted && amountError !== null}>
          <FieldLabel htmlFor={`${id}-amount`}>Montant corrigé</FieldLabel>
          <AmountField
            id={`${id}-amount`}
            value={amount}
            onValueChange={(typed, typedSign) => {
              setAmount(typed)
              if (typedSign) setSign(typedSign)
            }}
            sign={sign}
            onSignChange={setSign}
            disabled={split}
            aria-invalid={submitted && amountError !== null}
            aria-describedby={`${id}-amount-help`}
          />
          <FieldDescription id={`${id}-amount-help`}>
            {split
              ? 'Opération répartie : annulez la répartition pour changer son montant.'
              : sign === 'out'
                ? 'Sortie d’argent. Touchez « − » pour une entrée.'
                : 'Entrée d’argent. Touchez « + » pour une sortie.'}
          </FieldDescription>
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
            onClick={onCancel}
          >
            Annuler
          </Button>
          <Button type="submit" size="sm">
            Enregistrer la correction
          </Button>
        </div>
      </form>
    </div>
  )
}
