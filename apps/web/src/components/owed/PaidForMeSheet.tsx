import {
  Button,
  categoryIconComponent,
  CategoryIcon,
  cn,
  Field,
  FieldLabel,
  Input,
  SegmentedControl,
  SegmentedControlItem,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  SheetSteps,
  SheetTitle,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChartPieIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
  ReceiptIcon,
  TagIcon,
  UserRoundIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AmountField } from '#/components/amount/AmountField'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { DEFAULT_CATEGORY_ICON } from '#/components/categories/category-icons'
import { CategoryPicker } from '#/components/categories/CategoryPicker'
import { categoryErrorMessage } from '#/components/categories/errors'
import { DEFAULT_CATEGORY_COLOR } from '#/components/categories/palette'
import { createCategory } from '#/components/categories/queries'
import { DateChips } from '#/components/expenses/manual-fields'
import {
  EDITOR_STEADY_HEIGHT,
  editorSide,
  FORM_SHEET_FORM,
  FORM_SHEET_SCREEN,
  FORM_SHEET_SIDE,
  FormSheetBody,
} from '#/components/sheets/form-sheet'
import { currentDay } from '#/lib/calendar'
import { formatCalendarDate, formatCents } from '#/lib/money'
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

/** The four steps (#394), one decision each. */
export const PAID_FOR_ME_STEPS = [
  'person',
  'category',
  'bill',
  'share',
] as const
export type PaidForMeStep = (typeof PAID_FOR_ME_STEPS)[number]
const STEP_NAMES: Record<PaidForMeStep, string> = {
  person: 'Qui a payé',
  category: 'Catégorie',
  bill: 'Addition',
  share: 'Ma part',
}

/** A segment of « Ma part » on a phone: less padding, so the labels fit. */
const NARROW_SEGMENT = 'px-1.5 @[20rem]:px-3'

/** What each step needs before the next one: who, the category, the bill. */
export interface PaidForMeFilled {
  person: boolean
  category: boolean
  bill: boolean
}

/**
 * Where the sheet goes after `from` (or opens, without it): the first step
 * still to fill in, so a hand-over skips what it brought; « Ma part » once
 * everything before it is there.
 */
export function nextPaidForMeStep(
  filled: PaidForMeFilled,
  from?: PaidForMeStep,
): PaidForMeStep {
  const start = from ? PAID_FOR_ME_STEPS.indexOf(from) + 1 : 0
  return (
    PAID_FOR_ME_STEPS.slice(start).find(
      (step) => step !== 'share' && !filled[step],
    ) ?? 'share'
  )
}

/**
 * « Payé pour moi » (#359, owner's « B. L'addition puis ma part »; in steps
 * since #394): who paid (a tap moves on), the category (the picker of #396,
 * « Nouvelle catégorie » when it is missing), the bill with its day and
 * label, then my part: « Moitié », « Parts égales » between n (me included,
 * rounded half to even) or « Montant », with « Je dois à Sam 30 € » live.
 * Only my part counts in my spending, in its category on its day; the bill
 * is kept beside it. The toast offers « Annuler ». The whole screen on a
 * phone, a centred modal elsewhere.
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
        className={cn(
          isMobile ? FORM_SHEET_SCREEN : FORM_SHEET_SIDE,
          EDITOR_STEADY_HEIGHT,
        )}
        // Each step focuses its own heading (or the bill's field).
        onOpenAutoFocus={(event) => event.preventDefault()}
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

  const billCents = parseEurosToCents(bill) ?? 0
  const dateOk = date !== '' && date <= today
  const filled: PaidForMeFilled = {
    person: person !== null,
    category: categoryId !== '',
    bill: billCents > 0 && dateOk,
  }
  const [step, setStep] = useState<PaidForMeStep>(() =>
    nextPaidForMeStep(filled),
  )
  const stepIndex = PAID_FOR_ME_STEPS.indexOf(step)

  const mine =
    mode === 'amount'
      ? (parseEurosToCents(typed) ?? 0)
      : (myPartOf(mode, billCents, people) ?? 0)
  const over = mine > billCents
  const ok =
    filled.person && filled.category && filled.bill && mine > 0 && !over

  /** Every step before `target` is filled in. */
  const reachable = (target: PaidForMeStep) =>
    PAID_FOR_ME_STEPS.slice(0, PAID_FOR_ME_STEPS.indexOf(target)).every(
      (before) => before === 'share' || filled[before],
    )
  const stepDone = step === 'share' ? ok : filled[step]

  // Each step starts on its heading (read out by screen readers), the bill
  // on its field, so typing goes straight to it; right in the commit that
  // shows the step, so a tap that moved on keeps the phone's keyboard.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const billRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (step === 'bill') billRef.current?.focus({ preventScroll: true })
    else headingRef.current?.focus({ preventScroll: true })
  }, [step])

  /** Moves on from the step shown once it is filled in. */
  function moveOn(next: PaidForMeFilled = filled) {
    setStep(nextPaidForMeStep(next, step))
  }

  const createdCategory = useMutation({
    mutationFn: (name: string) =>
      createCategory({
        name,
        kind: 'expense',
        color: DEFAULT_CATEGORY_COLOR,
        icon: DEFAULT_CATEGORY_ICON,
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({
        queryKey: categoriesQuery.queryKey,
      })
      setCategoryId(created.id)
      moveOn({ ...filled, category: true })
    },
    onError: (error) => toast.error(categoryErrorMessage(error)),
  })

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
  const category = categories.data?.find((c) => c.id === categoryId)
  const CategoryGlyph = categoryIconComponent(category?.icon ?? null)

  /** What the earlier steps chose, at the top of the later ones. */
  const recap = (
    <p className="text-muted-foreground flex min-w-0 items-center justify-center gap-1.5 text-sm">
      {category && (
        <CategoryIcon icon={category.icon} color={category.color} size="sm" />
      )}
      <span className="truncate">
        {[
          person && `Payé par ${person.name}`,
          category?.name,
          step === 'share' && billCents > 0 && formatCents(billCents),
          step === 'share' && dateOk && formatCalendarDate(date),
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </p>
  )

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
      noValidate
      className={FORM_SHEET_FORM}
      onSubmit={(event) => {
        event.preventDefault()
        if (step !== 'share') {
          if (filled[step]) moveOn()
        } else if (ok && !save.isPending) save.mutate()
      }}
    >
      <SheetBar
        titleRef={headingRef}
        title="Payé pour moi"
        description={`Étape ${stepIndex + 1} sur ${PAID_FOR_ME_STEPS.length} : ${STEP_NAMES[step]}`}
        steps={
          <SheetSteps
            current={step}
            onSelect={(key) => setStep(key as PaidForMeStep)}
            steps={[
              person
                ? {
                    key: 'person',
                    label: person.name,
                    icon: <UserRoundIcon aria-hidden />,
                  }
                : {
                    key: 'person',
                    label: STEP_NAMES.person,
                    icon: <UserRoundIcon aria-hidden />,
                  },
              // Once chosen, the category's own icon in its colour.
              category
                ? {
                    key: 'category',
                    label: category.name,
                    icon: <CategoryGlyph aria-hidden />,
                    color: category.color,
                    disabled: !reachable('category'),
                  }
                : {
                    key: 'category',
                    label: STEP_NAMES.category,
                    icon: <TagIcon aria-hidden />,
                    disabled: !reachable('category'),
                  },
              {
                key: 'bill',
                label: STEP_NAMES.bill,
                icon: <ReceiptIcon aria-hidden />,
                disabled: !reachable('bill'),
              },
              {
                key: 'share',
                label: STEP_NAMES.share,
                icon: <ChartPieIcon aria-hidden />,
                disabled: !reachable('share'),
              },
            ]}
          />
        }
        onBack={
          stepIndex > 0
            ? () => setStep(PAID_FOR_ME_STEPS[stepIndex - 1])
            : undefined
        }
        action={
          <SheetBarAction
            type="submit"
            label={step === 'share' ? 'Ajouter' : 'Suivant'}
            icon={
              step === 'share' ? undefined : (
                <ChevronRightIcon aria-hidden strokeWidth={2.6} />
              )
            }
            loading={step === 'share' && save.isPending}
            disabled={!stepDone}
          />
        }
      />

      {step === 'person' && (
        <FormSheetBody>
          <p className="text-muted-foreground text-sm">
            Quelqu’un a payé pour vous : seule votre part comptera dans vos
            dépenses.
          </p>
          <PeoplePicker
            single
            label="Qui a payé ?"
            contacts={contacts.data ?? []}
            chosen={person ? [person] : []}
            onPick={(picked) => {
              setPerson(picked)
              moveOn({ ...filled, person: true })
            }}
          />
        </FormSheetBody>
      )}

      {step === 'category' && (
        <CategoryPicker
          categories={categories.data ?? []}
          kinds={['expense']}
          value={categoryId || null}
          onPick={(picked) => {
            setCategoryId(picked)
            moveOn({ ...filled, category: true })
          }}
          onCreate={(newName) => createdCategory.mutate(newName)}
          creating={createdCategory.isPending}
        />
      )}

      {step === 'bill' && (
        <FormSheetBody>
          {recap}
          <Field>
            <FieldLabel htmlFor={`${id}-bill`}>
              Addition payée par {name}
            </FieldLabel>
            <AmountField
              ref={billRef}
              id={`${id}-bill`}
              enterKeyHint="next"
              value={bill}
              onValueChange={setBill}
            />
          </Field>
          <Field>
            <DateChips
              value={date}
              today={today}
              invalid={!dateOk}
              onChange={setDate}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-label`}>Libellé</FieldLabel>
            <Input
              id={`${id}-label`}
              autoComplete="off"
              enterKeyHint="next"
              maxLength={255}
              placeholder="Facultatif"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
        </FormSheetBody>
      )}

      {step === 'share' && (
        <>
          <FormSheetBody>
            {recap}
            {/* « Parts égales » is « Égales », with less padding, where
                three equal segments can't hold it (phones). */}
            <div className="@container">
              <SegmentedControl
                fullWidth
                aria-label="Ma part"
                value={mode}
                onValueChange={setMode}
              >
                <SegmentedControlItem value="half" className={NARROW_SEGMENT}>
                  Moitié
                </SegmentedControlItem>
                <SegmentedControlItem
                  value="equal"
                  aria-label="Parts égales"
                  className={NARROW_SEGMENT}
                >
                  <span className="@[20rem]:hidden">Égales</span>
                  <span className="hidden @[20rem]:inline">Parts égales</span>
                </SegmentedControlItem>
                <SegmentedControlItem value="amount" className={NARROW_SEGMENT}>
                  Montant
                </SegmentedControlItem>
              </SegmentedControl>
            </div>
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
        </>
      )}
    </form>
  )
}
