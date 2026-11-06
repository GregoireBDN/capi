import {
  Button,
  ConfirmDialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
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
  Textarea,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { CategoryDto } from '#/api/types.gen'
import { formatMonth } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { centsToInput, parseEurosToCents, targetError } from './amount'
import { budgetErrorMessage } from './errors'
import { afterBudgetsChanged, removeBudget, saveBudget } from './queries'

const NOTE_MAX = 500

/** The budget being edited; absent when adding one. */
export interface EditedBudget {
  categoryId: string
  name: string
  targetCents: number
  note: string | null
}

interface BudgetEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Month the change applies from (the month shown). */
  month: string
  /** Edit this budget, or add one when undefined. */
  budget?: EditedBudget
  /** Expense categories without a budget (for adding). */
  available: readonly CategoryDto[]
  /** Category preselected when adding. */
  initialCategoryId?: string
}

/**
 * Sets, changes or stops the monthly target of one category, from the month
 * shown on: earlier months keep their target. A bottom sheet on phones, a
 * side sheet otherwise.
 */
export function BudgetEditor({
  open,
  onOpenChange,
  month,
  budget,
  available,
  initialCategoryId,
}: BudgetEditorProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    setCategoryId(
      budget?.categoryId ?? initialCategoryId ?? available.at(0)?.id ?? '',
    )
    setAmount(budget ? centsToInput(budget.targetCents) : '')
    setNote(budget?.note ?? '')
    setSubmitted(false)
  }, [open, budget, initialCategoryId, available])

  const monthText = formatMonth(month).toLowerCase()
  const amountError = targetError(amount)
  const categoryName =
    budget?.name ?? available.find((c) => c.id === categoryId)?.name ?? ''

  const save = useMutation({
    mutationFn: () =>
      saveBudget(
        categoryId,
        month,
        parseEurosToCents(amount)!,
        note.trim() || null,
      ),
    onSuccess: async (saved) => {
      toast.success(
        `Budget ${categoryName} : ${formatCents(saved.monthlyTargetCents)} par mois`,
      )
      onOpenChange(false)
      await afterBudgetsChanged(queryClient)
    },
    onError: (error) => toast.error(budgetErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => removeBudget(categoryId, month),
    onSuccess: async () => {
      toast.success(`Budget ${categoryName} arrêté à partir de ${monthText}`)
      setConfirmOpen(false)
      onOpenChange(false)
      await afterBudgetsChanged(queryClient)
    },
    onError: (error) => toast.error(budgetErrorMessage(error)),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (amountError || !categoryId) return
    save.mutate()
  }

  const showError = submitted && amountError !== null
  const title = budget ? `Budget ${budget.name}` : 'Ajouter un budget'

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
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              Objectif mensuel à partir de {monthText}. Les mois précédents
              gardent leur objectif.
            </SheetDescription>
          </SheetHeader>
          <form noValidate onSubmit={submit} className="space-y-4 px-4 pb-6">
            {!budget && (
              <Field>
                <FieldLabel htmlFor={`${id}-category`}>Catégorie</FieldLabel>
                <NativeSelect
                  id={`${id}-category`}
                  className="w-full"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  {available.map((category) => (
                    <NativeSelectOption key={category.id} value={category.id}>
                      {category.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field data-invalid={showError}>
              <FieldLabel htmlFor={`${id}-amount`}>
                Objectif par mois
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`${id}-amount`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="350"
                  value={amount}
                  aria-invalid={showError}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>€</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              {showError && <FieldError>{amountError}</FieldError>}
            </Field>
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
                Facultative, par ex. « dépense fixe ».
              </FieldDescription>
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {budget && (
                <Button
                  type="button"
                  variant="danger"
                  outline
                  onClick={() => setConfirmOpen(true)}
                >
                  Arrêter ce budget
                </Button>
              )}
              <Button
                type="submit"
                className="sm:ml-auto"
                loading={save.isPending}
                disabled={!categoryId}
              >
                Enregistrer
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
      {budget && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Arrêter le budget ${budget.name} ?`}
          description={`Plus d’objectif à partir de ${monthText}, ni les mois suivants. Les mois précédents gardent le leur.`}
          confirmLabel="Arrêter le budget"
          variant="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  )
}
