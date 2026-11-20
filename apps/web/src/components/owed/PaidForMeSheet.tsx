import {
  Button,
  cn,
  Field,
  FieldLabel,
  Input,
  SegmentedControl,
  SegmentedControlItem,
  Sheet,
  SheetContent,
  SheetTitle,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MinusIcon, PlusIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { AmountField } from '#/components/amount/AmountField'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { CategoryChips, DateChips } from '#/components/expenses/manual-fields'
import {
  editorSide,
  FORM_SHEET_SCREEN,
  EditorHeader,
  FORM_SHEET_FORM,
  FORM_SHEET_SIDE,
  FormSheetBody,
} from '#/components/sheets/form-sheet'
import { currentDay } from '#/lib/calendar'
import { pickableCategories } from '#/lib/categories'
import { formatCents } from '#/lib/money'
import { categoriesQuery } from '#/lib/queries'
import { PeoplePicker, personRef } from './PeoplePicker'
import type { Person } from './PeoplePicker'
import {
  afterOwedChanged,
  contactsQuery,
  createDebt,
  owedErrorMessage,
  removeReceivable,
  UNDO_TOAST_MS,
} from './queries'
import { myPartOf } from './shares'
import type { ShareMode } from './shares'

/** What the sheet opens with (from the quick entry or a person's page). */
export interface PaidForMeDraft {
  person?: Person
  categoryId?: string
  billCents?: number
  bookingDate?: string
  label?: string
}

/**
 * « Payé pour moi » (#359, owner's « B. L'addition puis ma part »): who
 * paid, the bill they paid, then my part: « Moitié », « Parts égales »
 * between n (me included, rounded half to even) or « Montant »; « Je dois à
 * Sam 30 € » live. Only my part counts in my spending, in its category on
 * its day; the bill is kept beside it. The toast offers « Annuler ».
 */
export function PaidForMeSheet({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: PaidForMeDraft
}) {
  const isMobile = useIsMobile()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className={isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE}
      >
        {!open && <SheetTitle className="sr-only">Payé pour moi</SheetTitle>}
        {open && (
          <PaidForMeForm initial={initial} onDone={() => onOpenChange(false)} />
        )}
      </SheetContent>
    </Sheet>
  )
}

function PaidForMeForm({
  initial,
  onDone,
}: {
  initial?: PaidForMeDraft
  onDone: () => void
}) {
  const id = useId()
  const queryClient = useQueryClient()
  const today = currentDay()
  const contacts = useQuery(contactsQuery())
  const categories = useQuery(categoriesQuery)
  const [person, setPerson] = useState<Person | null>(initial?.person ?? null)
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [date, setDate] = useState(initial?.bookingDate ?? today)
  const [bill, setBill] = useState(
    initial?.billCents ? centsToInput(initial.billCents) : '',
  )
  const [mode, setMode] = useState<ShareMode>('equal')
  const [people, setPeople] = useState(3)
  const [typed, setTyped] = useState('')

  const expenseCategories = pickableCategories(categories.data ?? []).filter(
    (category) => category.kind === 'expense',
  )

  const billCents = parseEurosToCents(bill) ?? 0
  const mine =
    mode === 'amount'
      ? (parseEurosToCents(typed) ?? 0)
      : (myPartOf(mode, billCents, people) ?? 0)
  const over = mine > billCents
  const ok =
    person !== null &&
    categoryId !== '' &&
    billCents > 0 &&
    mine > 0 &&
    !over &&
    date !== '' &&
    date <= today

  const save = useMutation({
    mutationFn: () =>
      createDebt({
        ...personRef(person!),
        billCents,
        partCents: mine,
        categoryId,
        bookingDate: date,
        ...(label.trim() ? { label: label.trim() } : {}),
      }),
    onSuccess: async (transaction) => {
      onDone()
      await afterOwedChanged(queryClient)
      const debt = transaction.shares.find((s) => s.direction === 'i_owe')
      let undone = false
      toast.success(
        `Vous devez ${formatCents(mine)} à ${person!.name}`,
        debt && {
          duration: UNDO_TOAST_MS,
          action: {
            label: 'Annuler',
            onClick: () => {
              if (undone) return
              undone = true
              void removeReceivable(debt.id)
                .then(() => afterOwedChanged(queryClient))
                .catch((error: unknown) => toast.error(owedErrorMessage(error)))
            },
          },
        },
      )
    },
    onError: (error) => toast.error(owedErrorMessage(error)),
  })

  const name = person?.name ?? '…'
  const summary = (
    <div
      aria-live="polite"
      className={cn(
        'flex min-h-11 items-center justify-between gap-3 rounded-md px-3',
        over ? 'bg-destructive/10' : 'bg-muted/60',
      )}
    >
      <span className="font-semibold break-normal">Je dois à {name}</span>
      <span
        className={cn(
          'font-semibold whitespace-nowrap tabular-nums',
          over && 'text-destructive',
        )}
      >
        {over ? 'plus que l’addition' : formatCents(mine)}
      </span>
    </div>
  )
  return (
    <form
      className={FORM_SHEET_FORM}
      onSubmit={(event) => {
        event.preventDefault()
        if (ok) save.mutate()
      }}
    >
      <EditorHeader
        title="Payé pour moi"
        description="Quelqu’un a payé : seule votre part compte dans vos dépenses."
        action={{
          type: 'submit',
          label: 'Ajouter',
          disabled: !ok,
          loading: save.isPending,
        }}
      />
      <FormSheetBody>
        <PeoplePicker
          single
          label="Qui a payé ?"
          contacts={contacts.data ?? []}
          chosen={person ? [person] : []}
          onPick={setPerson}
        />
        <Field>
          <FieldLabel id={`${id}-category`}>Catégorie</FieldLabel>
          <CategoryChips
            labelId={`${id}-category`}
            categories={expenseCategories}
            value={categoryId}
            allowNone={false}
            onChoose={setCategoryId}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-label`}>Libellé</FieldLabel>
          <Input
            id={`${id}-label`}
            autoComplete="off"
            maxLength={255}
            placeholder="Facultatif"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </Field>
        <Field>
          <DateChips
            value={date}
            today={today}
            invalid={date > today}
            onChange={setDate}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={`${id}-bill`} className="text-sm font-medium">
            Addition payée par {name}
          </label>
          <AmountField
            id={`${id}-bill`}
            groupClassName="w-[8rem]"
            className="text-right"
            value={bill}
            onValueChange={setBill}
          />
        </div>
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium">Ma part</p>
          <SegmentedControl
            fullWidth
            aria-label="Ma part"
            value={mode}
            onValueChange={setMode}
          >
            <SegmentedControlItem value="half">Moitié</SegmentedControlItem>
            <SegmentedControlItem value="equal">
              Parts égales
            </SegmentedControlItem>
            <SegmentedControlItem value="amount">Montant</SegmentedControlItem>
          </SegmentedControl>
          {mode === 'equal' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">Entre combien, vous compris</span>
              <span className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  iconOnly
                  aria-label="Une personne de moins"
                  disabled={people <= 2}
                  onClick={() => setPeople((n) => Math.max(2, n - 1))}
                >
                  <MinusIcon aria-hidden />
                </Button>
                <span
                  className="w-8 text-center tabular-nums"
                  aria-live="polite"
                >
                  {people}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  iconOnly
                  aria-label="Une personne de plus"
                  disabled={people >= 20}
                  onClick={() => setPeople((n) => Math.min(20, n + 1))}
                >
                  <PlusIcon aria-hidden />
                </Button>
              </span>
            </div>
          )}
          {mode === 'amount' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`${id}-mine`} className="text-sm">
                Ma part
              </label>
              <AmountField
                id={`${id}-mine`}
                groupClassName="w-[8rem]"
                className="text-right"
                aria-invalid={over || undefined}
                value={typed}
                onValueChange={setTyped}
              />
            </div>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Seule votre part compte dans vos dépenses, le jour de la dépense ;
          l’addition reste à côté. Votre virement à {name}, une fois lié, ne
          comptera pas comme une dépense.
        </p>
      </FormSheetBody>
      {/* « Je dois à … », live: on a phone it stays at the bottom, the
          keyboard covering it while a field is typed (#385). */}
      <div className="flex shrink-0 border-t px-4 py-3 [&>div]:flex-1">
        {summary}
      </div>
    </form>
  )
}
