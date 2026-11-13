import {
  Button,
  ConfirmDialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { SnapshotDto } from '#/api/types.gen'
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
  const [note, setNote] = useState('')
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
  const title = snapshot
    ? `Valeur du ${formatCalendarDate(snapshot.date)}`
    : accountName
      ? `Mettre à jour « ${accountName} »`
      : 'Ajouter une valeur'

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={
            isMobile
              ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
              : undefined
          }
          // A new value is what is typed: the date is today's.
          onOpenAutoFocus={(event) => {
            if (snapshot) return
            event.preventDefault()
            valueRef.current?.focus()
          }}
        >
          <SheetHeader className="pb-0">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              Valeur du compte en fin de journée, d’après un relevé ou votre
              espace client.
            </SheetDescription>
          </SheetHeader>
          <form noValidate onSubmit={submit} className="space-y-4 px-4 pb-6">
            {!snapshot && (
              <Field data-invalid={shown.date !== undefined}>
                <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
                <Input
                  id={`${id}-date`}
                  type="date"
                  max={today}
                  value={date}
                  aria-invalid={shown.date !== undefined}
                  onChange={(event) => setDate(event.target.value)}
                />
                {shown.date && <FieldError>{shown.date}</FieldError>}
              </Field>
            )}
            <Field data-invalid={shown.value !== undefined}>
              <FieldLabel htmlFor={`${id}-value`}>Valeur</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  ref={valueRef}
                  id={`${id}-value`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="12 345,67"
                  value={value}
                  aria-invalid={shown.value !== undefined}
                  onChange={(event) => setValue(event.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>€</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              {shown.value && <FieldError>{shown.value}</FieldError>}
            </Field>
            {withContributions && (
              <Field data-invalid={shown.contributions !== undefined}>
                <FieldLabel htmlFor={`${id}-contributions`}>
                  Versements nets
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={`${id}-contributions`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="10 000"
                    value={contributions}
                    aria-invalid={shown.contributions !== undefined}
                    onChange={(event) => setContributions(event.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>€</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                {shown.contributions ? (
                  <FieldError>{shown.contributions}</FieldError>
                ) : (
                  <FieldDescription>
                    Total versé moins les retraits, à cette date. Laissez vide
                    si vous ne le connaissez pas.
                  </FieldDescription>
                )}
              </Field>
            )}
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
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {snapshot && (
                <Button
                  type="button"
                  variant="danger"
                  outline
                  onClick={() => setConfirmOpen(true)}
                >
                  Supprimer
                </Button>
              )}
              <Button
                type="submit"
                className="sm:ml-auto"
                loading={save.isPending}
              >
                Enregistrer
              </Button>
            </div>
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
