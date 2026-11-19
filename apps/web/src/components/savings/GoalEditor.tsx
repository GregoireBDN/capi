import {
  Button,
  Checkbox,
  ConfirmDialog,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { AmountField } from '#/components/amount/AmountField'
import { LARGE_AMOUNT_CENTS } from '#/components/amount/signed-amount'
import type { SavingsGoalDto, SavingsGoalSource } from '#/api/types.gen'
import {
  centsToInput,
  MAX_TARGET_CENTS,
  parseEurosToCents,
  targetError,
} from '#/components/budget/amount'
import { ACCOUNT_TYPE_LABELS } from '#/components/dashboard/labels'
import {
  FORM_SHEET_BOTTOM,
  FORM_SHEET_FORM,
  FORM_SHEET_SIDE,
  FormSheetBody,
  FormSheetFooter,
} from '#/components/sheets/form-sheet'
import { formatCents } from '#/lib/money'
import { accountsQuery } from '#/lib/queries'
import { savingsErrorMessage } from './errors'
import {
  afterSavingsChanged,
  createGoal,
  removeGoal,
  updateGoal,
} from './queries'

const NAME_MAX = 100

interface Errors {
  name?: string
  target?: string
  date?: string
  accounts?: string
  manual?: string
}

interface FormValues {
  name: string
  target: string
  date: string
  source: SavingsGoalSource
  accountIds: string[]
  manual: string
}

export function validateGoal(values: FormValues): Errors {
  const errors: Errors = {}
  const name = values.name.trim()
  if (name === '') errors.name = 'Indiquez un nom'
  else if (name.length > NAME_MAX) errors.name = 'Nom trop long'
  const target = targetError(values.target)
  if (target) errors.target = target
  if (values.date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(values.date)) {
    errors.date = 'Date invalide'
  }
  if (values.source === 'accounts' && values.accountIds.length === 0) {
    errors.accounts = 'Choisissez au moins un compte'
  }
  if (values.source === 'manual' && values.manual.trim() !== '') {
    const cents = parseEurosToCents(values.manual)
    if (cents === null) errors.manual = 'Montant invalide (ex. 1200 ou 1200,50)'
    else if (cents > MAX_TARGET_CENTS) errors.manual = 'Montant trop élevé'
  }
  return errors
}

/**
 * Under the deadline: the monthly effort it asks (the goal rows don't show
 * it, #344 follow-up) while the saved deadline is kept, else what it is for.
 */
export function deadlineHelp(
  goal: SavingsGoalDto | undefined,
  date: string,
): string {
  if (
    goal &&
    !goal.reached &&
    goal.targetDate !== null &&
    goal.targetDate === date
  ) {
    if (goal.targetDatePassed) return 'Échéance passée.'
    if (goal.requiredMonthlyCents !== null && goal.monthsLeft !== null) {
      return `Soit ${formatCents(goal.requiredMonthlyCents)} par mois pendant ${goal.monthsLeft} mois.`
    }
  }
  return 'Facultative : sert à calculer l’effort mensuel.'
}

/**
 * Adds or changes a savings goal: name, target amount, optional deadline,
 * and where the amount saved comes from (linked accounts' balances or an
 * amount typed by hand). An existing goal can also be archived, restored or
 * deleted. A bottom sheet on phones, a side sheet otherwise.
 */
export function GoalEditor({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this goal, or add one when undefined. */
  goal?: SavingsGoalDto
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const accounts = useQuery({ ...accountsQuery, enabled: open })
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [submitted, setSubmitted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    setValues(
      goal
        ? {
            name: goal.name,
            target: centsToInput(goal.targetCents),
            date: goal.targetDate ?? '',
            source: goal.source,
            accountIds: goal.accountIds,
            manual:
              goal.manualAmountCents === null
                ? ''
                : centsToInput(goal.manualAmountCents),
          }
        : emptyValues,
    )
    setSubmitted(false)
  }, [open, goal])

  const errors = validateGoal(values)
  const shown = submitted ? errors : {}
  const set = <TKey extends keyof FormValues>(
    key: TKey,
    value: FormValues[TKey],
  ) => setValues((previous) => ({ ...previous, [key]: value }))

  async function done(message: string) {
    toast.success(message)
    setConfirmOpen(false)
    onOpenChange(false)
    await afterSavingsChanged(queryClient)
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: values.name.trim(),
        targetCents: parseEurosToCents(values.target)!,
        targetDate: values.date === '' ? null : values.date,
        source: values.source,
        ...(values.source === 'accounts'
          ? { accountIds: values.accountIds }
          : {
              manualAmountCents: parseEurosToCents(values.manual) ?? 0,
              accountIds: [],
            }),
      }
      return goal ? updateGoal(goal.id, body) : createGoal(body)
    },
    onSuccess: (saved) =>
      done(
        goal
          ? `Objectif ${saved.name} enregistré`
          : `Objectif ${saved.name} ajouté`,
      ),
    onError: (error) => toast.error(savingsErrorMessage(error)),
  })

  const archive = useMutation({
    mutationFn: (archived: boolean) => updateGoal(goal!.id, { archived }),
    onSuccess: (saved) =>
      done(
        saved.archived
          ? `Objectif ${saved.name} archivé`
          : `Objectif ${saved.name} restauré`,
      ),
    onError: (error) => toast.error(savingsErrorMessage(error)),
  })

  const remove = useMutation({
    mutationFn: () => removeGoal(goal!.id),
    onSuccess: () => done(`Objectif ${goal!.name} supprimé`),
    onError: (error) => toast.error(savingsErrorMessage(error)),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length > 0) return
    save.mutate()
  }

  function toggleAccount(accountId: string, checked: boolean) {
    set(
      'accountIds',
      checked
        ? [...values.accountIds, accountId]
        : values.accountIds.filter((selected) => selected !== accountId),
    )
  }

  const busy = save.isPending || archive.isPending || remove.isPending
  const accountList = accounts.data ?? []

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={isMobile ? FORM_SHEET_BOTTOM : FORM_SHEET_SIDE}
        >
          <SheetHeader>
            <SheetTitle>
              {goal ? `Objectif ${goal.name}` : 'Ajouter un objectif'}
            </SheetTitle>
            <SheetDescription>
              Montant à atteindre, échéance facultative et ce qui compte comme
              déjà épargné.
            </SheetDescription>
          </SheetHeader>
          <form noValidate onSubmit={submit} className={FORM_SHEET_FORM}>
            <FormSheetBody>
              <Field data-invalid={shown.name !== undefined}>
                <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
                <Input
                  id={`${id}-name`}
                  autoComplete="off"
                  maxLength={NAME_MAX}
                  placeholder="Fonds de secours"
                  value={values.name}
                  aria-invalid={shown.name !== undefined}
                  onChange={(event) => set('name', event.target.value)}
                />
                {shown.name && <FieldError>{shown.name}</FieldError>}
              </Field>

              <Field data-invalid={shown.target !== undefined}>
                <FieldLabel htmlFor={`${id}-target`}>Montant cible</FieldLabel>
                <AmountField
                  maxCents={LARGE_AMOUNT_CENTS}
                  id={`${id}-target`}
                  placeholder="5000"
                  value={values.target}
                  aria-invalid={shown.target !== undefined}
                  onValueChange={(typed) => set('target', typed)}
                />
                {shown.target && <FieldError>{shown.target}</FieldError>}
              </Field>

              <Field data-invalid={shown.date !== undefined}>
                <FieldLabel htmlFor={`${id}-date`}>Échéance</FieldLabel>
                <Input
                  id={`${id}-date`}
                  type="date"
                  value={values.date}
                  aria-invalid={shown.date !== undefined}
                  onChange={(event) => set('date', event.target.value)}
                />
                <FieldDescription>
                  {deadlineHelp(goal, values.date)}
                </FieldDescription>
                {shown.date && <FieldError>{shown.date}</FieldError>}
              </Field>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">
                  Déjà épargné
                </legend>
                {/* 44px rows: each radio's touch area stays its own. */}
                <RadioGroup
                  value={values.source}
                  onValueChange={(value) =>
                    set('source', value as SavingsGoalSource)
                  }
                >
                  <div className="flex min-h-11 items-center gap-2">
                    <RadioGroupItem value="accounts" id={`${id}-accounts`} />
                    <Label htmlFor={`${id}-accounts`} className="font-normal">
                      Solde de comptes liés
                    </Label>
                  </div>
                  <div className="flex min-h-11 items-center gap-2">
                    <RadioGroupItem value="manual" id={`${id}-manual`} />
                    <Label htmlFor={`${id}-manual`} className="font-normal">
                      Montant saisi à la main
                    </Label>
                  </div>
                </RadioGroup>
              </fieldset>

              {values.source === 'accounts' ? (
                <fieldset
                  className="space-y-2"
                  aria-describedby={
                    shown.accounts ? `${id}-accounts-error` : undefined
                  }
                >
                  <legend className="mb-2 text-sm font-medium">
                    Comptes liés
                  </legend>
                  {accounts.isPending && (
                    <p className="text-muted-foreground text-sm">Chargement…</p>
                  )}
                  {accountList.map((account) => (
                    <div key={account.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`${id}-${account.id}`}
                        checked={values.accountIds.includes(account.id)}
                        onCheckedChange={(checked) =>
                          toggleAccount(account.id, checked === true)
                        }
                      />
                      <Label
                        htmlFor={`${id}-${account.id}`}
                        className="min-w-0 flex-1 font-normal"
                      >
                        <span className="truncate">{account.name}</span>
                        <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                          {account.balanceCents === null
                            ? ACCOUNT_TYPE_LABELS[account.type]
                            : formatCents(account.balanceCents)}
                        </span>
                      </Label>
                    </div>
                  ))}
                  {shown.accounts && (
                    <p
                      id={`${id}-accounts-error`}
                      className="text-destructive text-sm"
                    >
                      {shown.accounts}
                    </p>
                  )}
                </fieldset>
              ) : (
                <Field data-invalid={shown.manual !== undefined}>
                  <FieldLabel htmlFor={`${id}-manual-amount`}>
                    Montant déjà épargné
                  </FieldLabel>
                  <AmountField
                    maxCents={LARGE_AMOUNT_CENTS}
                    id={`${id}-manual-amount`}
                    placeholder="0"
                    value={values.manual}
                    aria-invalid={shown.manual !== undefined}
                    onValueChange={(typed) => set('manual', typed)}
                  />
                  {shown.manual && <FieldError>{shown.manual}</FieldError>}
                </Field>
              )}

              {/* The rarer actions end the fields; « Enregistrer » stays in
                the footer, above the keyboard (#323). */}
              {goal && (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <>
                    <Button
                      type="button"
                      variant="danger"
                      outline
                      disabled={busy}
                      onClick={() => setConfirmOpen(true)}
                    >
                      Supprimer
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      outline
                      loading={archive.isPending}
                      disabled={busy}
                      onClick={() => archive.mutate(!goal.archived)}
                    >
                      {goal.archived ? 'Restaurer' : 'Archiver'}
                    </Button>
                  </>
                </div>
              )}
            </FormSheetBody>
            <FormSheetFooter>
              <Button
                type="submit"
                className="min-h-11 flex-1 font-medium"
                loading={save.isPending}
                disabled={busy}
              >
                Enregistrer
              </Button>
            </FormSheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {goal && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Supprimer l’objectif ${goal.name} ?`}
          description="L’objectif disparaît définitivement. Pour le garder en mémoire, archivez-le plutôt."
          confirmLabel="Supprimer"
          variant="danger"
          loading={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </>
  )
}

const emptyValues: FormValues = {
  name: '',
  target: '',
  date: '',
  source: 'accounts',
  accountIds: [],
  manual: '',
}
