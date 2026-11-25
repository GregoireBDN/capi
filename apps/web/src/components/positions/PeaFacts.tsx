import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  useIsMobile,
} from '@capi/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { AccountDto } from '#/api/types.gen'
import {
  afterAccountsChanged,
  updateAccount,
} from '#/components/accounts/queries'
import {
  editorSide,
  FORM_SHEET_FORM,
  FORM_SHEET_SCREEN,
  FORM_SHEET_SIDE,
  FormSheetBody,
  FormSheetMoreActions,
} from '#/components/sheets/form-sheet'
import { addMonths } from '#/components/subscriptions/format'
import { formatCalendarDate, formatWholeEuros } from '#/lib/money'

/** What can be paid into a PEA (its ceiling); the app says « Investi ». */
export const PEA_CEILING_CENTS = 15_000_000

/** The day a PEA is 5 years old: from then on, withdrawals keep it open. */
export function fiveYearsOn(openedOn: string): string {
  return addMonths(openedOn, 60)
}

const dayNumber = (date: string) =>
  Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  ) / 86_400_000

/** The share of the 5 years gone on `today`, 0 to 1. */
export function timeElapsed(opened: string, mark: string, today: string) {
  const total = dayNumber(mark) - dayNumber(opened)
  if (total <= 0) return 1
  return Math.min(
    1,
    Math.max(0, (dayNumber(today) - dayNumber(opened)) / total),
  )
}

/** « Encore 1 an et 4 mois », « Encore 12 jours », « Atteints ». */
export function timeLeftText(today: string, mark: string): string {
  if (mark <= today) return 'Atteints'
  let months =
    (Number(mark.slice(0, 4)) - Number(today.slice(0, 4))) * 12 +
    Number(mark.slice(5, 7)) -
    Number(today.slice(5, 7))
  if (Number(mark.slice(8, 10)) < Number(today.slice(8, 10))) months -= 1
  if (months <= 0) {
    const days = dayNumber(mark) - dayNumber(today)
    return `Encore ${days} jour${days > 1 ? 's' : ''}`
  }
  const years = Math.floor(months / 12)
  const rest = months % 12
  const parts = [
    years > 0 && `${years} an${years > 1 ? 's' : ''}`,
    rest > 0 && `${rest} mois`,
  ].filter(Boolean)
  return `Encore ${parts.join(' et ')}`
}

/**
 * A PEA's own facts (ADR 0006 § 7), at the end of its summary (#413, A):
 * what was invested (its invested amount, #370) against the ceiling, and the
 * 5-year date from its opening day.
 */
export function PeaFacts({
  account,
  investedCents,
  today,
  writable,
}: {
  account: Pick<AccountDto, 'id' | 'openedOn'>
  /** The account's invested amount, or null when unknown. */
  investedCents: number | null
  today: string
  writable: boolean
}) {
  const [editing, setEditing] = useState(false)
  const opened = account.openedOn
  const mark = opened ? fiveYearsOn(opened) : null
  const elapsed = opened && mark ? timeElapsed(opened, mark, today) : 0
  const remaining = mark ? timeLeftText(today, mark) : null
  const share =
    investedCents === null
      ? 0
      : Math.min(1, Math.max(0, investedCents / PEA_CEILING_CENTS))
  return (
    <div className="space-y-3 border-t pt-4">
      {investedCents !== null && (
        <div className="space-y-1.5">
          {/* « Plafond 150 000 € » and what is in it, on one line at 320px. */}
          <p className="flex items-baseline gap-x-3 text-sm">
            <span className="text-muted-foreground min-w-0 break-normal">
              Plafond {formatWholeEuros(PEA_CEILING_CENTS)}
            </span>
            <span className="ml-auto shrink-0 font-semibold whitespace-nowrap tabular-nums">
              {formatWholeEuros(investedCents)}
            </span>
          </p>
          <div
            role="img"
            aria-label={`Investi : ${Math.round(share * 100)} % du plafond`}
            className="bg-muted h-2 overflow-hidden rounded-full"
          >
            <span
              className="bg-primary block h-full rounded-full"
              style={{ width: `${share * 100}%` }}
            />
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {investedCents >= PEA_CEILING_CENTS
              ? 'Plafond atteint'
              : `Encore ${formatWholeEuros(PEA_CEILING_CENTS - investedCents)} possibles`}
          </p>
        </div>
      )}
      {/* Shaped like the ceiling (#413, the owner): the date, a bar of the
          time gone, what is left; the whole block opens the opening date. */}
      <button
        type="button"
        disabled={!writable}
        onClick={() => setEditing(true)}
        aria-label={
          mark
            ? `5 ans le ${formatCalendarDate(mark)}, ${remaining!.toLowerCase()} : modifier la date d’ouverture`
            : 'Renseigner la date d’ouverture du PEA'
        }
        className="hover:bg-muted/60 focus-visible:ring-ring -mx-2 block min-h-11 w-[calc(100%+1rem)] space-y-1.5 rounded-lg px-2 py-1.5 text-left outline-none focus-visible:ring-2 disabled:hover:bg-transparent"
      >
        <span className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className="text-muted-foreground">5 ans</span>
          <span className="ml-auto font-semibold whitespace-nowrap">
            {mark ? (
              formatCalendarDate(mark)
            ) : (
              <span className="text-muted-foreground font-normal">
                Date d’ouverture ›
              </span>
            )}
          </span>
        </span>
        {mark && (
          <>
            <span
              aria-hidden
              className="bg-muted block h-2 overflow-hidden rounded-full"
            >
              <span
                className="bg-primary block h-full rounded-full"
                style={{ width: `${elapsed * 100}%` }}
              />
            </span>
            <span className="text-muted-foreground block text-xs tabular-nums">
              {remaining}
            </span>
          </>
        )}
      </button>
      <OpeningDateSheet
        open={editing}
        onOpenChange={setEditing}
        account={account}
        today={today}
      />
    </div>
  )
}

function OpeningDateSheet({
  open,
  onOpenChange,
  account,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: Pick<AccountDto, 'id' | 'openedOn'>
  today: string
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [day, setDay] = useState('')
  useEffect(() => {
    if (open) setDay(account.openedOn ?? '')
  }, [open, account.openedOn])
  const error =
    day > today ? 'La date ne peut pas être dans le futur' : undefined
  const save = useMutation({
    mutationFn: (openedOn: string | null) =>
      updateAccount(account.id, { openedOn }),
    onSuccess: async (saved) => {
      toast.success(
        saved.openedOn
          ? `Ouvert le ${formatCalendarDate(saved.openedOn)}`
          : 'Date d’ouverture retirée',
      )
      onOpenChange(false)
      await afterAccountsChanged(queryClient)
    },
    onError: () => toast.error('Impossible d’enregistrer la date.'),
  })
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
      >
        <SheetBar
          title="Date d’ouverture"
          description="Sur votre contrat ou votre premier relevé : les 5 ans du PEA se comptent depuis ce jour."
          action={
            <SheetBarAction
              type="submit"
              form={`${id}-form`}
              label="Enregistrer"
              loading={save.isPending}
              disabled={day === '' || error !== undefined}
            />
          }
        />
        <form
          id={`${id}-form`}
          noValidate
          className={FORM_SHEET_FORM}
          onSubmit={(event) => {
            event.preventDefault()
            if (day !== '' && !error) save.mutate(day)
          }}
        >
          <FormSheetBody>
            <Field data-invalid={error !== undefined}>
              <FieldLabel htmlFor={`${id}-day`}>Ouvert le</FieldLabel>
              <Input
                id={`${id}-day`}
                type="date"
                max={today}
                value={day}
                aria-invalid={error !== undefined}
                onChange={(event) => setDay(event.target.value)}
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            {account.openedOn && (
              <FormSheetMoreActions>
                <Button
                  type="button"
                  variant="danger"
                  outline
                  onClick={() => save.mutate(null)}
                >
                  Retirer la date
                </Button>
              </FormSheetMoreActions>
            )}
          </FormSheetBody>
        </form>
      </SheetContent>
    </Sheet>
  )
}
