import {
  Button,
  categoryIconComponent,
  CategoryIcon,
  cn,
  Field,
  FieldLabel,
  Input,
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
import { typedAmount } from '#/components/expenses/amount-entry'
import { CHIP_CLASS, CHIP_ON } from '#/components/expenses/manual-fields'
import { DayStrip } from '#/components/dates/DayStrip'
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

/**
 * « On était combien ? » (the owner's « A », #394): 2 (half, the default) to
 * 5, then « 6+ », which shows − / + up to `PEOPLE_MAX`.
 */
const PEOPLE_MORE = 6
const PEOPLE_MAX = 20
const PEOPLE_TILES = [2, 3, 4, 5, PEOPLE_MORE] as const

/** What each step needs before the next one: who, the category, the bill. */
export interface PaidForMeFilled {
  person: boolean
  category: boolean
  bill: boolean
}

/**
 * Where the sheet opens: the first step still to fill in, so a hand-over
 * skips what it brought; « Ma part » once everything before it is there.
 * From then on each step moves on to the next one in order, filled or not
 * (the owner, #394).
 */
export function firstPaidForMeStep(filled: PaidForMeFilled): PaidForMeStep {
  return (
    PAID_FOR_ME_STEPS.find((step) => step !== 'share' && !filled[step]) ??
    'share'
  )
}

/** The step after `step`, in order (« Ma part » is the last). */
export function nextPaidForMeStep(step: PaidForMeStep): PaidForMeStep {
  const index = PAID_FOR_ME_STEPS.indexOf(step)
  return PAID_FOR_ME_STEPS[Math.min(index + 1, PAID_FOR_ME_STEPS.length - 1)]
}

/**
 * « Quelqu’un a payé pour moi » (#359, owner's « B. L'addition puis ma part »; in steps
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
        {!open && (
          <SheetTitle className="sr-only">Quelqu’un a payé pour moi</SheetTitle>
        )}
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
  /** How many shared the bill, me included; null once I typed my part. */
  const [people, setPeople] = useState<number | null>(2)
  const [typed, setTyped] = useState('')
  /** The day strip's month is open: the step is all of it. */
  const [pickingDay, setPickingDay] = useState(false)

  const billCents = parseEurosToCents(bill) ?? 0
  const dateOk = date !== '' && date <= today
  const filled: PaidForMeFilled = {
    person: person !== null,
    category: categoryId !== '',
    bill: billCents > 0 && dateOk,
  }
  const [step, setStep] = useState<PaidForMeStep>(() =>
    firstPaidForMeStep(filled),
  )
  // The strip closes its month when the step changes.
  useEffect(() => setPickingDay(false), [step])
  const stepIndex = PAID_FOR_ME_STEPS.indexOf(step)

  const mine = myPartCents(billCents, people, typed)
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

  /** Moves on from the step shown to the next one, in order. */
  function moveOn() {
    setStep(nextPaidForMeStep(step))
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
      moveOn()
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
        title="Quelqu’un a payé pour moi"
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
          <PeoplePicker
            single
            label="Qui a payé ?"
            contacts={contacts.data ?? []}
            chosen={person ? [person] : []}
            onPick={(picked) => {
              setPerson(picked)
              moveOn()
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
            moveOn()
          }}
          onCreate={(newName) => createdCategory.mutate(newName)}
          creating={createdCategory.isPending}
        />
      )}

      {step === 'bill' && (
        <FormSheetBody className={cn(pickingDay && 'flex flex-col')}>
          {!pickingDay && recap}
          <Field hidden={pickingDay}>
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
          {/* The day as in the quick entry (#398): the same strip, its
              month in place of the rest while open. */}
          <DayStrip
            value={date}
            onChange={setDate}
            today={today}
            invalid={!dateOk}
            onPickingChange={setPickingDay}
          />
          <Field hidden={pickingDay}>
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
          <FormSheetBody className="@container space-y-5 pt-5">
            {recap}
            <MyPartFields
              billCents={billCents}
              people={people}
              onPeopleChange={setPeople}
              typed={typed}
              onTypedChange={setTyped}
            />
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

/**
 * « Ma part » of an expense someone else paid (#394, the owner's « A »):
 * how many we were (2 · 3 · 4 · 5 · 6+, « 6+ » showing − / + up to 20),
 * my part large below, typed over for an amount of my own (« Autre
 * montant »). Controlled: « Quelqu’un a payé pour moi » and the quick entry (#398) keep
 * `people` (null once a part is typed) and the text typed.
 */
export function MyPartFields({
  billCents,
  people,
  onPeopleChange: setPeople,
  typed,
  onTypedChange: setTyped,
}: {
  billCents: number
  people: number | null
  onPeopleChange: (people: number | null) => void
  typed: string
  onTypedChange: (typed: string) => void
}) {
  const id = useId()
  const mineRef = useRef<HTMLInputElement>(null)
  const mine = myPartCents(billCents, people, typed)
  const mineText = people === null ? typed : mine > 0 ? centsToInput(mine) : ''
  const over = mine > billCents
  return (
    <>
      <div className="space-y-2">
        <p
          id={`${id}-people`}
          className="text-muted-foreground text-center text-sm"
        >
          On était combien, vous compris ?
        </p>
        {/* One row, whatever the width (the owner's « A », #394). */}
        <div
          role="radiogroup"
          aria-labelledby={`${id}-people`}
          className="grid grid-cols-5 gap-2"
        >
          {PEOPLE_TILES.map((count) => {
            const chosen =
              count === PEOPLE_MORE
                ? people !== null && people >= PEOPLE_MORE
                : people === count
            return (
              <button
                key={count}
                type="button"
                role="radio"
                aria-checked={chosen}
                aria-label={
                  count === PEOPLE_MORE ? `${PEOPLE_MORE} ou plus` : `${count}`
                }
                data-state={chosen ? 'on' : 'off'}
                onClick={() =>
                  setPeople(count === PEOPLE_MORE && chosen ? people : count)
                }
                className={cn(
                  CHIP_CLASS,
                  CHIP_ON,
                  'h-11 min-w-0 px-0 text-base tabular-nums',
                )}
              >
                {count === PEOPLE_MORE
                  ? chosen
                    ? people
                    : `${PEOPLE_MORE}+`
                  : count}
              </button>
            )
          })}
        </div>
        {people !== null && people >= PEOPLE_MORE && (
          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="secondary"
              iconOnly
              aria-label="Une personne de moins"
              disabled={people <= PEOPLE_MORE}
              onClick={() => setPeople(Math.max(PEOPLE_MORE, people - 1))}
            >
              <MinusIcon aria-hidden />
            </Button>
            <span className="text-sm tabular-nums" aria-live="polite">
              {people} personnes
            </span>
            <Button
              type="button"
              variant="secondary"
              iconOnly
              aria-label="Une personne de plus"
              disabled={people >= PEOPLE_MAX}
              onClick={() => setPeople(Math.min(PEOPLE_MAX, people + 1))}
            >
              <PlusIcon aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {/* My part, large: the tiles fill it, typing in it sets an
          amount of my own. */}
      <div className="text-center">
        <label
          htmlFor={`${id}-mine`}
          className="text-muted-foreground block text-sm"
        >
          Ma part
        </label>
        <div
          className={cn(
            'flex items-baseline justify-center gap-[0.2em] py-1 leading-tight font-semibold tabular-nums',
            'text-[min(2.5rem,13cqi)]',
            over && 'text-destructive',
          )}
        >
          {/* As wide as its text (a hidden copy sizes it). */}
          <span className="grid">
            <span
              aria-hidden
              className="invisible col-start-1 row-start-1 px-0.5 whitespace-pre"
            >
              {mineText || '0'}
            </span>
            <input
              ref={mineRef}
              id={`${id}-mine`}
              size={1}
              autoComplete="off"
              placeholder="0"
              inputMode="decimal"
              enterKeyHint="done"
              aria-invalid={over || undefined}
              value={mineText}
              onChange={(event) => {
                const next = typedAmount(event.target.value)
                if (next === null) return
                setPeople(null)
                setTyped(next)
              }}
              className="placeholder:text-muted-foreground focus:border-primary col-start-1 row-start-1 w-full min-w-0 border-b-2 border-transparent bg-transparent text-center outline-none"
            />
          </span>
          <span aria-hidden>€</span>
        </div>
        {people !== null && (
          <button
            type="button"
            className="text-primary min-h-11 px-2 text-sm font-medium"
            onClick={() => {
              setTyped(mineText)
              setPeople(null)
              mineRef.current?.focus()
              mineRef.current?.select()
            }}
          >
            Autre montant
          </button>
        )}
      </div>
    </>
  )
}

/** My part in cents: an equal share of the bill, or the amount typed. */
export function myPartCents(
  billCents: number,
  people: number | null,
  typed: string,
): number {
  return people === null
    ? (parseEurosToCents(typed) ?? 0)
    : (myPartOf('equal', billCents, people) ?? 0)
}
