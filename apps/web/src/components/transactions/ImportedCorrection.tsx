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
  // Errors show once a field was changed; « Enregistrer » waits for both.
  const [touched, setTouched] = useState({ amount: false, date: false })
  const corrected =
    item.originalAmountCents !== null || item.originalBookingDate !== null
  const split = item.splits.length > 0

  const parsed = correctionCents(amount, sign)
  const amountError = 'error' in parsed ? parsed.error : null
  const dateError = date === '' ? 'Indiquez une date' : null
  const showAmountError = touched.amount && amountError !== null
  const showDateError = touched.date && dateError !== null

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
          if (amountError || dateError || !('cents' in parsed)) return
          const body: CorrectTransactionDto = {}
          if (parsed.cents !== item.amountCents) body.amountCents = parsed.cents
          if (date !== item.bookingDate) body.bookingDate = date
          if (Object.keys(body).length > 0) onCorrect(body)
          else onCancel()
        }}
      >
        {/* The editor's screen says the bank values stay (#280). */}
        <Field>
          <FieldLabel htmlFor={`${id}-amount`}>Montant corrigé</FieldLabel>
          <AmountField
            id={`${id}-amount`}
            value={amount}
            onValueChange={(typed, typedSign) => {
              setAmount(typed)
              if (typedSign) setSign(typedSign)
              setTouched((current) => ({ ...current, amount: true }))
            }}
            sign={sign}
            onSignChange={setSign}
            disabled={split}
            aria-invalid={showAmountError}
            aria-describedby={`${id}-amount-help`}
          />
          {/* The error takes the help line's place, never both. */}
          {showAmountError ? (
            <FieldError id={`${id}-amount-help`}>{amountError}</FieldError>
          ) : (
            <FieldDescription id={`${id}-amount-help`}>
              {split
                ? 'Opération répartie : annulez la répartition pour changer son montant.'
                : sign === 'out'
                  ? 'Sortie d’argent'
                  : 'Entrée d’argent'}
            </FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-date`}>Date corrigée</FieldLabel>
          <Input
            id={`${id}-date`}
            type="date"
            value={date}
            aria-invalid={showDateError}
            onChange={(event) => {
              setDate(event.target.value)
              setTouched((current) => ({ ...current, date: true }))
            }}
          />
          {showDateError && <FieldError>{dateError}</FieldError>}
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
          <Button
            type="submit"
            size="sm"
            disabled={amountError !== null || dateError !== null}
          >
            Enregistrer
          </Button>
        </div>
      </form>
    </div>
  )
}
