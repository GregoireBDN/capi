import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { PositionLineDto } from '#/api/types.gen'
import { centsToInput, parseAmountToCents } from '#/components/accounts/amount'
import { AmountField } from '#/components/amount/AmountField'
import { LARGE_AMOUNT_CENTS } from '#/components/amount/signed-amount'
import {
  decimalToInput,
  formatPrice,
  parsePriceInput,
} from '#/components/crypto/format'
import {
  editorSide,
  FORM_SHEET_FORM,
  FORM_SHEET_SCREEN,
  FORM_SHEET_SIDE,
  FormSheetBody,
} from '#/components/sheets/form-sheet'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { shortName } from './lines'
import { afterPositionsChanged, setCash, setPrice } from './queries'

/** The price of one security on a day, typed by hand (« manuel »). */
export function PriceSheet({
  open,
  onOpenChange,
  line,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  line: PositionLineDto | null
  today: string
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [price, setPriceText] = useState('')
  const [day, setDay] = useState(today)

  useEffect(() => {
    if (!open) return
    setPriceText(line?.priceEur ? decimalToInput(line.priceEur) : '')
    setDay(today)
  }, [open, line, today])

  const parsed = parsePriceInput(price)
  const priceError =
    price.trim() !== '' && (parsed === null || !/[1-9]/.test(parsed))
      ? 'Cours invalide (ex. 498,32)'
      : undefined
  const dayError = day > today ? 'Pas de cours dans le futur' : undefined
  const valid =
    parsed !== null && /[1-9]/.test(parsed) && !dayError && day !== ''

  const save = useMutation({
    mutationFn: () => setPrice(line!.isin, day, parsed!),
    onSuccess: async () => {
      toast.success(
        `${shortName(line!.name)} : ${formatPrice(parsed!)} au ${formatCalendarDate(day)}`,
      )
      onOpenChange(false)
      await afterPositionsChanged(queryClient)
    },
    onError: () => toast.error('Impossible d’enregistrer le cours.'),
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
      >
        <SheetBar
          title={line ? `Cours de ${shortName(line.name)}` : 'Cours'}
          description="Le cours d’une part en euros, d’après votre espace client ou un site de bourse."
          action={
            <SheetBarAction
              type="submit"
              form={`${id}-form`}
              label="Enregistrer"
              loading={save.isPending}
              disabled={!valid}
            />
          }
        />
        <form
          id={`${id}-form`}
          noValidate
          className={FORM_SHEET_FORM}
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) save.mutate()
          }}
        >
          <FormSheetBody>
            <Field data-invalid={priceError !== undefined}>
              <FieldLabel htmlFor={`${id}-price`}>Cours</FieldLabel>
              <Input
                id={`${id}-price`}
                inputMode="decimal"
                autoComplete="off"
                placeholder="498,32"
                value={price}
                aria-invalid={priceError !== undefined}
                onChange={(event) => setPriceText(event.target.value)}
              />
              {priceError ? (
                <FieldError>{priceError}</FieldError>
              ) : (
                <FieldDescription>En euros, par part.</FieldDescription>
              )}
            </Field>
            <Field data-invalid={dayError !== undefined}>
              <FieldLabel htmlFor={`${id}-day`}>Date</FieldLabel>
              <Input
                id={`${id}-day`}
                type="date"
                max={today}
                value={day}
                aria-invalid={dayError !== undefined}
                onChange={(event) => setDay(event.target.value)}
              />
              {dayError && <FieldError>{dayError}</FieldError>}
            </Field>
          </FormSheetBody>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** « Liquidités » as of today. */
export function CashSheet({
  open,
  onOpenChange,
  accountId,
  cashCents,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  cashCents: number
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [text, setText] = useState('')

  useEffect(() => {
    if (open) setText(centsToInput(cashCents))
  }, [open, cashCents])

  const cents = parseAmountToCents(text)
  const valid = cents !== null && cents >= 0

  const save = useMutation({
    mutationFn: () => setCash(accountId, cents!),
    onSuccess: async (saved) => {
      toast.success(`Liquidités : ${formatCents(saved.cashCents)}`)
      onOpenChange(false)
      await afterPositionsChanged(queryClient)
    },
    onError: () => toast.error('Impossible d’enregistrer les liquidités.'),
  })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
      >
        <SheetBar
          title="Liquidités"
          description="L’argent du compte qui n’est pas investi, aujourd’hui."
          action={
            <SheetBarAction
              type="submit"
              form={`${id}-form`}
              label="Enregistrer"
              loading={save.isPending}
              disabled={!valid}
            />
          }
        />
        <form
          id={`${id}-form`}
          noValidate
          className={FORM_SHEET_FORM}
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) save.mutate()
          }}
        >
          <FormSheetBody>
            <Field>
              <FieldLabel htmlFor={`${id}-cash`}>Montant</FieldLabel>
              <AmountField
                id={`${id}-cash`}
                maxCents={LARGE_AMOUNT_CENTS}
                placeholder="0,00"
                value={text}
                onValueChange={(typed) => setText(typed)}
              />
            </Field>
          </FormSheetBody>
        </form>
      </SheetContent>
    </Sheet>
  )
}
