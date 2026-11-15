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
  NativeSelect,
  NativeSelectOption,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  cn,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDownIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  ManualSuggestionDto,
  MoneyDirection,
  TransactionDto,
  TransactionKind,
} from '#/api/types.gen'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import {
  KIND_LABELS,
  TRANSACTION_KINDS,
} from '#/components/transactions/labels'
import { currentDay } from '#/lib/calendar'
import { pickableCategories } from '#/lib/categories'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { accountsQuery, categoriesQuery, isTransactional } from '#/lib/queries'
import {
  afterManualExpenseChanged,
  createManualExpense,
  deleteManualExpense,
  manualBody,
  manualExpenseErrorMessage,
  manualSuggestionsQuery,
  updateManualExpense,
} from './queries'
import { DateChips, HabitChips } from './manual-fields'
import { splitTransaction } from '#/components/transactions/edits'

const LABEL_MAX = 255
const NOTE_MAX = 2000
/** Highest amount the API accepts (1 000 000 €). */
const MAX_CENTS = 100_000_000
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
  if (cents > MAX_CENTS) return 'Montant trop élevé'
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
  /** Categories listed first (the envelopes followed this month). */
  suggestedCategoryIds?: readonly string[]
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
 * "Annuler". A bottom sheet on phones, a side sheet otherwise.
 *
 * Mobile-first (#196): the amount comes first and is focused, categories
 * and days are chips, labels used before are suggested (with their usual
 * category), and the actions stay at the bottom, above the keyboard.
 */
export function ManualTransactionSheet({
  open,
  onOpenChange,
  initialCategoryId,
  initialKind = 'expense',
  suggestedCategoryIds = [],
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
  const amountRef = useRef<HTMLInputElement>(null)
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
    const rank = (categoryKey: string) => {
      const index = suggestedCategoryIds.indexOf(categoryKey)
      return index === -1 ? suggestedCategoryIds.length : index
    }
    return [...all].sort(
      (a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'fr'),
    )
  }, [categories.data, expense?.categoryId, suggestedCategoryIds, kind])

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
    setAccountId(expense?.accountId ?? '')
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
    setSubmitted(false)
  }, [open, expense, initialCategoryId, initialKind])

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

  const categoryName = (categoryKey: string) =>
    kindCategories.find((category) => category.id === categoryKey)?.name

  function pickSuggestion(item: ManualSuggestionDto) {
    setLabel(item.label)
    if (
      item.categoryId &&
      kindCategories.some((category) => category.id === item.categoryId)
    ) {
      setCategoryId(item.categoryId)
    }
  }

  // What "Plus d'options" holds when closed, so nothing is set unseen.
  const chosenAccount = cashAccounts.find((option) => option.id === accountId)
  const defaultAccountId = (
    cashAccounts.find((option) => option.type === 'checking') ??
    cashAccounts.at(0)
  )?.id
  const moreSummary = [
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
    onError: (error) => toast.error(manualExpenseErrorMessage(error)),
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

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (amountError || dateError || labelError || !accountId) return
    if (kind === 'expense' && !categoryId) return
    save.mutate()
  }

  const showAmountError = submitted && amountError !== null
  const showDateError = submitted && dateError !== null
  const showLabelError = submitted && labelError !== null
  const noAccount = accounts.isSuccess && cashAccounts.length === 0
  const [addTitle, editTitle] = TITLES[kind]

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={cn(
            // The fields scroll; the actions stay at the bottom, above the
            // on-screen keyboard (see `Sheet`).
            'gap-0',
            isMobile &&
              'max-h-[calc(90svh-var(--keyboard-inset,0px))] rounded-t-xl',
            // With the keyboard open, every pixel above it up to the status
            // bar: the amount being typed must stay in view (#205).
            isMobile &&
              'data-keyboard-open:max-h-[calc(100svh-var(--keyboard-inset,0px)-env(safe-area-inset-top)-0.5rem)]',
          )}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            amountRef.current?.focus({ preventScroll: true })
          }}
        >
          <form
            noValidate
            onSubmit={submit}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
              <SheetHeader className="pr-14 pb-2 group-data-keyboard-open/sheet:pb-1">
                <SheetTitle>{expense ? editTitle : addTitle}</SheetTitle>
                {/* Not while typing: room for the fields (#205). */}
                <SheetDescription className="group-data-keyboard-open/sheet:sr-only">
                  L’import du relevé la remplacera.
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-3 px-4 pb-4">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  aria-label="Type"
                  className="w-full"
                  value={kind}
                  onValueChange={(value) => {
                    if (value) changeKind(value as TransactionKind)
                  }}
                >
                  {TRANSACTION_KINDS.map((option) => (
                    <ToggleGroupItem
                      key={option}
                      value={option}
                      className="flex-1"
                    >
                      {option === 'transfer' ? 'Virement' : KIND_LABELS[option]}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>

                <Field data-invalid={showAmountError}>
                  <FieldLabel htmlFor={`${id}-amount`} className="sr-only">
                    Montant
                  </FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    <InputGroup className="h-12 min-w-[7rem] flex-1">
                      <InputGroupAddon>
                        <InputGroupText
                          aria-hidden
                          className="text-2xl font-semibold"
                        >
                          {direction === 'in' ? '+' : '−'}
                        </InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        ref={amountRef}
                        id={`${id}-amount`}
                        inputMode="decimal"
                        enterKeyHint="next"
                        autoComplete="off"
                        placeholder="0,00"
                        className="h-full text-2xl font-semibold tabular-nums md:text-2xl"
                        value={amount}
                        aria-invalid={showAmountError}
                        onChange={(event) => setAmount(event.target.value)}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText className="text-xl">€</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                    {kind === 'transfer' && (
                      <DirectionSelect
                        className="[&>select]:h-12"
                        value={direction}
                        onChange={setDirection}
                      />
                    )}
                  </div>
                  {showAmountError && <FieldError>{amountError}</FieldError>}
                </Field>

                <div className="space-y-1.5">
                  <p
                    id={`${id}-habits`}
                    className="text-muted-foreground text-sm"
                  >
                    Habituels
                  </p>
                  <HabitChips
                    labelId={`${id}-habits`}
                    items={suggestions.data?.items ?? []}
                    label={label}
                    categoryName={categoryName}
                    onPick={pickSuggestion}
                  />
                </div>

                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
                  <FieldLabel htmlFor={`${id}-category`}>Catégorie</FieldLabel>
                  <NativeSelect
                    id={`${id}-category`}
                    className="w-full"
                    value={categoryId}
                    disabled={!categories.isSuccess}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    {allowNoCategory && (
                      <NativeSelectOption value="">
                        Sans catégorie
                      </NativeSelectOption>
                    )}
                    {kindCategories.map((category) => (
                      <NativeSelectOption key={category.id} value={category.id}>
                        {category.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>

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
                  />
                  {showLabelError && (
                    <FieldError className="col-start-2">
                      {labelError}
                    </FieldError>
                  )}
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
                    className="-ml-2.5"
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
                          <FieldLabel htmlFor={`${id}-account`}>
                            Compte
                          </FieldLabel>
                          <NativeSelect
                            id={`${id}-account`}
                            className="w-full"
                            value={accountId}
                            onChange={(event) =>
                              setAccountId(event.target.value)
                            }
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
                          <FieldLabel htmlFor={`${id}-direction`}>
                            Sens
                          </FieldLabel>
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
            </div>

            <div className="bg-popover flex shrink-0 gap-2 border-t px-4 py-2.5">
              {expense && (
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
                loading={save.isPending}
                disabled={(kind === 'expense' && !categoryId) || !accountId}
              >
                {expense ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
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
