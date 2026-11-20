import {
  Button,
  CategoryIcon,
  ConfirmDialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Label,
  NativeSelect,
  NativeSelectOption,
  Sheet,
  SheetContent,
  Switch,
  Textarea,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { AmountField } from '#/components/amount/AmountField'
import type { CategoryDto } from '#/api/types.gen'
import { formatMonth } from '#/lib/calendar'
import { formatCents } from '#/lib/money'
import { centsToInput, parseEurosToCents, targetError } from './amount'
import { budgetErrorMessage } from './errors'
import { afterBudgetsChanged, removeBudget, saveBudget } from './queries'
import {
  EditorHeader,
  editorSide,
  FORM_SHEET_SCREEN,
  SheetScroll,
} from '#/components/sheets/form-sheet'

const NOTE_MAX = 500

/** The budget being edited; absent when adding one. */
export interface EditedBudget {
  categoryId: string
  name: string
  color: string | null
  icon: string | null
  targetCents: number
  note: string | null
  tracked: boolean
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
  /**
   * `expense`: a spending target; `income`: a planned income (#315), with
   * no « Suivre pendant le mois ».
   */
  kind?: 'expense' | 'income'
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
  kind = 'expense',
}: BudgetEditorProps) {
  const income = kind === 'income'
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [tracked, setTracked] = useState(false)
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
    setTracked(budget?.tracked ?? false)
    setSubmitted(false)
  }, [open, budget, initialCategoryId, available])

  const monthText = formatMonth(month).toLowerCase()
  const amountError = targetError(amount)
  const chosen = budget ?? available.find((c) => c.id === categoryId)
  const categoryName = chosen?.name ?? ''

  const save = useMutation({
    mutationFn: () =>
      saveBudget(
        categoryId,
        month,
        parseEurosToCents(amount)!,
        note.trim() || null,
        income ? undefined : tracked,
      ),
    onSuccess: async (saved) => {
      toast.success(
        income
          ? `Revenu prévu ${categoryName} : ${formatCents(saved.monthlyTargetCents)} par mois`
          : `Budget ${categoryName} : ${formatCents(saved.monthlyTargetCents)} par mois`,
      )
      onOpenChange(false)
      await afterBudgetsChanged(queryClient)
    },
    onError: (error) => toast.error(budgetErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => removeBudget(categoryId, month),
    onSuccess: async () => {
      toast.success(
        income
          ? `Revenu ${categoryName} retiré du plan à partir de ${monthText}`
          : `Budget ${categoryName} arrêté à partir de ${monthText}`,
      )
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
  const title = income
    ? budget
      ? `Revenu prévu ${budget.name}`
      : 'Ajouter un revenu prévu'
    : budget
      ? `Budget ${budget.name}`
      : 'Ajouter un budget'

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={editorSide(isMobile)}
          className={isMobile ? FORM_SHEET_SCREEN : undefined}
        >
          <EditorHeader
            className="pb-0"
            title={
              <span className="inline-flex items-center gap-2">
                {budget && (
                  <CategoryIcon icon={budget.icon} color={budget.color} />
                )}
                <span className="min-w-0">{title}</span>
              </span>
            }
            description={
              income
                ? `Montant attendu chaque mois à partir de ${monthText}. Les mois précédents gardent le leur.`
                : `Objectif mensuel à partir de ${monthText}. Les mois précédents gardent leur objectif.`
            }
            action={{
              type: 'submit',
              form: `${id}-form`,
              label: 'Enregistrer',
              loading: save.isPending,
              disabled: !categoryId,
            }}
          />
          <SheetScroll>
            <form
              id={`${id}-form`}
              noValidate
              onSubmit={submit}
              className="space-y-4 px-4 pb-6"
            >
              {!budget && (
                <Field>
                  <FieldLabel htmlFor={`${id}-category`}>Catégorie</FieldLabel>
                  {/* The chosen category's icon beside the list (a native
                    select can't draw one per option). */}
                  <div className="flex items-center gap-2">
                    {chosen && (
                      <CategoryIcon icon={chosen.icon} color={chosen.color} />
                    )}
                    <NativeSelect
                      id={`${id}-category`}
                      className="min-w-0 flex-1"
                      value={categoryId}
                      onChange={(event) => setCategoryId(event.target.value)}
                    >
                      {available.map((category) => (
                        <NativeSelectOption
                          key={category.id}
                          value={category.id}
                        >
                          {category.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                </Field>
              )}
              <Field data-invalid={showError}>
                <FieldLabel htmlFor={`${id}-amount`}>
                  {income ? 'Prévu par mois' : 'Objectif par mois'}
                </FieldLabel>
                <AmountField
                  id={`${id}-amount`}
                  placeholder={income ? '2100' : '350'}
                  value={amount}
                  aria-invalid={showError}
                  onValueChange={(typed) => setAmount(typed)}
                />
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
                  {income
                    ? 'Facultative, par ex. « estimation, à corriger avec la fiche de paie ».'
                    : 'Facultative, par ex. « dépense fixe ».'}
                </FieldDescription>
              </Field>
              {!income && (
                <div className="flex items-start gap-3">
                  <Switch
                    id={`${id}-tracked`}
                    checked={tracked}
                    onCheckedChange={setTracked}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor={`${id}-tracked`} className="font-normal">
                      Suivre pendant le mois
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      Affiché sur le tableau de bord, avec les dépenses notées à
                      la main avant l’import du relevé.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                {budget && (
                  <Button
                    type="button"
                    variant="danger"
                    outline
                    onClick={() => setConfirmOpen(true)}
                  >
                    {income ? 'Retirer du plan' : 'Arrêter ce budget'}
                  </Button>
                )}
                {!isMobile && (
                  <Button
                    type="submit"
                    className="sm:ml-auto"
                    loading={save.isPending}
                    disabled={!categoryId}
                  >
                    Enregistrer
                  </Button>
                )}
              </div>
            </form>
          </SheetScroll>
        </SheetContent>
      </Sheet>
      {budget && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={
            income
              ? `Retirer ${budget.name} du plan ?`
              : `Arrêter le budget ${budget.name} ?`
          }
          description={
            income
              ? `Plus de revenu prévu à partir de ${monthText}, ni les mois suivants. Les mois précédents gardent le leur.`
              : `Plus d’objectif à partir de ${monthText}, ni les mois suivants. Les mois précédents gardent le leur.`
          }
          confirmLabel={income ? 'Retirer du plan' : 'Arrêter le budget'}
          variant="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  )
}
