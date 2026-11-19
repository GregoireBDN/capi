import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  NativeSelectOption,
  SegmentedControl,
  SegmentedControlItem,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Switch,
  Textarea,
  cn,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  ManualSuggestionDto,
  MoneyDirection,
  TransactionDto,
  TransactionKind,
} from '#/api/types.gen'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { isTextEntry } from '#/lib/text-entry'
import {
  KIND_LABELS,
  TRANSACTION_KINDS,
} from '#/components/transactions/labels'
import { currentDay } from '#/lib/calendar'
import { pickableCategories } from '#/lib/categories'
import { formatCalendarDate, formatCents } from '#/lib/money'
import {
  accountsQuery,
  ApiRequestError,
  categoriesQuery,
  isTransactional,
} from '#/lib/queries'
import {
  afterManualExpenseChanged,
  createManualExpense,
  deleteManualExpense,
  manualBody,
  manualExpenseErrorMessage,
  manualSuggestionsQuery,
  updateManualExpense,
  voucherDayQuery,
} from './queries'
import {
  MAX_AMOUNT_CENTS,
  amountKeyOf,
  pressAmountKey,
  typedAmount,
} from './amount-entry'
import type { AmountKey } from './amount-entry'
import {
  AccountChips,
  AmountKeypad,
  CategoryDot,
  CategoryChips,
  DateChips,
  HabitGrid,
  previousDay,
  VoucherDayGauge,
} from './manual-fields'
import { splitTransaction } from '#/components/transactions/edits'

const LABEL_MAX = 255
const NOTE_MAX = 2000
/**
 * One height for every control but the amount (44px with the 22px root):
 * fields, menus, chips and buttons line up.
 */
const FIELD_HEIGHT = 'h-8 min-h-8'
/** How long a toast offering "Annuler" stays up. */
const UNDO_TOAST_MS = 8000

/** Error for the amount typed, or null when valid. */
export function expenseAmountError(text: string): string | null {
  if (text.trim() === '') return 'Indiquez un montant'
  const cents = parseEurosToCents(text)
  if (cents === null) return 'Montant invalide (ex. 12 ou 12,50)'
  if (cents <= 0) return 'Le montant doit être supérieur à 0'
  if (cents > MAX_AMOUNT_CENTS) return 'Montant trop élevé'
  return null
}

/** Sign of the amount when the user did not choose one. */
function defaultDirection(kind: TransactionKind): MoneyDirection {
  return kind === 'income' ? 'in' : 'out'
}

/** "Sortie" (money out) or "Entrée" (money in). */
function DirectionSelect({
  id,
  className,
  value,
  onChange,
}: {
  id?: string
  className?: string
  value: MoneyDirection
  onChange: (direction: MoneyDirection) => void
}) {
  return (
    <NativeSelect
      id={id}
      aria-label={id ? undefined : 'Sens'}
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value as MoneyDirection)}
    >
      <NativeSelectOption value="out">Sortie</NativeSelectOption>
      <NativeSelectOption value="in">Entrée</NativeSelectOption>
    </NativeSelect>
  )
}

/** The steps of an entry (#245): one choice per screen. */
const STEPS = ['category', 'amount', 'details'] as const
type Step = (typeof STEPS)[number]
const STEP_NAMES: Record<Step, string> = {
  category: 'Catégorie',
  amount: 'Montant',
  details: 'Détails',
}

/** Income category of the meal-voucher card's credits (#298). */
const MEAL_VOUCHER_CATEGORY_SLUG = 'meal_vouchers'

/** Meal vouchers pay at most 25 € a day (the legal cap, checked by the API). */
export const MEAL_VOUCHER_DAILY_CAP_CENTS = 2_500

/** Expense categories a meal-voucher card pays: « Payé avec » offers it. */
const VOUCHER_PAID_SLUGS: ReadonlySet<string> = new Set([
  'restaurants_cafes',
  'groceries',
])

const TITLES: Record<TransactionKind, [add: string, edit: string]> = {
  expense: ['Ajouter une dépense', 'Modifier la dépense'],
  income: ['Ajouter un revenu', 'Modifier le revenu'],
  transfer: ['Ajouter un virement interne', 'Modifier le virement interne'],
}

interface ManualTransactionSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Category preselected when adding (e.g. the envelope tapped). */
  initialCategoryId?: string
  /** Kind preselected when adding (default: expense). */
  initialKind?: TransactionKind
  /** Account preselected when adding (default: the first checking one). */
  initialAccountId?: string
  /** Categories listed first (the envelopes followed this month). */
  suggestedCategoryIds?: readonly string[]
  /**
   * Account preselected when adding (the account page); the first checking
   * account otherwise.
   */
  initialAccountId?: string
  /** The transaction entered by hand to edit; absent when adding one. */
  expense?: TransactionDto
}

/**
 * Enters a transaction by hand, or edits / deletes one: kind (expense,
 * income, internal transfer), amount (the kind sets the sign; a transfer
 * asks for it), category, label, day (today by default), and under "Plus
 * d'options" the account (the first checking account by default), the sign
 * of an expense or income (a refund), one-off flag and note. The import of
 * the bank export replaces it with the matching bank row. Every save offers
 * "Annuler".
 *
 * In three steps (#245), one choice per screen, with "Suivant" and
 * "Retour": the category (the kind, usual labels with their category, every
 * category as a tile; a tap moves on), the amount, then the details (day,
 * label, options) and "Ajouter". An envelope starts at the amount (its
 * category is chosen), an edit at the details. On phones a bottom sheet of
 * one height whose amount is typed on its own keypad, "Suivant" a key of
 * it: the system keyboard never opens for the amount, and the buttons step
 * aside while the label or note is typed. Elsewhere a dialog: the amount is
 * typed in its field, and Enter moves on, then adds.
 */
export function ManualTransactionSheet({
  open,
  onOpenChange,
  initialCategoryId,
  initialKind = 'expense',
  initialAccountId,
  suggestedCategoryIds = [],
  initialAccountId,
  expense,
}: ManualTransactionSheetProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const categories = useQuery({ ...categoriesQuery, enabled: open })
  const accounts = useQuery({ ...accountsQuery, enabled: open })

  const [kind, setKind] = useState<TransactionKind>(initialKind)
  const [direction, setDirection] = useState<MoneyDirection>(
    defaultDirection(initialKind),
  )
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState('')
  const [label, setLabel] = useState('')
  const [accountId, setAccountId] = useState('')
  const [isOneOff, setIsOneOff] = useState(false)
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [step, setStep] = useState<Step>('category')
  const amountRef = useRef<HTMLInputElement>(null)
  const stepRef = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  /** Phones: the sheet's keypad instead of the system keyboard. */
  const keypad = isMobile
  const today = currentDay()
  const suggestions = useQuery({
    ...manualSuggestionsQuery(kind),
    enabled: open,
  })

  const kindCategories = useMemo(() => {
    const all = pickableCategories(
      categories.data ?? [],
      expense?.categoryId,
    ).filter((category) => category.kind === kind)
    // The envelopes first, then the kind's most used, then by name.
    const ordered = [
      ...suggestedCategoryIds,
      ...(suggestions.data?.categoryIds ?? []),
    ]
    const rank = (categoryKey: string) => {
      const index = ordered.indexOf(categoryKey)
      return index === -1 ? ordered.length : index
    }
    return [...all].sort(
      (a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'fr'),
    )
  }, [
    categories.data,
    expense?.categoryId,
    suggestedCategoryIds,
    suggestions.data?.categoryIds,
    kind,
  ])

  // A new expense gets the category most used for the kind (else the first
  // listed), once the most used are known or failed to load.
  const defaultCategoryId = useMemo(() => {
    if (suggestions.isPending || kindCategories.length === 0) return null
    const mostUsed = suggestions.data?.categoryIds.find((categoryKey) =>
      kindCategories.some((category) => category.id === categoryKey),
    )
    return mostUsed ?? kindCategories[0].id
  }, [suggestions.isPending, suggestions.data, kindCategories])

  const cashAccounts = useMemo(
    () =>
      (accounts.data ?? []).filter(
        (account) =>
          isTransactional(account) &&
          (!account.archivedAt || account.id === expense?.accountId),
      ),
    [accounts.data, expense?.accountId],
  )

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    const startKind = expense?.kind ?? initialKind
    setKind(startKind)
    setDirection(
      expense
        ? expense.amountCents > 0
          ? 'in'
          : 'out'
        : defaultDirection(startKind),
    )
    setAmount(expense ? centsToInput(Math.abs(expense.amountCents)) : '')
    setCategoryId(
      expense ? (expense.categoryId ?? '') : (initialCategoryId ?? ''),
    )
    setDate(expense?.bookingDate ?? currentDay())
    // A label left to its default (the category name) shows as empty.
    setLabel(
      expense && expense.rawLabel !== expense.category?.name
        ? expense.rawLabel
        : '',
    )
    setAccountId(expense?.accountId ?? initialAccountId ?? '')
    setIsOneOff(expense?.isOneOff ?? false)
    setNote(expense?.note ?? '')
    // Optional fields already used stay in view when editing.
    setMoreOpen(
      expense !== undefined &&
        (expense.isOneOff ||
          expense.note !== null ||
          (expense.kind !== 'transfer' &&
            expense.amountCents > 0 !== (expense.kind === 'income'))),
    )
    // An envelope already says the category; an edit starts at the end.
    setStep(expense ? 'details' : initialCategoryId ? 'amount' : 'category')
    setSubmitted(false)
  }, [open, expense, initialCategoryId, initialKind, initialAccountId])

  // An expense needs a category: the most used one by default.
  // Other kinds may stay without one (the review queue). Functional updates:
  // the reset above may have set a value in the same commit, which must win.
  useEffect(() => {
    if (!open || kind !== 'expense' || defaultCategoryId === null) return
    if (expense && expense.kind === 'expense' && !expense.categoryId) return
    setCategoryId((current) => current || defaultCategoryId)
  }, [open, kind, defaultCategoryId, expense])
  useEffect(() => {
    if (!open || cashAccounts.length === 0) return
    const preferred =
      cashAccounts.find((account) => account.type === 'checking') ??
      cashAccounts[0]
    setAccountId((current) => current || preferred.id)
  }, [open, cashAccounts])

  function changeKind(next: TransactionKind) {
    setKind(next)
    setDirection(defaultDirection(next))
    // A category of another kind no longer fits.
    setCategoryId((current) =>
      categories.data?.find((category) => category.id === current)?.kind ===
      next
        ? current
        : '',
    )
  }

  // A new expense needs a category; other kinds may go to the review queue,
  // and an expense entered without one may stay so.
  const allowNoCategory =
    kind !== 'expense' || (expense?.kind === 'expense' && !expense.categoryId)

  const categoryOf = (categoryKey: string) =>
    kindCategories.find((category) => category.id === categoryKey)

  // The meal-voucher card (#298): its credit goes on it at once, and the
  // categories it pays offer it as « Payé avec ».
  const voucherAccounts = cashAccounts.filter(
    (account) => account.type === 'meal_voucher' && !account.archivedAt,
  )
  function chooseAccountFor(categoryKey: string) {
    if (expense || voucherAccounts.length === 0) return
    if (categoryOf(categoryKey)?.slug === MEAL_VOUCHER_CATEGORY_SLUG) {
      setAccountId(voucherAccounts[0].id)
    }
  }

  // A usual label fills its category too, and moves on to the amount when
  // that leaves a category (or the kind may go without one).
  function pickSuggestion(item: ManualSuggestionDto) {
    setLabel(item.label)
    const usual =
      item.categoryId &&
      kindCategories.some((category) => category.id === item.categoryId)
        ? item.categoryId
        : null
    if (usual) {
      setCategoryId(usual)
      chooseAccountFor(usual)
    }
    if (usual || categoryId || allowNoCategory) setStep('amount')
  }

  // What "Plus d'options" holds when closed, so nothing is set unseen.
  const chosenAccount = cashAccounts.find((option) => option.id === accountId)
  const defaultAccountId = (
    cashAccounts.find((option) => option.type === 'checking') ??
    cashAccounts.at(0)
  )?.id
  const chosenSlug = categoryOf(categoryId)?.slug
  const paidWithShown =
    voucherAccounts.length > 0 &&
    kind !== 'transfer' &&
    (chosenAccount?.type === 'meal_voucher' ||
      (chosenSlug !== undefined &&
        (kind === 'expense'
          ? VOUCHER_PAID_SLUGS.has(chosenSlug)
          : chosenSlug === MEAL_VOUCHER_CATEGORY_SLUG)))
  const paidWithAccounts = [
    ...new Map(
      [
        cashAccounts.find((option) => option.id === defaultAccountId),
        chosenAccount,
        ...voucherAccounts,
      ]
        .filter((option) => option !== undefined)
        .map((option) => [option.id, option] as const),
    ).values(),
  ]
  const moreSummary = [
    !paidWithShown &&
    cashAccounts.length > 1 &&
    chosenAccount &&
    chosenAccount.id !== defaultAccountId
      ? chosenAccount.name
      : null,
    kind !== 'transfer' && direction !== defaultDirection(kind)
      ? direction === 'in'
        ? 'Entrée'
        : 'Sortie'
      : null,
    isOneOff ? 'Ponctuelle' : null,
    note.trim() ? 'Note' : null,
  ]
    .filter(Boolean)
    .join(', ')

  const amountError = expenseAmountError(amount)
  const dateError =
    date === ''
      ? 'Indiquez une date'
      : date > today
        ? 'La date ne peut pas être dans le futur'
        : null
  // A payment with the card (#298): what it can still pay that day under
  // the 25 € cap (the day's other payments counted, this one's previous
  // version left out), shown while the amount is typed and refused over it.
  const onVoucher =
    chosenAccount?.type === 'meal_voucher' &&
    kind === 'expense' &&
    direction === 'out'
  const voucherDayKey = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today
  const voucherDay = useQuery({
    ...voucherDayQuery(accountId, voucherDayKey),
    enabled: open && onVoucher,
  })
  const voucherPaid = (voucherDay.data ?? [])
    .filter((payment) => payment.id !== expense?.id)
    .reduce((total, payment) => total + payment.cents, 0)
  const voucherLeft = Math.max(0, MEAL_VOUCHER_DAILY_CAP_CENTS - voucherPaid)
  const voucherWhen =
    voucherDayKey === today
      ? 'aujourd’hui'
      : voucherDayKey === previousDay(today)
        ? 'hier'
        : `le ${formatCalendarDate(voucherDayKey)}`
  const typedCents = parseEurosToCents(amount) ?? 0
  // Over what is left: « Ajouter » is greyed out and the gauge says why.
  const voucherOver = onVoucher && typedCents > voucherLeft
  const voucherGauge = onVoucher && voucherDay.isSuccess && (
    <VoucherDayGauge
      capCents={MEAL_VOUCHER_DAILY_CAP_CENTS}
      paidCents={voucherPaid}
      amountCents={typedCents}
      when={voucherWhen}
    />
  )
  const labelError =
    !categoryId && label.trim() === ''
      ? 'Sans catégorie, indiquez un libellé'
      : null

  function undoToast(message: string, undo: () => Promise<unknown>) {
    toast.success(message, {
      duration: UNDO_TOAST_MS,
      action: {
        label: 'Annuler',
        onClick: () =>
          void undo()
            .then(() => afterManualExpenseChanged(queryClient))
            .catch(() => toast.error('Impossible d’annuler la modification.')),
      },
    })
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        amountCents: parseEurosToCents(amount)!,
        kind,
        direction,
        categoryId: categoryId || null,
        bookingDate: date,
        label: label.trim() || null,
        accountId,
        isOneOff,
        note: note.trim() || null,
      }
      return expense
        ? updateManualExpense(expense.id, body)
        : createManualExpense(body)
    },
    onSuccess: async (saved) => {
      if (expense) {
        const previous = expense
        undoToast('Opération modifiée', () =>
          updateManualExpense(previous.id, manualBody(previous)),
        )
      } else {
        undoToast(
          `Opération ajoutée : ${formatCents(saved.amountCents)}${
            saved.category ? ` en ${saved.category.name}` : ''
          }`,
          () => deleteManualExpense(saved.id),
        )
      }
      onOpenChange(false)
      await afterManualExpenseChanged(queryClient)
    },
    onError: (error) => {
      // Over the card's daily cap (another payment of the day entered
      // elsewhere): refreshed, the day's total shows the error in place.
      if (
        error instanceof ApiRequestError &&
        error.apiMessage?.includes('capped at 25')
      ) {
        void voucherDay.refetch()
        return
      }
      toast.error(manualExpenseErrorMessage(error))
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteManualExpense(expense!.id),
    onSuccess: async () => {
      const previous = expense!
      undoToast('Opération supprimée', async () => {
        // Back with a new id, and its split if it had one.
        const created = await createManualExpense(manualBody(previous))
        if (previous.splits.length > 0) {
          await splitTransaction(created.id, previous.splits)
        }
      })
      setConfirmOpen(false)
      onOpenChange(false)
      await afterManualExpenseChanged(queryClient)
    },
    onError: (error) => toast.error(manualExpenseErrorMessage(error)),
  })

  // "Suivant" (and Enter) moves on; the last step saves, back to the first
  // step that still lacks something.
  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (step === 'category') {
      if (categoryId || allowNoCategory) setStep('amount')
      return
    }
    if (step === 'amount') {
      if (amountError) setSubmitted(true)
      else setStep('details')
      return
    }
    setSubmitted(true)
    if (kind === 'expense' && !categoryId) return setStep('category')
    if (amountError) return setStep('amount')
    if (amountError || dateError || labelError || voucherOver || !accountId)
      return
    if (kind === 'expense' && !categoryId) return
    save.mutate()
  }

  const showAmountError = submitted && amountError !== null
  const showDateError = submitted && dateError !== null
  const showLabelError = submitted && labelError !== null
  const noAccount = accounts.isSuccess && cashAccounts.length === 0
  const [addTitle, editTitle] = TITLES[kind]

  const sign = direction === 'in' ? '+' : '−'
  const chosenCategory = categoryOf(categoryId)
  const categoryText =
    chosenCategory?.name ?? (allowNoCategory ? 'Sans catégorie' : null)
  const amountText = `${sign} ${amount || '0'} €`
  const stepIndex = STEPS.indexOf(step)

  // Each step starts on its heading (read out by screen readers), the
  // amount field on a computer, so typing goes straight to it.
  function focusStep() {
    if (step === 'amount' && !keypad) {
      amountRef.current?.focus({ preventScroll: true })
    } else {
      stepRef.current?.focus({ preventScroll: true })
    }
  }
  // On a step change, right in the commit that shows it: a later frame
  // could take the focus from a field the user already taps or types in.
  // The opening is focused by the sheet or dialog (its content mounts a
  // render later).
  useEffect(() => {
    if (!open) return
    if (step === 'amount' && !keypad) {
      amountRef.current?.focus({ preventScroll: true })
    } else {
      stepRef.current?.focus({ preventScroll: true })
    }
  }, [open, step, keypad])

  function press(key: AmountKey) {
    setAmount((current) => pressAmountKey(current, key))
  }

  function chooseCategory(next: string) {
    setCategoryId(next)
    chooseAccountFor(next)
    setStep('amount')
  }

  // On the amount step, digits typed anywhere go to the amount; Enter moves
  // on (or adds); never while typing in a field.
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const target = event.target as Element
    if (isTextEntry(target) || target instanceof HTMLSelectElement) return
    const key = step === 'amount' ? amountKeyOf(event.key) : null
    if (key) {
      event.preventDefault()
      press(key)
    } else if (
      event.key === 'Enter' &&
      !(target instanceof HTMLButtonElement)
    ) {
      event.preventDefault()
      formRef.current?.requestSubmit()
    }
  }

  const Title = isMobile ? SheetTitle : DialogTitle
  const Description = isMobile ? SheetDescription : DialogDescription
  const submitLabel = expense ? 'Enregistrer' : 'Ajouter'
  const nextDisabled = step === 'category' && !categoryId && !allowNoCategory
  const saveDisabled =
    (kind === 'expense' && !categoryId) || !accountId || voucherOver

  /** What the earlier steps chose, at the top of the later ones. */
  const recap = (
    <p className="text-muted-foreground flex min-w-0 items-center justify-center gap-1.5 text-sm">
      {chosenCategory && <CategoryDot color={chosenCategory.color} />}
      <span className="truncate">
        {[categoryText, label.trim() || null].filter(Boolean).join(' · ')}
      </span>
    </p>
  )

  const footer = (
    // Phones: never floating over the keyboard (#245), so it steps aside
    // while the label or the note is typed; "OK" closes the keyboard.
    <div className="flex shrink-0 gap-2 border-t px-4 py-3 group-data-keyboard-open/sheet:hidden">
      {step === 'details' && expense && (
        <Button
          type="button"
          variant="danger"
          outline
          className={FIELD_HEIGHT}
          onClick={() => setConfirmOpen(true)}
        >
          Supprimer
        </Button>
      )}
      <Button
        type="submit"
        className={cn('flex-1 font-medium', FIELD_HEIGHT)}
        loading={step === 'details' && save.isPending}
        disabled={step === 'details' ? saveDisabled : nextDisabled}
      >
        {step === 'details' ? (
          submitLabel
        ) : (
          <>
            Suivant
            <ChevronRightIcon aria-hidden />
          </>
        )}
      </Button>
    </div>
  )

  const form = (
    <form
      ref={formRef}
      noValidate
      onSubmit={submit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <Title className="sr-only">{expense ? editTitle : addTitle}</Title>
      <Description className="sr-only">
        L’import du relevé la remplacera.
      </Description>

      {/* Where we are, and the way back; clear of the close button. */}
      <div className="flex min-h-14 items-center gap-1 py-2 pr-12 pl-2">
        {stepIndex > 0 ? (
          <Button
            type="button"
            ghost
            variant="secondary"
            onClick={() => setStep(STEPS[stepIndex - 1])}
          >
            <ChevronLeftIcon aria-hidden />
            Retour
          </Button>
        ) : (
          <span className="w-2" />
        )}
        <h3
          ref={stepRef}
          tabIndex={-1}
          className="min-w-0 flex-1 truncate text-base font-semibold outline-none"
        >
          {STEP_NAMES[step]}
          <span className="text-muted-foreground ml-1.5 text-sm font-normal">
            {stepIndex + 1}/{STEPS.length}
          </span>
        </h3>
      </div>

      {step === 'category' && (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4">
            {/* Three labels on a 320px phone: sized on the row's width. */}
            <div className="@container">
              <SegmentedControl
                fullWidth
                aria-label="Type"
                value={kind}
                onValueChange={changeKind}
              >
                {TRANSACTION_KINDS.map((option) => (
                  <SegmentedControlItem
                    key={option}
                    value={option}
                    className="px-1 text-[min(0.875rem,4.5cqi)]"
                  >
                    {option === 'transfer' ? 'Virement' : KIND_LABELS[option]}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            </div>

            {kind === 'transfer' && (
              <SegmentedControl
                fullWidth
                aria-label="Sens"
                value={direction}
                onValueChange={setDirection}
              >
                <SegmentedControlItem value="out">Sortie</SegmentedControlItem>
                <SegmentedControlItem value="in">Entrée</SegmentedControlItem>
              </SegmentedControl>
            )}

            {(suggestions.data?.items.length ?? 0) > 0 && (
              <section className="space-y-1.5">
                <p
                  id={`${id}-habits`}
                  className="text-muted-foreground text-xs font-medium"
                >
                  Habituels
                </p>
                <HabitGrid
                  labelId={`${id}-habits`}
                  items={suggestions.data?.items ?? []}
                  label={label}
                  category={categoryOf}
                  onPick={pickSuggestion}
                />
              </section>
            )}

            <section className="space-y-1.5">
              <p
                id={`${id}-categories`}
                className="text-muted-foreground text-xs font-medium"
              >
                Catégorie
              </p>
              <CategoryChips
                labelId={`${id}-categories`}
                categories={kindCategories}
                value={categoryId}
                allowNone={allowNoCategory}
                onChoose={chooseCategory}
              />
            </section>
          </div>
          {footer}
        </>
      )}

      {step === 'amount' && (
        <>
          {/* The one focal point: the amount. */}
          <div className="@container flex flex-1 flex-col justify-center px-4 pt-2 pb-5 text-center">
            {recap}
            <label htmlFor={`${id}-amount`} className="sr-only">
              Montant
            </label>
            <div
              className={cn(
                'flex items-baseline justify-center gap-[0.2em] py-2 leading-tight font-semibold tabular-nums',
                'text-[min(2.75rem,14cqi)]',
                amount === '' && 'text-muted-foreground',
                showAmountError && 'text-destructive',
              )}
            >
              <span aria-hidden>{sign}</span>
              {/* As wide as its text (a hidden copy sizes it). */}
              <span className="grid">
                <span
                  aria-hidden
                  className="invisible col-start-1 row-start-1 px-0.5 whitespace-pre"
                >
                  {amount || '0'}
                </span>
                <input
                  ref={amountRef}
                  id={`${id}-amount`}
                  size={1}
                  autoComplete="off"
                  placeholder="0"
                  value={amount}
                  aria-invalid={showAmountError}
                  aria-describedby={
                    showAmountError ? `${id}-amount-error` : undefined
                  }
                  // Phones type on the keypad: the field only shows the
                  // amount and never opens the system keyboard.
                  readOnly={keypad}
                  tabIndex={keypad ? -1 : undefined}
                  inputMode={keypad ? 'none' : 'decimal'}
                  enterKeyHint="next"
                  className={cn(
                    'col-start-1 row-start-1 w-full min-w-0 bg-transparent text-center outline-none placeholder:text-muted-foreground',
                    keypad
                      ? 'pointer-events-none'
                      : 'border-b-2 border-transparent focus:border-primary',
                  )}
                  onChange={(event) => {
                    const next = typedAmount(event.target.value)
                    if (next !== null) setAmount(next)
                  }}
                />
              </span>
              <span aria-hidden>€</span>
            </div>
            {showAmountError ? (
              <FieldError id={`${id}-amount-error`} className="text-center">
                {amountError}
              </FieldError>
            ) : (
              voucherGauge && (
                <div className="mx-auto w-full max-w-64 pt-1">
                  {voucherGauge}
                </div>
              )
            )}
          </div>
          {keypad ? (
            <div className="bg-muted/60 shrink-0 border-t p-1.5">
              <AmountKeypad
                onKey={press}
                submitLabel="Suivant"
                submitIcon="next"
                loading={false}
                disabled={false}
              />
            </div>
          ) : (
            footer
          )}
        </>
      )}

      {step === 'details' && (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4">
            <div className="text-center">
              <p
                className={cn(
                  'text-2xl font-semibold tabular-nums',
                  showAmountError && 'text-destructive',
                )}
              >
                {amountText}
              </p>
              {recap}
            </div>

            <Field data-invalid={showDateError}>
              <DateChips
                value={date}
                today={today}
                invalid={showDateError}
                onChange={setDate}
              />
              {showDateError && <FieldError>{dateError}</FieldError>}
            </Field>

            {paidWithShown && (
              <Field>
                <FieldLabel id={`${id}-paid-with`}>
                  {kind === 'income' ? 'Crédité sur' : 'Payé avec'}
                </FieldLabel>
                <AccountChips
                  labelId={`${id}-paid-with`}
                  accounts={paidWithAccounts}
                  value={accountId}
                  onChange={setAccountId}
                />
                {voucherGauge && <div className="pt-1">{voucherGauge}</div>}
              </Field>
            )}

            <Field data-invalid={showLabelError}>
              <FieldLabel htmlFor={`${id}-label`}>Libellé</FieldLabel>
              <Input
                id={`${id}-label`}
                className={FIELD_HEIGHT}
                autoComplete="off"
                enterKeyHint="done"
                maxLength={LABEL_MAX}
                placeholder={categoryId ? 'Facultatif' : 'Par ex. « ciné »'}
                value={label}
                aria-invalid={showLabelError}
                onChange={(event) => setLabel(event.target.value)}
                onKeyDown={(event) => {
                  // "OK" on a phone closes the keyboard, back to the button.
                  if (keypad && event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                }}
              />
              {showLabelError && <FieldError>{labelError}</FieldError>}
            </Field>

            {noAccount && (
              <FieldDescription>
                Ajoutez d’abord un compte courant pour saisir une opération.
              </FieldDescription>
            )}

            <div>
              <Button
                type="button"
                ghost
                variant="secondary"
                className="px-0"
                aria-expanded={moreOpen}
                aria-controls={moreOpen ? `${id}-more` : undefined}
                onClick={() => setMoreOpen((current) => !current)}
              >
                <ChevronDownIcon
                  aria-hidden
                  className={cn(
                    'transition-transform motion-reduce:transition-none',
                    moreOpen && 'rotate-180',
                  )}
                />
                Plus d’options
                {!moreOpen && moreSummary && (
                  <span className="text-muted-foreground font-normal">
                    · {moreSummary}
                  </span>
                )}
              </Button>
              {moreOpen && (
                <div id={`${id}-more`} className="space-y-3 pt-2">
                  {cashAccounts.length > 1 && (
                    <Field>
                      <FieldLabel htmlFor={`${id}-account`}>Compte</FieldLabel>
                      <NativeSelect
                        id={`${id}-account`}
                        className="w-full"
                        value={accountId}
                        onChange={(event) => setAccountId(event.target.value)}
                      >
                        {cashAccounts.map((account) => (
                          <NativeSelectOption
                            key={account.id}
                            value={account.id}
                          >
                            {account.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}

                  {kind !== 'transfer' && (
                    <Field>
                      <FieldLabel htmlFor={`${id}-direction`}>Sens</FieldLabel>
                      <DirectionSelect
                        id={`${id}-direction`}
                        className="w-full"
                        value={direction}
                        onChange={setDirection}
                      />
                      <FieldDescription>
                        {kind === 'expense'
                          ? 'Entrée pour un remboursement.'
                          : 'Sortie pour un revenu rendu ou corrigé.'}
                      </FieldDescription>
                    </Field>
                  )}

                  <div className="flex min-h-11 items-center justify-between gap-3">
                    <label htmlFor={`${id}-one-off`} className="text-sm">
                      Ponctuelle
                      <span className="text-muted-foreground block text-xs">
                        Exclue des moyennes et des abonnements
                      </span>
                    </label>
                    <Switch
                      id={`${id}-one-off`}
                      checked={isOneOff}
                      onCheckedChange={setIsOneOff}
                    />
                  </div>

                  <Field>
                    <FieldLabel htmlFor={`${id}-note`}>Note</FieldLabel>
                    <Textarea
                      id={`${id}-note`}
                      rows={2}
                      maxLength={NOTE_MAX}
                      placeholder="Facultatif"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </Field>
                </div>
              )}
            </div>
          </div>
          {footer}
        </>
      )}
    </form>
  )

  return (
    <>
      {isMobile ? (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent
            side="bottom"
            className={cn(
              // One height for every step, so "Suivant" stays put.
              'gap-0 rounded-t-xl data-[side=bottom]:h-[min(30rem,calc(92svh-var(--keyboard-inset,0px)))]',
              // While the label or note is typed, every pixel above the
              // keyboard up to the status bar.
              'data-[side=bottom]:data-keyboard-open:h-[calc(100svh-var(--keyboard-inset,0px)-env(safe-area-inset-top)-0.5rem)]',
            )}
            onKeyDown={onKeyDown}
            onOpenAutoFocus={(event) => {
              // The step's heading, never a field: no system keyboard.
              event.preventDefault()
              focusStep()
            }}
          >
            {form}
          </SheetContent>
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent
            className="flex h-[min(30rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
            onKeyDown={onKeyDown}
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              focusStep()
            }}
          >
            {form}
          </DialogContent>
        </Dialog>
      )}
      {expense && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Supprimer cette opération ?"
          description={`${formatCents(expense.amountCents)} saisis à la main le ${formatCalendarDate(expense.bookingDate)}. Vous pourrez annuler juste après.`}
          confirmLabel="Supprimer"
          variant="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  )
}
