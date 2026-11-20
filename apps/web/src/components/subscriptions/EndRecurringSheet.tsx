import {
  Button,
  cn,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { RecurringItemDto } from '#/api/types.gen'
import { CHIP_CLASS, CHIP_ON } from '#/components/expenses/manual-fields'
import { addDays, formatDayMonth } from './format'
import {
  recurringErrorMessage,
  undoableRecurringToast,
  updateRecurringItem,
} from './queries'
import {
  EditorHeader,
  editorSide,
  FORM_SHEET_SCREEN,
  SheetScroll,
} from '#/components/sheets/form-sheet'

const NOTES_MAX = 1000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A `YYYY-MM-DD` string naming a day that exists. */
function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, day))
  return utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
}

/**
 * The day after the next expected charge (that charge still goes through),
 * when it is still to come; null otherwise. A prepaid subscription (#314) is
 * paid until its renewal: it ends on the renewal date, which is then not
 * charged.
 */
export function afterNextCharge(
  item: Pick<RecurringItemDto, 'nextExpectedDate'> &
    Partial<Pick<RecurringItemDto, 'termMonths'>>,
  today: string,
): string | null {
  if (!item.nextExpectedDate || item.nextExpectedDate < today) return null
  return item.termMonths
    ? item.nextExpectedDate
    : addDays(item.nextExpectedDate, 1)
}

interface EndRecurringSheetProps {
  item: RecurringItemDto | null
  onOpenChange: (open: boolean) => void
  today: string
}

/**
 * « Résilier » (#270): the date from which no charge is expected any more
 * (today, the day after the next charge, or any day, past included) and an
 * optional note. From that day the item leaves the forecast, the totals and
 * the upcoming debits. A bottom sheet on phones; the toast offers
 * « Annuler ». Also changes the date of an item already cancelled.
 */
export function EndRecurringSheet({
  item,
  onOpenChange,
  today,
}: EndRecurringSheetProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [endedOn, setEndedOn] = useState('')
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const afterNext = item ? afterNextCharge(item, today) : null

  // Fresh form on every opening.
  useEffect(() => {
    if (!item) return
    setEndedOn(item.endedOn ?? afterNextCharge(item, today) ?? today)
    setNotes(item.notes ?? '')
    setSubmitted(false)
  }, [item, today])

  const save = useMutation({
    mutationFn: (body: { endedOn: string; notes: string | null }) =>
      updateRecurringItem(item!.id, body),
    onSuccess: async (saved) => {
      const previous = { endedOn: item!.endedOn, notes: item!.notes }
      onOpenChange(false)
      undoableRecurringToast(
        queryClient,
        `${saved.name} résilié · fin le ${formatDayMonth(saved.endedOn!, today)}`,
        saved.id,
        previous,
      )
    },
    onError: (error) => toast.error(recurringErrorMessage(error)),
  })

  const dateError = !isCalendarDate(endedOn)
    ? 'Indiquez une date de fin.'
    : null
  const quick =
    endedOn === today ? 'today' : endedOn === afterNext ? 'after-next' : ''
  const editing = item?.endedOn != null

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (dateError) return
    save.mutate({ endedOn, notes: notes.trim() || null })
  }

  return (
    <Sheet open={item !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : 'overflow-y-auto'}
      >
        {item && (
          <>
            <EditorHeader
              className="pb-0"
              title={
                editing ? 'Modifier la date de fin' : `Résilier ${item.name}`
              }
              description={
                item.termMonths
                  ? 'Payé jusqu’à son renouvellement : résilié à cette date, il n’est pas renouvelé et sort ensuite de la prévision et des totaux.'
                  : 'À partir de la date de fin, plus aucun prélèvement n’est attendu : il sort de la prévision et des totaux.'
              }
            />
            <SheetScroll>
              <form
                noValidate
                onSubmit={submit}
                className="space-y-4 px-4 pb-6"
              >
                <Field data-invalid={submitted && dateError !== null}>
                  <FieldLabel htmlFor={`${id}-date`}>Date de fin</FieldLabel>
                  <ToggleGroup
                    type="single"
                    spacing={1.5}
                    aria-label="Date de fin rapide"
                    className="flex-wrap"
                    value={quick}
                    onValueChange={(next) => {
                      if (next === 'today') setEndedOn(today)
                      else if (next === 'after-next' && afterNext)
                        setEndedOn(afterNext)
                    }}
                  >
                    <ToggleGroupItem
                      value="today"
                      className={cn(CHIP_CLASS, CHIP_ON)}
                    >
                      Aujourd’hui
                    </ToggleGroupItem>
                    {afterNext && item.nextExpectedDate && (
                      <ToggleGroupItem
                        value="after-next"
                        // Long: wraps on narrow phones instead of overflowing.
                        className={cn(
                          CHIP_CLASS,
                          CHIP_ON,
                          'h-auto min-h-8 max-w-full shrink rounded-2xl py-1 text-left whitespace-normal',
                        )}
                      >
                        <span>
                          {item.termMonths
                            ? 'Au renouvellement'
                            : 'Après la prochaine échéance'}{' '}
                          ({formatDayMonth(item.nextExpectedDate, today)})
                        </span>
                      </ToggleGroupItem>
                    )}
                  </ToggleGroup>
                  <Input
                    id={`${id}-date`}
                    type="date"
                    value={endedOn}
                    aria-invalid={submitted && dateError !== null}
                    onChange={(event) => setEndedOn(event.target.value)}
                  />
                  {submitted && dateError ? (
                    <FieldError>{dateError}</FieldError>
                  ) : (
                    <FieldDescription>
                      {endedOn <= today
                        ? 'Premier jour sans prélèvement. Passée ou du jour : il sort des totaux dès maintenant.'
                        : `Premier jour sans prélèvement. Dernier jour compté : ${formatDayMonth(addDays(endedOn, -1), today)}`}
                    </FieldDescription>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-notes`}>Note</FieldLabel>
                  <Textarea
                    id={`${id}-notes`}
                    rows={2}
                    maxLength={NOTES_MAX}
                    value={notes}
                    placeholder="Ex. : résilié en ligne, confirmation reçue"
                    onChange={(event) => setNotes(event.target.value)}
                  />
                  <FieldDescription>Facultative.</FieldDescription>
                </Field>
                <div className="grid gap-2 pt-2">
                  <Button
                    type="submit"
                    variant={editing ? undefined : 'danger'}
                    loading={save.isPending}
                  >
                    {editing ? 'Enregistrer' : 'Résilier'}
                  </Button>
                  {/* A phone: the bar's ✕ cancels. */}
                </div>
              </form>
            </SheetScroll>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
