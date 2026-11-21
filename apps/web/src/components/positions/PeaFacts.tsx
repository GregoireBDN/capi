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
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClockIcon, PencilIcon } from 'lucide-react'
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
  const share =
    investedCents === null
      ? 0
      : Math.min(1, Math.max(0, investedCents / PEA_CEILING_CENTS))
  return (
    <div className="space-y-3 border-t pt-4">
      {investedCents !== null && (
        <div className="space-y-1.5">
          <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
            <span className="text-muted-foreground">Plafond</span>
            <span className="ml-auto tabular-nums">
              <span className="font-semibold">
                {formatWholeEuros(investedCents)}
              </span>
              <span className="text-muted-foreground">
                {' '}
                investis sur {formatWholeEuros(PEA_CEILING_CENTS)}
              </span>
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
      <div className="flex min-h-11 items-center gap-3 text-sm">
        <CalendarClockIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
        <span className="min-w-0 flex-1">
          {mark ? (
            <>
              {mark <= today ? '5 ans depuis le ' : '5 ans le '}
              <span className="font-medium whitespace-nowrap">
                {formatCalendarDate(mark)}
              </span>
              <span className="text-muted-foreground block text-xs">
                Ouvert le {formatCalendarDate(opened!)} · retraits sans clôture{' '}
                {mark <= today ? 'possibles' : 'ensuite'}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              Date d’ouverture non renseignée : elle donne les 5 ans du PEA.
            </span>
          )}
        </span>
        {writable &&
          (opened ? (
            <Button
              size="sm"
              ghost
              variant="secondary"
              iconOnly
              className="shrink-0"
              aria-label="Modifier la date d’ouverture"
              onClick={() => setEditing(true)}
            >
              <PencilIcon />
            </Button>
          ) : (
            <Button
              size="sm"
              ghost
              variant="secondary"
              iconStart={<PencilIcon />}
              className="shrink-0"
              aria-label="Renseigner la date d’ouverture"
              onClick={() => setEditing(true)}
            >
              Renseigner
            </Button>
          ))}
      </div>
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
