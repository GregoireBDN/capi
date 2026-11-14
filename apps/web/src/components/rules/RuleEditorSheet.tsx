import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  NativeSelectOption,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import type {
  AccountDto,
  CategorizationRuleDto,
  CategorizationRulePreviewDto,
  CategoryDto,
  CreateCategorizationRuleDto,
  RuleMatchType,
  TransactionKind,
} from '#/api/types.gen'
import { centsToInput, parseAmountToCents } from '#/components/accounts/amount'
import { CategoryPicker } from '#/components/transactions/CategoryPicker'
import {
  KIND_LABELS,
  TRANSACTION_KINDS,
} from '#/components/transactions/labels'
import { isTransactional } from '#/lib/queries'
import { MATCH_TYPE_LABELS } from './describe'
import { ruleErrorMessage } from './errors'
import { createRule, previewRule, rulesKey, updateRule } from './queries'
import { RulePreview } from './RulePreview'

const PATTERN_MAX = 255
const MERCHANT_MAX = 255

/** The form as typed: amounts stay text until they are checked. */
export interface RuleForm {
  labelPattern: string
  matchType: RuleMatchType
  /** '' = every account. */
  accountId: string
  minAmount: string
  maxAmount: string
  categoryId: string
  /** '' = the category's kind. */
  kind: TransactionKind | ''
  merchant: string
  enabled: boolean
}

type FormErrors = Partial<
  Record<'labelPattern' | 'amount' | 'categoryId', string>
>

export function formFromRule(rule: CategorizationRuleDto | null): RuleForm {
  return {
    labelPattern: rule?.labelPattern ?? '',
    matchType: rule?.matchType ?? 'contains',
    accountId: rule?.accountId ?? '',
    minAmount:
      rule?.minAmountCents == null ? '' : centsToInput(rule.minAmountCents),
    maxAmount:
      rule?.maxAmountCents == null ? '' : centsToInput(rule.maxAmountCents),
    categoryId: rule?.categoryId ?? '',
    kind: rule?.kind ?? '',
    merchant: rule?.merchant ?? '',
    enabled: rule?.enabled ?? true,
  }
}

/**
 * The request body for `form`, or the errors to show. Amounts are read
 * straight into cents; an empty amount means no bound.
 */
export function bodyFromForm(
  form: RuleForm,
): { body: Required<CreateCategorizationRuleDto> } | { errors: FormErrors } {
  const errors: FormErrors = {}
  const labelPattern = form.labelPattern.trim()
  if (labelPattern === '') errors.labelPattern = 'Saisissez un motif.'
  if (form.categoryId === '') errors.categoryId = 'Choisissez une catégorie.'

  const amount = (text: string) =>
    text.trim() === '' ? null : parseAmountToCents(text)
  const minAmountCents = amount(form.minAmount)
  const maxAmountCents = amount(form.maxAmount)
  if (
    (form.minAmount.trim() !== '' && minAmountCents === null) ||
    (form.maxAmount.trim() !== '' && maxAmountCents === null)
  ) {
    errors.amount = 'Saisissez un montant, par exemple -50 ou 12,90.'
  } else if (
    minAmountCents !== null &&
    maxAmountCents !== null &&
    minAmountCents > maxAmountCents
  ) {
    errors.amount = 'Le minimum dépasse le maximum.'
  }

  if (Object.keys(errors).length > 0) return { errors }
  return {
    body: {
      enabled: form.enabled,
      matchType: form.matchType,
      labelPattern,
      accountId: form.accountId || null,
      minAmountCents,
      maxAmountCents,
      categoryId: form.categoryId,
      kind: form.kind || null,
      merchant: form.merchant.trim() || null,
    },
  }
}

interface RuleEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The rule to edit, or null for a new one (appended last). */
  rule: CategorizationRuleDto | null
  categories: readonly CategoryDto[]
  accounts: readonly AccountDto[]
  /** Called once the rule is saved, to offer applying the rules. */
  onSaved: (rule: CategorizationRuleDto, created: boolean) => void
}

/**
 * Edits or creates a rule: pattern and match type, account and amount
 * filters, target category, kind and merchant, enabled. "Tester" shows what
 * saving it and applying the rules would change, before anything is saved.
 * A bottom sheet on phones, a side sheet otherwise.
 */
export function RuleEditorSheet({
  open,
  onOpenChange,
  rule,
  categories,
  accounts,
  onSaved,
}: RuleEditorSheetProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const [form, setForm] = useState<RuleForm>(() => formFromRule(rule))
  const [errors, setErrors] = useState<FormErrors>({})
  const [preview, setPreview] = useState<CategorizationRulePreviewDto | null>(
    null,
  )
  const [requestError, setRequestError] = useState<string | null>(null)

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    setForm(formFromRule(rule))
    setErrors({})
    setPreview(null)
    setRequestError(null)
  }, [open, rule])

  /** Any change makes the last test stale. */
  function change(patch: Partial<RuleForm>) {
    setForm((current) => ({ ...current, ...patch }))
    setPreview(null)
    setRequestError(null)
  }

  function validBody() {
    const result = bodyFromForm(form)
    if ('errors' in result) {
      setErrors(result.errors)
      return null
    }
    setErrors({})
    return result.body
  }

  const test = useMutation({
    mutationFn: (body: CreateCategorizationRuleDto) =>
      previewRule(rule ? { ...body, ruleId: rule.id } : body),
    onSuccess: (result) => setPreview(result),
    onError: (error) => setRequestError(ruleErrorMessage(error)),
  })

  const save = useMutation({
    mutationFn: (body: Required<CreateCategorizationRuleDto>) =>
      rule ? updateRule(rule.id, body) : createRule(body),
    onSuccess: async (saved) => {
      onOpenChange(false)
      onSaved(saved, rule === null)
      await queryClient.invalidateQueries({ queryKey: rulesKey })
    },
    onError: (error) => setRequestError(ruleErrorMessage(error)),
  })

  const accountChoices = accounts.filter(
    (account) =>
      account.id === form.accountId ||
      (isTransactional(account) && !account.archivedAt),
  )
  const category = categories.find((c) => c.id === form.categoryId)

  return (
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
          <SheetTitle>
            {rule ? 'Modifier la règle' : 'Nouvelle règle'}
          </SheetTitle>
          <SheetDescription>
            {rule
              ? 'Testez-la pour voir les opérations qui changeraient avant d’enregistrer.'
              : 'Elle passe après les règles existantes.'}
          </SheetDescription>
        </SheetHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            const body = validBody()
            if (body) save.mutate(body)
          }}
          className="space-y-4 px-4 pb-6"
        >
          <Field data-invalid={errors.labelPattern ? true : undefined}>
            <FieldLabel htmlFor={`${id}-pattern`}>
              Le libellé ou le marchand
            </FieldLabel>
            <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
              <NativeSelect
                aria-label="Type de correspondance"
                value={form.matchType}
                onChange={(event) =>
                  change({ matchType: event.target.value as RuleMatchType })
                }
              >
                {(['contains', 'regex'] as const).map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {MATCH_TYPE_LABELS[value]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Input
                id={`${id}-pattern`}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={PATTERN_MAX}
                value={form.labelPattern}
                aria-invalid={errors.labelPattern ? true : undefined}
                onChange={(event) =>
                  change({ labelPattern: event.target.value })
                }
                className={form.matchType === 'regex' ? 'font-mono' : undefined}
              />
            </div>
            <FieldDescription>
              {form.matchType === 'contains'
                ? 'Majuscules, accents et ponctuation sont ignorés.'
                : 'Expression régulière, sans distinction de majuscules.'}
            </FieldDescription>
            {errors.labelPattern && (
              <FieldError>{errors.labelPattern}</FieldError>
            )}
          </Field>

          <Field data-invalid={errors.categoryId ? true : undefined}>
            <FieldLabel htmlFor={`${id}-category`}>Catégorie</FieldLabel>
            <CategoryPicker
              id={`${id}-category`}
              label="Catégorie"
              categories={categories}
              value={form.categoryId || null}
              onChange={(categoryId) => change({ categoryId })}
              className="w-full"
            />
            {category?.archivedAt && (
              <FieldDescription>
                Cette catégorie est archivée : choisissez-en une autre ou
                désactivez la règle.
              </FieldDescription>
            )}
            {errors.categoryId && <FieldError>{errors.categoryId}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor={`${id}-kind`}>Type</FieldLabel>
            <NativeSelect
              id={`${id}-kind`}
              className="w-full"
              value={form.kind}
              onChange={(event) =>
                change({ kind: event.target.value as TransactionKind | '' })
              }
            >
              <NativeSelectOption value="">
                {category
                  ? `Celui de la catégorie (${KIND_LABELS[category.kind]})`
                  : 'Celui de la catégorie'}
              </NativeSelectOption>
              {TRANSACTION_KINDS.map((kind) => (
                <NativeSelectOption key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${id}-account`}>Compte</FieldLabel>
            <NativeSelect
              id={`${id}-account`}
              className="w-full"
              value={form.accountId}
              onChange={(event) => change({ accountId: event.target.value })}
            >
              <NativeSelectOption value="">Tous les comptes</NativeSelectOption>
              {accountChoices.map((account) => (
                <NativeSelectOption key={account.id} value={account.id}>
                  {account.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field data-invalid={errors.amount ? true : undefined}>
            <FieldLabel htmlFor={`${id}-min`}>Montant (facultatif)</FieldLabel>
            <div className="grid grid-cols-2 gap-2">
              <Input
                id={`${id}-min`}
                aria-label="Montant minimum"
                placeholder="Min."
                autoComplete="off"
                value={form.minAmount}
                aria-invalid={errors.amount ? true : undefined}
                onChange={(event) => change({ minAmount: event.target.value })}
              />
              <Input
                aria-label="Montant maximum"
                placeholder="Max."
                autoComplete="off"
                value={form.maxAmount}
                aria-invalid={errors.amount ? true : undefined}
                onChange={(event) => change({ maxAmount: event.target.value })}
              />
            </div>
            <FieldDescription>
              En euros, bornes comprises ; négatif pour une dépense (ex. -50).
            </FieldDescription>
            {errors.amount && <FieldError>{errors.amount}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor={`${id}-merchant`}>
              Renommer le marchand (facultatif)
            </FieldLabel>
            <Input
              id={`${id}-merchant`}
              autoComplete="off"
              maxLength={MERCHANT_MAX}
              value={form.merchant}
              onChange={(event) => change({ merchant: event.target.value })}
            />
          </Field>

          <Field orientation="horizontal" className="min-h-11 items-center">
            <Switch
              id={`${id}-enabled`}
              checked={form.enabled}
              onCheckedChange={(enabled) => change({ enabled })}
            />
            <FieldLabel htmlFor={`${id}-enabled`}>Règle active</FieldLabel>
          </Field>

          {preview && <RulePreview preview={preview} categories={categories} />}
          {requestError && (
            <p role="alert" className="text-destructive text-sm">
              {requestError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              outline
              className="flex-1 sm:flex-none"
              loading={test.isPending}
              onClick={() => {
                const body = validBody()
                if (body) test.mutate(body)
              }}
            >
              Tester
            </Button>
            <Button
              type="submit"
              className="flex-1 sm:flex-none"
              loading={save.isPending}
            >
              Enregistrer
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
