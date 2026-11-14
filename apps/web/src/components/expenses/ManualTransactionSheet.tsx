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
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type {
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
  updateManualExpense,
} from './queries'
import { splitTransaction } from '#/components/transactions/edits'

const LABEL_MAX = 255
const NOTE_MAX = 2000
/** Highest amount the API accepts (1 000 000 €). */
const MAX_CENTS = 100_000_000
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
 * income, internal transfer), amount and direction, category, day (today by
 * default), label, account (the first checking account by default), one-off
 * flag and note. The import of the bank export replaces it with the matching
 * bank row. Every save offers "Annuler". A bottom sheet on phones, a side
 * sheet otherwise.
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
  const today = currentDay()

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
    setSubmitted(false)
  }, [open, expense, initialCategoryId, initialKind])

  // An expense needs a category: the first one offered by default. Other
  // kinds may stay without one (the review queue). Functional updates: the
  // reset above may have set a value in the same commit, which must win.
  useEffect(() => {
    if (!open || kind !== 'expense' || kindCategories.length === 0) return
    if (expense && expense.kind === 'expense' && !expense.categoryId) return
    setCategoryId((current) => current || kindCategories[0].id)
  }, [open, kind, kindCategories, expense])
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
          className={
            isMobile
              ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
              : 'overflow-y-auto'
          }
        >
          <SheetHeader className="pb-0">
            <SheetTitle>{expense ? editTitle : addTitle}</SheetTitle>
            <SheetDescription>
              Saisie à la main en attendant le relevé : l’import la remplacera
              par l’opération de la banque, en gardant sa catégorie.
            </SheetDescription>
          </SheetHeader>
          <form noValidate onSubmit={submit} className="space-y-4 px-4 pb-6">
            <Field>
              <FieldLabel id={`${id}-kind`}>Type</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                aria-labelledby={`${id}-kind`}
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
            </Field>

            <Field data-invalid={showAmountError}>
              <FieldLabel htmlFor={`${id}-amount`}>Montant</FieldLabel>
              <div className="flex flex-wrap gap-2">
                <InputGroup className="min-w-[7rem] flex-1">
                  <InputGroupInput
                    id={`${id}-amount`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="12,50"
                    value={amount}
                    aria-invalid={showAmountError}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>€</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                <NativeSelect
                  aria-label="Sens"
                  value={direction}
                  onChange={(event) =>
                    setDirection(event.target.value as MoneyDirection)
                  }
                >
                  <NativeSelectOption value="out">Sortie</NativeSelectOption>
                  <NativeSelectOption value="in">Entrée</NativeSelectOption>
                </NativeSelect>
              </div>
              {showAmountError && <FieldError>{amountError}</FieldError>}
            </Field>

            <Field>
              <FieldLabel htmlFor={`${id}-category`}>Catégorie</FieldLabel>
              <NativeSelect
                id={`${id}-category`}
                className="w-full"
                value={categoryId}
                disabled={!categories.isSuccess}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                {(kind !== 'expense' ||
                  (expense?.kind === 'expense' && !expense.categoryId)) && (
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
            </Field>

            <Field data-invalid={showDateError}>
              <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
              <Input
                id={`${id}-date`}
                type="date"
                max={today}
                value={date}
                aria-invalid={showDateError}
                onChange={(event) => setDate(event.target.value)}
              />
              {showDateError && <FieldError>{dateError}</FieldError>}
            </Field>

            <Field data-invalid={showLabelError}>
              <FieldLabel htmlFor={`${id}-label`}>Libellé</FieldLabel>
              <Input
                id={`${id}-label`}
                autoComplete="off"
                maxLength={LABEL_MAX}
                placeholder={
                  categoryId
                    ? 'Facultatif, par ex. « ciné »'
                    : 'Par ex. « ciné »'
                }
                value={label}
                aria-invalid={showLabelError}
                onChange={(event) => setLabel(event.target.value)}
              />
              {showLabelError && <FieldError>{labelError}</FieldError>}
            </Field>

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
                    <NativeSelectOption key={account.id} value={account.id}>
                      {account.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {noAccount && (
              <FieldDescription>
                Ajoutez d’abord un compte courant pour saisir une opération.
              </FieldDescription>
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

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {expense && (
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
