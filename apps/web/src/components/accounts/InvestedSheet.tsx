import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  SegmentedControl,
  SegmentedControlItem,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  AccountDto,
  AccountPerformanceDto,
  InvestedBaseDto,
} from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import { LARGE_AMOUNT_CENTS } from '#/components/amount/signed-amount'
import { afterHoldingsChanged } from '#/components/crypto/queries'
import {
  FORM_SHEET_FORM,
  FORM_SHEET_SIDE,
  FormSheetBody,
  FormSheetFooter,
  STEPPED_SHEET_BOTTOM,
} from '#/components/sheets/form-sheet'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { centsToInput, parseAmountToCents } from './amount'
import { todayInParis } from './dates'
import { accountErrorMessage } from './errors'
import { investedBaseOf } from './invested'
import { clearInvestedBase, setInvestedBase } from './queries'

type Step = 'amount' | 'day'
type DayChoice = 'value' | 'today' | 'other'

const STEP_NAMES: Record<Step, string> = {
  amount: 'Montant investi',
  day: 'Date',
}

/**
 * « Renseigner / Modifier le montant investi » (#360), from the account's
 * summary, in two steps: the amount, then the day it was right (the latest
 * value's, today or another). Saved as the account's invested base: what is
 * linked to the account after that day adds on top. A PEA, a life insurance
 * or employee savings only: a crypto account's cost follows its coins (#373). Every change offers « Annuler ».
 */
export function InvestedSheet({
  open,
  onOpenChange,
  account,
  performance,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: AccountDto
  performance: Pick<AccountPerformanceDto, 'contributionsCents' | 'valueDate'>
}) {
  const isMobile = useIsMobile()
  const id = useId()
  const queryClient = useQueryClient()
  const today = todayInParis()
  const current = investedBaseOf(account)
  // The latest value's day, when it is not today: the day a statement gives.
  const valueDay =
    performance.valueDate && performance.valueDate < today
      ? performance.valueDate
      : null

  const [step, setStep] = useState<Step>('amount')
  const [amount, setAmount] = useState('')
  const [choice, setChoice] = useState<DayChoice>('today')
  const [other, setOther] = useState(today)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)

  // Each opening starts over from what is known.
  useEffect(() => {
    if (!open) return
    setStep('amount')
    const known = current?.amountCents ?? performance.contributionsCents
    setAmount(known === null ? '' : centsToInput(known))
    const day = current?.on ?? valueDay ?? today
    setChoice(day === valueDay ? 'value' : day === today ? 'today' : 'other')
    setOther(day)
    // Only when it opens.
  }, [open])

  const cents = parseAmountToCents(amount)
  const amountError =
    amount.trim() === '' ? 'empty' : cents === null ? 'Montant invalide.' : null
  const on =
    choice === 'value' && valueDay
      ? valueDay
      : choice === 'today'
        ? today
        : other
  const dayError =
    on === ''
      ? 'Indiquez la date.'
      : on > today
        ? 'La date ne peut pas être dans le futur.'
        : null

  // A phone starts each step on its heading (no keyboard popping up);
  // elsewhere on its field so typing goes straight to it.
  function focusStep() {
    const field = isMobile
      ? null
      : fieldRef.current?.querySelector<HTMLElement>('input')
    ;(field ?? headingRef.current)?.focus({ preventScroll: true })
  }
  useEffect(() => {
    if (open) focusStep()
  }, [open, step])

  /** Puts `base` back (« Annuler »). */
  const restore = (base: InvestedBaseDto | null) =>
    base ? setInvestedBase(account.id, base) : clearInvestedBase(account.id)

  const save = useMutation({
    mutationFn: (base: InvestedBaseDto | null) => restore(base),
    onSuccess: async (_figures, base) => {
      onOpenChange(false)
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
    if (step === 'amount') {
      if (amountError === null) setStep('day')
      return
    }
    if (amountError !== null || dayError !== null || save.isPending) return
    save.mutate({ amountCents: cents!, on })
  }

  const title = current
    ? 'Modifier le montant investi'
    : 'Renseigner le montant investi'
  const stepIndex = step === 'amount' ? 0 : 1

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? STEPPED_SHEET_BOTTOM : FORM_SHEET_SIDE}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          focusStep()
        }}
      >
        <form noValidate onSubmit={submit} className={FORM_SHEET_FORM}>
          <SheetTitle className="sr-only">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            {account.name}
          </SheetDescription>

          {/* Where we are, and the way back; clear of the close button. */}
          <div className="flex min-h-14 shrink-0 items-center gap-1 py-2 pr-12 pl-2">
            {step === 'day' ? (
              <Button
                type="button"
                ghost
                variant="secondary"
                onClick={() => setStep('amount')}
              >
                <ChevronLeftIcon aria-hidden />
                Retour
              </Button>
            ) : (
              <span className="w-2" />
            )}
            <h3
              ref={headingRef}
              tabIndex={-1}
              className="min-w-0 flex-1 truncate text-base font-semibold outline-none"
            >
              {STEP_NAMES[step]}
              <span className="text-muted-foreground ml-1.5 text-sm font-normal">
                {stepIndex + 1}/2
              </span>
            </h3>
          </div>

          <FormSheetBody ref={fieldRef}>
            {step === 'amount' ? (
              <Field
                data-invalid={amountError !== null && amountError !== 'empty'}
              >
                <FieldLabel htmlFor={`${id}-amount`}>
                  Montant investi
                </FieldLabel>
                <AmountField
                  id={`${id}-amount`}
                  maxCents={LARGE_AMOUNT_CENTS}
                  placeholder="10 000"
                  value={amount}
                  aria-invalid={amountError !== null && amountError !== 'empty'}
                  onValueChange={(typed) => setAmount(typed)}
                />
                {amountError !== null && amountError !== 'empty' ? (
                  <FieldError>{amountError}</FieldError>
                ) : (
                  <FieldDescription>
                    Le total versé moins les retraits : « versements nets » ou «
                    cumul des versements » sur un relevé. Les virements liés
                    ensuite s’y ajoutent.
                  </FieldDescription>
                )}
              </Field>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">
                  Le jour où ce montant était juste
                  {valueDay ? ', par exemple celui de la dernière valeur' : ''}.
                </p>
                <SegmentedControl
                  aria-label="Date"
                  value={choice}
                  onValueChange={setChoice}
                  fullWidth
                >
                  {valueDay && (
                    <SegmentedControlItem
                      value="value"
                      aria-label={`Dernière valeur, ${formatCalendarDate(valueDay)}`}
                    >
                      {formatShortDay(valueDay, today.slice(0, 4))}
                    </SegmentedControlItem>
                  )}
                  <SegmentedControlItem value="today">
                    Aujourd’hui
                  </SegmentedControlItem>
                  <SegmentedControlItem value="other">
                    Autre
                  </SegmentedControlItem>
                </SegmentedControl>
                {choice === 'other' && (
                  <Field data-invalid={dayError !== null}>
                    <FieldLabel htmlFor={`${id}-on`}>Investi au</FieldLabel>
                    <Input
                      id={`${id}-on`}
                      type="date"
                      max={today}
                      value={other}
                      aria-invalid={dayError !== null}
                      onChange={(event) => setOther(event.target.value)}
                    />
                    {dayError && <FieldError>{dayError}</FieldError>}
                  </Field>
                )}
                {cents !== null && dayError === null && (
                  <p className="bg-muted/50 rounded-lg p-3 text-sm">
                    Investi{' '}
                    <strong className="tabular-nums">
                      {formatCents(cents)}
                    </strong>{' '}
                    au {formatCalendarDate(on)}, puis les virements liés depuis.
                  </p>
                )}
              </>
            )}
          </FormSheetBody>

          <FormSheetFooter>
            {step === 'amount' && current && (
              <Button
                type="button"
                variant="danger"
                outline
                className="min-h-11"
                disabled={save.isPending}
                onClick={() => save.mutate(null)}
              >
                Retirer
              </Button>
            )}
            <Button
              type="submit"
              className="min-h-11 flex-1 font-medium"
              disabled={
                step === 'amount'
                  ? amountError !== null
                  : amountError !== null || dayError !== null
              }
              loading={step === 'day' && save.isPending}
            >
              {step === 'day' ? (
                'Enregistrer'
              ) : (
                <>
                  Suivant
                  <ChevronRightIcon aria-hidden />
                </>
              )}
            </Button>
          </FormSheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
