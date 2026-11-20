import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import type { AccountDto, InvestedBaseDto } from '#/api/types.gen'
import { centsToInput, parseAmountToCents } from '#/components/accounts/amount'
import { todayInParis } from '#/components/accounts/dates'
import { accountErrorMessage } from '#/components/accounts/errors'
import {
  clearInvestedBase,
  setInvestedBase,
} from '#/components/accounts/queries'
import { LARGE_AMOUNT_CENTS } from '#/components/amount/signed-amount'
import { AmountField } from '#/components/amount/AmountField'
import {
  FORM_SHEET_FORM,
  FormSheetBody,
  FormSheetFooter,
} from '#/components/sheets/form-sheet'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { afterHoldingsChanged } from './queries'

/** The account's invested base, when it has one. */
export function investedBaseOf(
  account: Pick<AccountDto, 'investedBaseCents' | 'investedBaseOn'>,
): InvestedBaseDto | null {
  return account.investedBaseCents === null || account.investedBaseOn === null
    ? null
    : { amountCents: account.investedBaseCents, on: account.investedBaseOn }
}

/** « 5 000,00 € investis jusqu’au 30 juin 2026 ». */
export function investedBaseText(base: InvestedBaseDto): string {
  return `${formatCents(base.amountCents)} investis jusqu’au ${formatCalendarDate(base.on)}`
}

/** A wallet or manual crypto account: the only ones with a base (#358). */
export function takesInvestedBase(
  account: Pick<AccountDto, 'type' | 'cryptoSource' | 'archivedAt'>,
): boolean {
  return (
    account.type === 'crypto' &&
    account.cryptoSource !== 'exchange' &&
    account.archivedAt === null
  )
}

interface Errors {
  amount?: string
  on?: string
}

function validate(amount: string, on: string, today: string): Errors {
  const errors: Errors = {}
  if (amount.trim() === '') errors.amount = 'Indiquez le montant investi.'
  else if (parseAmountToCents(amount) === null)
    errors.amount = 'Montant invalide.'
  if (on === '') errors.on = 'Indiquez la date.'
  else if (on > today) errors.on = 'La date ne peut pas être dans le futur.'
  return errors
}

/**
 * « Modifier le montant investi » (#358), a screen of the account editor: what
 * the coins of a wallet or manual crypto account cost, up to a day. The coins
 * sent to it from a followed platform after that day add their cost, and the
 * page shows « Investi … · plus-value … » like a PEA. Every change offers
 * « Annuler ».
 */
export function InvestedBaseScreen({
  account,
  onBack,
  onDone,
}: {
  account: AccountDto
  onBack: () => void
  /** The base was saved or removed (closes the editor). */
  onDone: () => void
}) {
  const id = useId()
  const queryClient = useQueryClient()
  const today = todayInParis()
  const current = investedBaseOf(account)
  const [amount, setAmount] = useState(
    current ? centsToInput(current.amountCents) : '',
  )
  const [on, setOn] = useState(current?.on ?? today)
  const errors = validate(amount, on, today)
  const valid = Object.keys(errors).length === 0
  // Shown as soon as something is typed; the button stays greyed out.
  const shown: Errors = {
    ...(amount.trim() !== '' && { amount: errors.amount }),
    on: errors.on,
  }

  /** Puts `base` back (« Annuler »). */
  const restore = (base: InvestedBaseDto | null) =>
    base ? setInvestedBase(account.id, base) : clearInvestedBase(account.id)

  const save = useMutation({
    mutationFn: (base: InvestedBaseDto | null) => restore(base),
    onSuccess: async (_figures, base) => {
      onDone()
      toast.success(
        base ? 'Montant investi enregistré' : 'Montant investi retiré',
        {
          action: {
            label: 'Annuler',
            onClick: () => {
              void restore(current)
                .then(() => afterHoldingsChanged(queryClient))
                .catch((error: unknown) =>
                  toast.error(accountErrorMessage(error)),
                )
            },
          },
        },
      )
      await afterHoldingsChanged(queryClient)
    },
    onError: (error) => toast.error(accountErrorMessage(error)),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid || save.isPending) return
    save.mutate({ amountCents: parseAmountToCents(amount)!, on })
  }

  return (
    <form noValidate onSubmit={submit} className={FORM_SHEET_FORM}>
      <FormSheetBody>
        <p className="text-muted-foreground text-sm">
          Ce que vous avez payé pour les cryptos de ce compte, frais compris,
          jusqu’à une date. Les cryptos qu’il reçoit ensuite d’une plateforme
          suivie y ajoutent leur coût.
        </p>
        <Field data-invalid={shown.amount !== undefined}>
          <FieldLabel htmlFor={`${id}-amount`}>Montant investi</FieldLabel>
          <AmountField
            id={`${id}-amount`}
            maxCents={LARGE_AMOUNT_CENTS}
            placeholder="5 000"
            value={amount}
            aria-invalid={shown.amount !== undefined}
            onValueChange={(typed) => setAmount(typed)}
          />
          {shown.amount ? (
            <FieldError>{shown.amount}</FieldError>
          ) : (
            <FieldDescription>
              Le total de vos achats, d’après votre suivi ou vos relevés.
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={shown.on !== undefined}>
          <FieldLabel htmlFor={`${id}-on`}>Investi jusqu’au</FieldLabel>
          <Input
            id={`${id}-on`}
            type="date"
            max={today}
            value={on}
            aria-invalid={shown.on !== undefined}
            onChange={(event) => setOn(event.target.value)}
          />
          {shown.on ? (
            <FieldError>{shown.on}</FieldError>
          ) : (
            <FieldDescription>
              Le dernier jour que ce montant couvre.
            </FieldDescription>
          )}
        </Field>
        {current && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-muted-foreground text-sm">
              Actuellement : {investedBaseText(current)}.
            </p>
            <Button
              type="button"
              variant="danger"
              outline
              className="w-full"
              disabled={save.isPending}
              onClick={() => save.mutate(null)}
            >
              Retirer le montant investi
            </Button>
          </div>
        )}
      </FormSheetBody>
      <FormSheetFooter className="flex-row-reverse flex-wrap">
        <Button
          type="submit"
          className="min-h-11 grow-[2] font-medium"
          disabled={!valid}
          loading={save.isPending}
        >
          Enregistrer
        </Button>
        <Button
          type="button"
          variant="secondary"
          outline
          className="min-h-11 grow"
          disabled={save.isPending}
          onClick={onBack}
        >
          Retour
        </Button>
      </FormSheetFooter>
    </form>
  )
}
