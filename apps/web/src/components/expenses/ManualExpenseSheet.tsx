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
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { TransactionDto } from '#/api/types.gen'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { currentDay } from '#/lib/calendar'
import { pickableCategories } from '#/lib/categories'
import { formatCalendarDate, formatCents } from '#/lib/money'
import { accountsQuery, categoriesQuery, isTransactional } from '#/lib/queries'
import {
  afterManualExpenseChanged,
  createManualExpense,
  deleteManualExpense,
  manualExpenseErrorMessage,
  updateManualExpense,
} from './queries'

const LABEL_MAX = 255
/** Highest amount the API accepts (1 000 000 €). */
const MAX_CENTS = 100_000_000

/** Error for the amount typed, or null when valid. */
export function expenseAmountError(text: string): string | null {
  if (text.trim() === '') return 'Indiquez un montant'
  const cents = parseEurosToCents(text)
  if (cents === null) return 'Montant invalide (ex. 12 ou 12,50)'
  if (cents <= 0) return 'Le montant doit être supérieur à 0'
  if (cents > MAX_CENTS) return 'Montant trop élevé'
  return null
}

interface ManualExpenseSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Category preselected when adding (e.g. the envelope tapped). */
  initialCategoryId?: string
  /** Categories listed first (the envelopes followed this month). */
  suggestedCategoryIds?: readonly string[]
  /** The manual expense to edit; absent when adding one. */
  expense?: TransactionDto
}

/**
 * Notes an expense by hand during the month, or edits / deletes one: amount,
 * category, day (today by default), optional label and account (the first
 * checking account by default). The import of the bank export replaces it
 * with the matching bank row. A bottom sheet on phones, a side sheet
 * otherwise.
 */
export function ManualExpenseSheet({
  open,
  onOpenChange,
  initialCategoryId,
  suggestedCategoryIds = [],
  expense,
}: ManualExpenseSheetProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const categories = useQuery({ ...categoriesQuery, enabled: open })
  const accounts = useQuery({ ...accountsQuery, enabled: open })

  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState('')
  const [label, setLabel] = useState('')
  const [accountId, setAccountId] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const today = currentDay()

  const expenseCategories = useMemo(() => {
    const all = pickableCategories(
      categories.data ?? [],
      expense?.categoryId,
    ).filter((category) => category.kind === 'expense')
    const rank = (categoryId: string) => {
      const index = suggestedCategoryIds.indexOf(categoryId)
      return index === -1 ? suggestedCategoryIds.length : index
    }
    return [...all].sort(
      (a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'fr'),
    )
  }, [categories.data, expense?.categoryId, suggestedCategoryIds])

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
    setAmount(expense ? centsToInput(-expense.amountCents) : '')
    setCategoryId(expense?.categoryId ?? initialCategoryId ?? '')
    setDate(expense?.bookingDate ?? currentDay())
    // A label left to its default (the category name) shows as empty.
    setLabel(
      expense && expense.rawLabel !== expense.category?.name
        ? expense.rawLabel
        : '',
    )
    setAccountId(expense?.accountId ?? '')
    setSubmitted(false)
  }, [open, expense, initialCategoryId])

  // Defaults once the lists are there: first category offered, first
  // checking account.
  useEffect(() => {
    if (open && categoryId === '' && expenseCategories.length > 0) {
      setCategoryId(expenseCategories[0].id)
    }
  }, [open, categoryId, expenseCategories])
  useEffect(() => {
    if (open && accountId === '' && cashAccounts.length > 0) {
      setAccountId(
        (
          cashAccounts.find((account) => account.type === 'checking') ??
          cashAccounts[0]
        ).id,
      )
    }
  }, [open, accountId, cashAccounts])

  const amountError = expenseAmountError(amount)
  const dateError =
    date === ''
      ? 'Indiquez une date'
      : date > today
        ? 'La date ne peut pas être dans le futur'
        : null

  const save = useMutation({
    mutationFn: () => {
      const body = {
        amountCents: parseEurosToCents(amount)!,
        categoryId,
        bookingDate: date,
        label: label.trim() || null,
        accountId,
      }
      return expense
        ? updateManualExpense(expense.id, body)
        : createManualExpense(body)
    },
    onSuccess: async (saved) => {
      toast.success(
        expense
          ? 'Dépense modifiée'
          : `Dépense notée : ${formatCents(-saved.amountCents)}${
              saved.category ? ` en ${saved.category.name}` : ''
            }`,
      )
      onOpenChange(false)
      await afterManualExpenseChanged(queryClient)
    },
    onError: (error) => toast.error(manualExpenseErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => deleteManualExpense(expense!.id),
    onSuccess: async () => {
      toast.success('Dépense supprimée')
      setConfirmOpen(false)
      onOpenChange(false)
      await afterManualExpenseChanged(queryClient)
    },
    onError: (error) => toast.error(manualExpenseErrorMessage(error)),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (amountError || dateError || !categoryId || !accountId) return
    save.mutate()
  }

  const showAmountError = submitted && amountError !== null
  const showDateError = submitted && dateError !== null
  const noAccount = accounts.isSuccess && cashAccounts.length === 0

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
        >
          <SheetHeader className="pb-0">
            <SheetTitle>
              {expense ? 'Modifier la dépense' : 'Ajouter une dépense'}
            </SheetTitle>
            <SheetDescription>
              Notée à la main en attendant le relevé : l’import la remplacera
              par l’opération de la banque, en gardant sa catégorie.
            </SheetDescription>
          </SheetHeader>
          <form noValidate onSubmit={submit} className="space-y-4 px-4 pb-6">
            <Field data-invalid={showAmountError}>
              <FieldLabel htmlFor={`${id}-amount`}>Montant</FieldLabel>
              <InputGroup>
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
                {expenseCategories.map((category) => (
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

            <Field>
              <FieldLabel htmlFor={`${id}-label`}>Libellé</FieldLabel>
              <Input
                id={`${id}-label`}
                autoComplete="off"
                maxLength={LABEL_MAX}
                placeholder="Facultatif, par ex. « ciné »"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
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
                Ajoutez d’abord un compte courant pour noter une dépense.
              </FieldDescription>
            )}

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
                disabled={!categoryId || !accountId}
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
          title="Supprimer cette dépense ?"
          description={`${formatCents(-expense.amountCents)} notés à la main le ${formatCalendarDate(expense.bookingDate)}. Elle ne comptera plus dans le budget.`}
          confirmLabel="Supprimer"
          variant="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  )
}
