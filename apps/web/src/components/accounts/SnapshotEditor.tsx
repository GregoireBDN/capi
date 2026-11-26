import {
  Button,
  ConfirmDialog,
  DateField,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  Textarea,
  useIsMobile,
} from '@capi/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AmountField } from '#/components/amount/AmountField'
import { LARGE_AMOUNT_CENTS } from '#/components/amount/signed-amount'
import { ChevronDownIcon } from 'lucide-react'
import { useSignedText } from '#/components/amount/use-signed-text'
import type { SnapshotDto } from '#/api/types.gen'
import {
  editorSide,
  FORM_SHEET_SCREEN,
  FORM_SHEET_FORM,
  FORM_SHEET_SIDE,
  FormSheetBody,
  FormSheetMoreActions,
} from '#/components/sheets/form-sheet'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { centsToInput, parseAmountToCents } from './amount'
import { snapshotErrorMessage } from './errors'
import { afterSnapshotsChanged, removeSnapshot, saveSnapshot } from './queries'

const NOTE_MAX = 500

interface SnapshotEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  /** Today in Europe/Paris: the latest day a value may be dated. */
  today: string
  /** Investment accounts also track net contributions. */
  withContributions: boolean
  /** Edit this snapshot, or add one when undefined. */
  snapshot?: SnapshotDto
  /** Prefilled contributions when adding (the latest known ones). */
  defaultContributionsCents?: number | null
  /** Shown in the title when the sheet is opened away from the account page. */
  accountName?: string
}

interface FormErrors {
  date?: string
  value?: string
  contributions?: string
}

const DESCRIPTION =
  'Valeur du compte en fin de journée, d’après un relevé ou votre espace client.'

function validate(
  date: string,
  value: string,
  contributions: string,
  today: string,
): FormErrors {
  const errors: FormErrors = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = 'Indiquez une date'
  else if (date > today) errors.date = 'La date ne peut pas être dans le futur'
  const valueCents = parseAmountToCents(value)
  if (value.trim() === '') errors.value = 'Indiquez la valeur'
  else if (valueCents === null)
    errors.value = 'Montant invalide (ex. 12 345,67)'
  else if (valueCents < 0) errors.value = 'La valeur ne peut pas être négative'
  if (contributions.trim() !== '' && parseAmountToCents(contributions) === null)
    errors.contributions = 'Montant invalide (ex. 10 000)'
  return errors
}

/**
 * Adds, corrects or deletes the value of an account on one day (a statement,
 * an occasional update). A bottom sheet on phones, a side sheet otherwise.
 */
export function SnapshotEditor({
  open,
  onOpenChange,
  accountId,
  today,
  withContributions,
  snapshot,
  defaultContributionsCents,
  accountName,
}: SnapshotEditorProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [date, setDate] = useState('')
  const [value, setValue] = useState('')
  const [contributions, setContributions] = useState('')
  const contributionsField = useSignedText(contributions, setContributions)
  const [note, setNote] = useState('')
  // « Investi à cette date », for the statements that print it (#360).
  const [more, setMore] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const valueRef = useRef<HTMLInputElement>(null)

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    setDate(snapshot?.date ?? today)
    setValue(snapshot ? centsToInput(snapshot.valueCents) : '')
    const knownContributions = snapshot
      ? snapshot.contributionsCents
      : defaultContributionsCents
    setContributions(
      knownContributions === null || knownContributions === undefined
        ? ''
        : centsToInput(knownContributions),
    )
    setNote(snapshot?.note ?? '')
    setMore(snapshot?.contributionsCents != null)
    setSubmitted(false)
  }, [open, snapshot, today, defaultContributionsCents])

  const errors = validate(
    date,
    value,
    withContributions ? contributions : '',
    today,
  )
  const valid = Object.keys(errors).length === 0

  const save = useMutation({
    mutationFn: () =>
      saveSnapshot(accountId, date, {
        valueCents: parseAmountToCents(value)!,
        // Cash accounts do not show the field: keep what the day had.
        contributionsCents: !withContributions
          ? (snapshot?.contributionsCents ?? null)
          : contributions.trim() === ''
            ? null
            : parseAmountToCents(contributions),
        note: note.trim() || null,
      }),
    onSuccess: async (saved) => {
      toast.success(
        `Valeur du ${formatCalendarDate(saved.date)} : ${formatCents(saved.valueCents)}`,
      )
      onOpenChange(false)
      await afterSnapshotsChanged(queryClient)
    },
    onError: (error) => toast.error(snapshotErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => removeSnapshot(accountId, snapshot!.date),
    onSuccess: async () => {
      toast.success(`Valeur du ${formatCalendarDate(snapshot!.date)} supprimée`)
      setConfirmOpen(false)
      onOpenChange(false)
      await afterSnapshotsChanged(queryClient)
    },
    onError: (error) => toast.error(snapshotErrorMessage(error)),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (valid) save.mutate()
  }

  const shown = submitted ? errors : {}
  // A PEA's value from its lines (#413): typing one replaces it for the day,
  // it is never deleted.
  const computed = snapshot?.source === 'computed'
  const title = snapshot
    ? `Valeur du ${formatCalendarDate(snapshot.date)}`
    : accountName
      ? `Mettre à jour « ${accountName} »`
      : 'Ajouter une valeur'

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={editorSide(isMobile)}
          className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
          // A new value is what is typed: the date is today's.
          // A new value is what is typed: the date is today's. Not on a
          // phone, which opens without the keyboard (#385).
          onOpenAutoFocus={(event) => {
            if (snapshot || isMobile) return
            event.preventDefault()
            valueRef.current?.focus()
          }}
        >
          <SheetBar
            title={title}
            description={
              computed
                ? 'Calculée d’après vos lignes : en saisir une autre la remplace pour ce jour.'
                : DESCRIPTION
            }
            action={
              <SheetBarAction
                type="submit"
                form={`${id}-form`}
                label="Enregistrer"
                loading={save.isPending}
                disabled={value.trim() === ''}
              />
            }
          />
          <form
            id={`${id}-form`}
            noValidate
            onSubmit={submit}
            className={FORM_SHEET_FORM}
          >
            <FormSheetBody>
              {!snapshot && (
                <Field data-invalid={shown.date !== undefined}>
                  <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
                  <DateField
                    id={`${id}-date`}
                    title="Date"
                    max={today}
                    value={date}
                    aria-invalid={shown.date !== undefined}
                    onChange={setDate}
                  />
                  {shown.date && <FieldError>{shown.date}</FieldError>}
                </Field>
              )}
              <Field data-invalid={shown.value !== undefined}>
                <FieldLabel htmlFor={`${id}-value`}>Valeur</FieldLabel>
                <AmountField
                  maxCents={LARGE_AMOUNT_CENTS}
                  ref={valueRef}
                  id={`${id}-value`}
                  placeholder="12 345,67"
                  value={value}
                  aria-invalid={shown.value !== undefined}
                  onValueChange={(typed) => setValue(typed)}
                />
                {shown.value && <FieldError>{shown.value}</FieldError>}
              </Field>
              {withContributions && !more && (
                <Button
                  type="button"
                  ghost
                  variant="secondary"
                  className="self-start"
                  iconEnd={<ChevronDownIcon aria-hidden />}
                  onClick={() => setMore(true)}
                >
                  Plus d’options
                </Button>
              )}
              {withContributions && more && (
                <Field data-invalid={shown.contributions !== undefined}>
                  <FieldLabel htmlFor={`${id}-contributions`}>
                    Investi à cette date
                  </FieldLabel>
                  <AmountField
                    maxCents={LARGE_AMOUNT_CENTS}
                    id={`${id}-contributions`}
                    placeholder="10 000"
                    aria-invalid={shown.contributions !== undefined}
                    {...contributionsField}
                  />
                  {shown.contributions ? (
                    <FieldError>{shown.contributions}</FieldError>
                  ) : (
                    <FieldDescription>
                      Si le relevé l’indique (« versements nets »). Le montant
                      investi se renseigne d’abord depuis la page du compte.
                    </FieldDescription>
                  )}
                </Field>
              )}
              {/* Opened away from the account page: the value, quickly. */}
              {(snapshot || !accountName) && (
                <Field>
                  <FieldLabel htmlFor={`${id}-note`}>Note</FieldLabel>
                  <Textarea
                    id={`${id}-note`}
                    rows={2}
                    maxLength={NOTE_MAX}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <FieldDescription>
                    Facultative, par ex. « relevé annuel ».
                  </FieldDescription>
                </Field>
              )}
              {snapshot && !computed && (
                <FormSheetMoreActions>
                  <Button
                    type="button"
                    variant="danger"
                    outline
                    onClick={() => setConfirmOpen(true)}
                  >
                    Supprimer cette valeur
                  </Button>
                </FormSheetMoreActions>
              )}
            </FormSheetBody>
          </form>
        </SheetContent>
      </Sheet>
      {snapshot && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Supprimer la valeur du ${formatCalendarDate(snapshot.date)} ?`}
          description="Le solde et l’historique du compte seront recalculés sans elle."
          confirmLabel="Supprimer"
          variant="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  )
}
