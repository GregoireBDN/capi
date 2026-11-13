import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  RadioCard,
  RadioCardGroup,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import type { AccountDto } from '#/api/types.gen'
import { parseAmountToCents } from './amount'
import { todayInParis } from './dates'
import { accountErrorMessage } from './errors'
import { PasteHistoryForm } from './PasteHistorySheet'
import {
  afterAccountsChanged,
  afterSnapshotsChanged,
  createAccount,
  saveSnapshot,
} from './queries'

const NAME_MAX = 100

/** The investment types valued by hand, in the order of the picker. */
export const INVESTMENT_TYPES = [
  { type: 'brokerage', label: 'PEA', defaultName: 'PEA' },
  {
    type: 'life_insurance',
    label: 'Assurance vie',
    defaultName: 'Assurance vie',
  },
  {
    type: 'employee_savings',
    label: 'Épargne salariale',
    defaultName: 'Épargne salariale',
  },
] as const

export type InvestmentType = (typeof INVESTMENT_TYPES)[number]['type']

function defaultNameOf(type: InvestmentType): string {
  return INVESTMENT_TYPES.find((option) => option.type === type)!.defaultName
}

export interface InvestmentValues {
  type: InvestmentType
  name: string
  institution: string
  value: string
  date: string
  contributions: string
}

export interface InvestmentErrors {
  name?: string
  institution?: string
  value?: string
  date?: string
  contributions?: string
}

/** Field errors of the first step; empty when it can be saved. */
export function validateInvestment(
  values: InvestmentValues,
  today: string,
): InvestmentErrors {
  const errors: InvestmentErrors = {}
  const name = values.name.trim()
  if (name === '') errors.name = 'Indiquez un nom'
  else if (name.length > NAME_MAX) errors.name = '100 caractères maximum'
  if (values.institution.trim().length > NAME_MAX)
    errors.institution = '100 caractères maximum'
  const cents = parseAmountToCents(values.value)
  if (values.value.trim() === '') errors.value = 'Indiquez la valeur'
  else if (cents === null) errors.value = 'Montant invalide (ex. 12 345,67)'
  else if (cents < 0) errors.value = 'La valeur ne peut pas être négative'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date))
    errors.date = 'Indiquez une date'
  else if (values.date > today)
    errors.date = 'La date ne peut pas être dans le futur'
  if (
    values.contributions.trim() !== '' &&
    parseAmountToCents(values.contributions) === null
  )
    errors.contributions = 'Montant invalide (ex. 10 000)'
  return errors
}

function initialValues(today: string): InvestmentValues {
  return {
    type: 'brokerage',
    name: defaultNameOf('brokerage'),
    institution: '',
    value: '',
    date: today,
    contributions: '',
  }
}

interface AddInvestmentSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * "Ajouter un placement": a PEA, a life insurance or employee savings
 * account with its current value in one step, then, if the owner wants, its
 * past month-end values pasted or typed in a second one, so the net worth
 * history is right from day one. A bottom sheet on phones, a side sheet
 * otherwise; the owner stays on the page they came from.
 */
export function AddInvestmentSheet({
  open,
  onOpenChange,
}: AddInvestmentSheetProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const today = todayInParis()

  const [values, setValues] = useState(() => initialValues(today))
  const [nameTouched, setNameTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  /** The account created by the first step: the sheet shows the second. */
  const [created, setCreated] = useState<AccountDto | null>(null)

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    setValues(initialValues(todayInParis()))
    setNameTouched(false)
    setSubmitted(false)
    setCreated(null)
  }, [open])

  const set = (patch: Partial<InvestmentValues>) =>
    setValues((current) => ({ ...current, ...patch }))

  const errors = validateInvestment(values, today)
  const valid = Object.keys(errors).length === 0
  const shown = submitted ? errors : {}

  const create = useMutation({
    mutationFn: async () => {
      const account = await createAccount({
        name: values.name.trim(),
        type: values.type,
        institution: values.institution.trim() || null,
      })
      try {
        await saveSnapshot(account.id, values.date, {
          valueCents: parseAmountToCents(values.value)!,
          contributionsCents:
            values.contributions.trim() === ''
              ? null
              : parseAmountToCents(values.contributions),
          note: null,
        })
        return { account, valueSaved: true }
      } catch {
        return { account, valueSaved: false }
      }
    },
    onSuccess: async ({ account, valueSaved }) => {
      if (valueSaved) {
        toast.success(`Placement « ${account.name} » ajouté`)
        setCreated(account)
      } else {
        toast.warning(
          `Placement « ${account.name} » ajouté, mais sa valeur n’a pas pu être enregistrée. Ajoutez-la depuis sa page.`,
        )
        onOpenChange(false)
      }
      await Promise.all([
        afterAccountsChanged(queryClient),
        afterSnapshotsChanged(queryClient),
      ])
    },
    onError: (error) => toast.error(accountErrorMessage(error)),
  })

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (valid) create.mutate()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={
          isMobile
            ? 'max-h-[calc(90svh-var(--keyboard-inset,0px))] overflow-y-auto rounded-t-xl'
            : 'overflow-y-auto sm:max-w-lg'
        }
      >
        {created ? (
          <>
            <SheetHeader className="pb-0">
              <SheetTitle>Historique de « {created.name} »</SheetTitle>
              <SheetDescription>
                Facultatif : collez ou saisissez ses valeurs de fin de mois
                passées, une ligne par date, pour que l’évolution de votre
                patrimoine soit juste dès aujourd’hui.
              </SheetDescription>
            </SheetHeader>
            <PasteHistoryForm
              className="px-4 pb-6"
              accountId={created.id}
              today={today}
              doneLabel="Plus tard"
              onDone={() => onOpenChange(false)}
            />
          </>
        ) : (
          <>
            <SheetHeader className="pb-0">
              <SheetTitle>Ajouter un placement</SheetTitle>
              <SheetDescription>
                Suivi par sa valeur, d’après vos relevés ou votre espace client.
              </SheetDescription>
            </SheetHeader>
            <form noValidate onSubmit={submit} className="space-y-4 px-4 pb-6">
              <fieldset className="space-y-2">
                <legend
                  id={`${id}-type-legend`}
                  className="mb-2 text-sm font-medium"
                >
                  Type
                </legend>
                <RadioCardGroup
                  aria-labelledby={`${id}-type-legend`}
                  className="grid-cols-1 sm:grid-cols-3"
                  value={values.type}
                  onValueChange={(value) => {
                    const type = value as InvestmentType
                    set(
                      nameTouched
                        ? { type }
                        : { type, name: defaultNameOf(type) },
                    )
                  }}
                >
                  {INVESTMENT_TYPES.map(({ type, label }) => (
                    <RadioCard
                      key={type}
                      value={type}
                      indicator={false}
                      className="items-center justify-center px-3 text-center font-medium"
                    >
                      {label}
                    </RadioCard>
                  ))}
                </RadioCardGroup>
              </fieldset>
              <Field data-invalid={shown.name !== undefined}>
                <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
                <Input
                  id={`${id}-name`}
                  autoComplete="off"
                  maxLength={NAME_MAX}
                  value={values.name}
                  aria-invalid={shown.name !== undefined}
                  onChange={(event) => {
                    setNameTouched(true)
                    set({ name: event.target.value })
                  }}
                />
                {shown.name && <FieldError>{shown.name}</FieldError>}
              </Field>
              <Field data-invalid={shown.institution !== undefined}>
                <FieldLabel htmlFor={`${id}-institution`}>
                  Établissement
                </FieldLabel>
                <Input
                  id={`${id}-institution`}
                  autoComplete="off"
                  maxLength={NAME_MAX}
                  placeholder="Banque, assureur… (facultatif)"
                  value={values.institution}
                  aria-invalid={shown.institution !== undefined}
                  onChange={(event) => set({ institution: event.target.value })}
                />
                {shown.institution && (
                  <FieldError>{shown.institution}</FieldError>
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={shown.value !== undefined}>
                  <FieldLabel htmlFor={`${id}-value`}>
                    Valeur actuelle
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={`${id}-value`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="12 345,67"
                      value={values.value}
                      aria-invalid={shown.value !== undefined}
                      onChange={(event) => set({ value: event.target.value })}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>€</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  {shown.value && <FieldError>{shown.value}</FieldError>}
                </Field>
                <Field data-invalid={shown.date !== undefined}>
                  <FieldLabel htmlFor={`${id}-date`}>À la date du</FieldLabel>
                  <Input
                    id={`${id}-date`}
                    type="date"
                    max={today}
                    value={values.date}
                    aria-invalid={shown.date !== undefined}
                    onChange={(event) => set({ date: event.target.value })}
                  />
                  {shown.date && <FieldError>{shown.date}</FieldError>}
                </Field>
              </div>
              <Field data-invalid={shown.contributions !== undefined}>
                <FieldLabel htmlFor={`${id}-contributions`}>
                  Versé jusqu’ici
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={`${id}-contributions`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="10 000"
                    value={values.contributions}
                    aria-invalid={shown.contributions !== undefined}
                    onChange={(event) =>
                      set({ contributions: event.target.value })
                    }
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>€</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                {shown.contributions ? (
                  <FieldError>{shown.contributions}</FieldError>
                ) : (
                  <FieldDescription>
                    Facultatif : total versé moins les retraits, pour suivre la
                    plus-value.
                  </FieldDescription>
                )}
              </Field>
              <Button
                type="submit"
                className="w-full sm:ml-auto sm:flex sm:w-auto"
                loading={create.isPending}
              >
                Ajouter
              </Button>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** "Ajouter un placement" button that opens the flow. */
export function AddInvestmentButton({
  label = 'Ajouter un placement',
  size,
  outline,
}: {
  label?: string
  size?: 'sm'
  outline?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        iconStart={<PlusIcon />}
        size={size}
        outline={outline}
        variant={outline ? 'secondary' : undefined}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <AddInvestmentSheet open={open} onOpenChange={setOpen} />
    </>
  )
}
