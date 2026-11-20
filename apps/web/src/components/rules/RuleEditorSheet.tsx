import {
  Button,
  CategoryIcon,
  cn,
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
  SheetBar,
  SheetBarAction,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Skeleton,
  Switch,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type {
  AccountDto,
  CategorizationRuleDto,
  CategoryDto,
  CreateCategorizationRuleDto,
  RuleMatchType,
} from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import type { AmountSign } from '#/components/amount/signed-amount'
import { isTransactional } from '#/lib/queries'
import { CategoryChips } from './CategoryChips'
import {
  describeAmount,
  describeConditions,
  MATCH_TYPE_LABELS,
} from './describe'
import { ruleErrorMessage } from './errors'
import { createRule, rulePreviewQuery, rulesKey, updateRule } from './queries'
import { bodyFromForm, conditionsFromForm, formFromRule } from './rule-form'
import type { FormErrors, RuleForm } from './rule-form'
import { RuleMatches } from './RuleMatches'
import { PREVIEW_RULE_ID, RulePreview } from './RulePreview'
import { editorSide } from '#/components/sheets/form-sheet'

export { bodyFromForm, formFromRule, type RuleForm } from './rule-form'

/** Largest amount a rule's condition takes (1 000 000 000 €). */
const RULE_MAX_AMOUNT_CENTS = 100_000_000_000

const PATTERN_MAX = 255
const MERCHANT_MAX = 255
/** Bounds of `priority` (API). */
const PRIORITY_MIN = -1000
const PRIORITY_MAX = 1000

/** The steps of the editor (#299): one decision per screen. */
const STEPS = ['match', 'category', 'review'] as const
type Step = (typeof STEPS)[number]

const STEP_NAMES: Record<Step, string> = {
  match: 'Quelles opérations ?',
  category: 'Classer dans',
  review: 'Vérifier',
}

interface RuleEditorSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The rule to edit, or null for a new one. */
  rule: CategorizationRuleDto | null
  /** Every saved rule, to name the ones it overlaps with. */
  rules: readonly CategorizationRuleDto[]
  categories: readonly CategoryDto[]
  accounts: readonly AccountDto[]
  /** Once saved: the page applies the rules and offers « Annuler ». */
  onSaved: (
    rule: CategorizationRuleDto,
    previous: CategorizationRuleDto | null,
  ) => void
  /** « Supprimer la règle » (an edit only): the page confirms. */
  onDelete: (rule: CategorizationRuleDto) => void
}

/** A folded « Avancé » section, its summary beside the title when closed. */
function Advanced({
  id,
  summary,
  children,
}: {
  id: string
  summary: string | null
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  return (
    // Clipped to its own corners, so the hover fills the bordered shape.
    <div className="overflow-hidden rounded-lg border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setOpen((current) => !current)
          // Opened: bring what it holds into view.
          if (!open) {
            requestAnimationFrame(() =>
              contentRef.current?.scrollIntoView({
                block: 'nearest',
                behavior: 'smooth',
              }),
            )
          }
        }}
        className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Avancé</span>
          {!open && summary && (
            <span className="text-muted-foreground block text-xs break-words">
              {summary}
            </span>
          )}
        </span>
        <ChevronDownIcon
          aria-hidden
          className={cn(
            'text-muted-foreground size-[0.8rem] shrink-0 transition-transform motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div id={id} ref={contentRef} className="space-y-4 border-t p-3">
          {children}
        </div>
      )}
    </div>
  )
}

/** A row of the review step that goes back to a step: label, value, ›. */
function StepLink({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-muted/60 focus-visible:ring-ring/50 flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
    >
      <span className="min-w-0 flex-1">
        <span className="text-muted-foreground block text-xs">{label}</span>
        <span className="block break-words">{children}</span>
      </span>
      <ChevronRightIcon
        aria-hidden
        className="text-muted-foreground size-[0.8rem] shrink-0"
      />
    </button>
  )
}

/**
 * Creates or edits a rule in three steps (#299, like the quick entry #245):
 * 1. « Quelles opérations ? »: the text the label contains, the transactions
 *    it catches listed live below; « Avancé »: regex, account, amount.
 * 2. « Classer dans »: the categories as chips, a tap moves on.
 * 3. « Vérifier »: the rule as a sentence, what applying it will change and
 *    the rules it overlaps with (« Faire gagner cette règle »); « Avancé »:
 *    destination, merchant, active, priority (the kind is the category's,
 *    #368). « Enregistrer » saves,
 *    then the page applies the rules with « Annuler ».
 * An edit opens on the third step. A bottom sheet on phones, a side sheet
 * otherwise.
 */
export function RuleEditorSheet({
  open,
  onOpenChange,
  rule,
  rules,
  categories,
  accounts,
  onSaved,
  onDelete,
}: RuleEditorSheetProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const stepRef = useRef<HTMLHeadingElement>(null)
  const [form, setForm] = useState<RuleForm>(() => formFromRule(rule))
  const [step, setStep] = useState<Step>(rule ? 'review' : 'match')
  const [errors, setErrors] = useState<FormErrors>({})
  const [requestError, setRequestError] = useState<string | null>(null)

  // Fresh form on every opening.
  useEffect(() => {
    if (!open) return
    setForm(formFromRule(rule))
    setStep(rule ? 'review' : 'match')
    setErrors({})
    setRequestError(null)
  }, [open, rule])

  function change(patch: Partial<RuleForm>) {
    setForm((current) => ({ ...current, ...patch }))
    setRequestError(null)
  }

  function goTo(target: Step) {
    setStep(target)
    setRequestError(null)
    // The step's heading, read out by screen readers.
    requestAnimationFrame(() => stepRef.current?.focus({ preventScroll: true }))
  }

  const category = categories.find((c) => c.id === form.categoryId)
  const conditions = conditionsFromForm(form)
  const result = bodyFromForm(form, category?.kind)
  const body = 'body' in result ? result.body : null
  const selfId = rule?.id ?? PREVIEW_RULE_ID

  const preview = useQuery({
    ...rulePreviewQuery(
      body
        ? { ...body, ...(rule ? { ruleId: rule.id } : {}) }
        : { labelPattern: '', categoryId: '' },
    ),
    enabled: open && step === 'review' && body !== null,
    staleTime: 0,
  })

  const save = useMutation({
    mutationFn: (saved: Required<CreateCategorizationRuleDto>) =>
      rule ? updateRule(rule.id, saved) : createRule(saved),
    onSuccess: async (saved) => {
      onOpenChange(false)
      onSaved(saved, rule)
      await queryClient.invalidateQueries({ queryKey: rulesKey })
    },
    onError: (error) => setRequestError(ruleErrorMessage(error)),
  })

  function next() {
    if (step === 'match') {
      if ('errors' in conditions) {
        setErrors(conditions.errors)
        return
      }
      setErrors({})
      goTo(form.categoryId ? 'review' : 'category')
      return
    }
    if (step === 'category') {
      if (!form.categoryId) {
        setErrors({ categoryId: 'Choisissez une catégorie.' })
        return
      }
      setErrors({})
      goTo('review')
      return
    }
    if ('errors' in result) {
      setErrors(result.errors)
      goTo(
        result.errors.labelPattern || result.errors.amount
          ? 'match'
          : 'category',
      )
      return
    }
    save.mutate(result.body)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    next()
  }

  const stepIndex = STEPS.indexOf(step)
  const accountChoices = accounts.filter(
    (account) =>
      account.id === form.accountId ||
      (isTransactional(account) && !account.archivedAt),
  )
  const filesTransfers = category?.kind === 'transfer'
  const destinationChoices = accounts.filter(
    (account) =>
      account.id === form.counterpartAccountId ||
      (!account.archivedAt && account.id !== form.accountId),
  )
  const conditionsSummary = [
    form.matchType === 'regex' ? 'expression régulière' : null,
    describeConditions(
      'conditions' in conditions
        ? conditions.conditions
        : {
            accountId: form.accountId || null,
            minAmountCents: null,
            maxAmountCents: null,
          },
      accounts,
    ),
  ]
    .filter(Boolean)
    .join(' · ')
  const outcomeSummary = [
    form.merchant.trim() ? `renommé « ${form.merchant.trim()} »` : null,
    form.enabled ? null : 'désactivée',
    form.priority !== 0 ? `priorité ${form.priority}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const sentence = `${MATCH_TYPE_LABELS[form.matchType]} « ${form.labelPattern.trim()} »`

  const header = (
    <div className="flex min-h-14 shrink-0 items-center gap-1 py-2 pr-12 pl-2">
      {stepIndex > 0 ? (
        <Button
          type="button"
          ghost
          variant="secondary"
          onClick={() => goTo(STEPS[stepIndex - 1])}
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
        className="min-w-0 flex-1 text-base leading-tight font-semibold break-words outline-none"
      >
        {STEP_NAMES[step]}
        <span className="text-muted-foreground ml-1.5 text-sm font-normal whitespace-nowrap">
          {stepIndex + 1}/{STEPS.length}
        </span>
      </h3>
    </div>
  )

  const footer = (
    <div className="flex shrink-0 gap-2 border-t px-4 py-3 group-data-keyboard-open/sheet:hidden">
      <Button
        type="submit"
        className="flex-1 font-medium"
        loading={step === 'review' && save.isPending}
        disabled={
          (step === 'match' && form.labelPattern.trim() === '') ||
          (step === 'category' && !form.categoryId)
        }
      >
        {step === 'review' ? (
          'Enregistrer'
        ) : (
          <>
            Suivant
            <ChevronRightIcon aria-hidden />
          </>
        )}
      </Button>
    </div>
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={editorSide(isMobile)}
        className="flex flex-col gap-0 overflow-hidden"
        onOpenAutoFocus={(event) => {
          // The step's heading, never a field: no keyboard on phones.
          event.preventDefault()
          stepRef.current?.focus({ preventScroll: true })
        }}
      >
        {!isMobile && (
          <>
            <SheetTitle className="sr-only">
              {rule ? 'Modifier la règle' : 'Nouvelle règle'}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Les opérations dont le libellé correspond sont classées dans la
              catégorie choisie.
            </SheetDescription>
          </>
        )}
        <form
          noValidate
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col"
        >
          {isMobile ? (
            <SheetBar
              title={STEP_NAMES[step]}
              description={`${rule ? 'Modifier la règle' : 'Nouvelle règle'} · étape ${stepIndex + 1} sur ${STEPS.length}`}
              onBack={
                stepIndex > 0 ? () => goTo(STEPS[stepIndex - 1]) : undefined
              }
              action={
                <SheetBarAction
                  type="submit"
                  label={step === 'review' ? 'Enregistrer' : 'Suivant'}
                  icon={
                    step === 'review' ? undefined : (
                      <ChevronRightIcon aria-hidden strokeWidth={2.6} />
                    )
                  }
                  loading={step === 'review' && save.isPending}
                  disabled={
                    (step === 'match' && form.labelPattern.trim() === '') ||
                    (step === 'category' && !form.categoryId)
                  }
                />
              }
            />
          ) : (
            header
          )}
          <div
            data-sheet-scroll=""
            className="min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4 group-data-[side=screen]/sheet:pt-4"
          >
            {step === 'match' && (
              <>
                <Field data-invalid={errors.labelPattern ? true : undefined}>
                  <FieldLabel htmlFor={`${id}-pattern`}>
                    {form.matchType === 'regex'
                      ? 'Le libellé correspond à'
                      : 'Le libellé contient'}
                  </FieldLabel>
                  <Input
                    id={`${id}-pattern`}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={PATTERN_MAX}
                    placeholder={
                      form.matchType === 'regex'
                        ? 'Ex. : ^PRLV .*EDF'
                        : 'Ex. : UBER EATS'
                    }
                    value={form.labelPattern}
                    aria-invalid={errors.labelPattern ? true : undefined}
                    onChange={(event) =>
                      change({ labelPattern: event.target.value })
                    }
                    className={
                      form.matchType === 'regex' ? 'font-mono' : undefined
                    }
                  />
                  <FieldDescription>
                    {form.matchType === 'contains'
                      ? 'Le libellé de la banque ou le marchand. Majuscules, accents et ponctuation sont ignorés.'
                      : 'Expression régulière, sans distinction de majuscules.'}
                  </FieldDescription>
                  {errors.labelPattern && (
                    <FieldError>{errors.labelPattern}</FieldError>
                  )}
                </Field>

                <RuleMatches
                  conditions={
                    'conditions' in conditions ? conditions.conditions : null
                  }
                  categories={categories}
                />

                <Advanced
                  id={`${id}-conditions`}
                  summary={conditionsSummary || null}
                >
                  <Field>
                    <FieldLabel id={`${id}-match-type`}>
                      Correspondance
                    </FieldLabel>
                    <SegmentedControl
                      fullWidth
                      aria-labelledby={`${id}-match-type`}
                      value={form.matchType}
                      onValueChange={(matchType: RuleMatchType) =>
                        change({ matchType })
                      }
                    >
                      <SegmentedControlItem value="contains">
                        Contient
                      </SegmentedControlItem>
                      <SegmentedControlItem value="regex">
                        Expression
                      </SegmentedControlItem>
                    </SegmentedControl>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${id}-account`}>Compte</FieldLabel>
                    <NativeSelect
                      id={`${id}-account`}
                      className="w-full"
                      value={form.accountId}
                      onChange={(event) =>
                        change({ accountId: event.target.value })
                      }
                    >
                      <NativeSelectOption value="">
                        Tous les comptes
                      </NativeSelectOption>
                      {accountChoices.map((account) => (
                        <NativeSelectOption key={account.id} value={account.id}>
                          {account.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field data-invalid={errors.amount ? true : undefined}>
                    <FieldLabel id={`${id}-amount`}>Montant</FieldLabel>
                    <SegmentedControl
                      fullWidth
                      aria-labelledby={`${id}-amount`}
                      value={form.amountSign}
                      onValueChange={(amountSign: AmountSign) =>
                        change({ amountSign, keptAmounts: null })
                      }
                    >
                      <SegmentedControlItem value="out">
                        Sortie
                      </SegmentedControlItem>
                      <SegmentedControlItem value="in">
                        Entrée
                      </SegmentedControlItem>
                    </SegmentedControl>
                    {/* One field per row (#326 feedback): wide enough on phones. */}
                    <div className="mt-2 space-y-3">
                      <div className="space-y-1.5">
                        <FieldLabel
                          htmlFor={`${id}-min`}
                          className="text-muted-foreground font-normal"
                        >
                          Au moins
                        </FieldLabel>
                        <AmountField
                          id={`${id}-min`}
                          placeholder="Pas de minimum"
                          maxCents={RULE_MAX_AMOUNT_CENTS}
                          value={form.minAmount}
                          aria-invalid={errors.amount ? true : undefined}
                          onValueChange={(minAmount) =>
                            change({ minAmount, keptAmounts: null })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <FieldLabel
                          htmlFor={`${id}-max`}
                          className="text-muted-foreground font-normal"
                        >
                          Au plus
                        </FieldLabel>
                        <AmountField
                          id={`${id}-max`}
                          placeholder="Pas de maximum"
                          maxCents={RULE_MAX_AMOUNT_CENTS}
                          value={form.maxAmount}
                          aria-invalid={errors.amount ? true : undefined}
                          onValueChange={(maxAmount) =>
                            change({ maxAmount, keptAmounts: null })
                          }
                        />
                      </div>
                    </div>
                    {form.keptAmounts ? (
                      <div className="space-y-2">
                        <FieldDescription>
                          Condition actuelle :{' '}
                          {describeAmount(form.keptAmounts)}. Saisissez un
                          montant pour la remplacer.
                        </FieldDescription>
                        <Button
                          type="button"
                          size="sm"
                          outline
                          variant="secondary"
                          onClick={() => change({ keptAmounts: null })}
                        >
                          Retirer la condition de montant
                        </Button>
                      </div>
                    ) : (
                      <FieldDescription>
                        {form.amountSign === 'out'
                          ? 'Montant débité, bornes comprises.'
                          : 'Montant crédité, bornes comprises.'}
                      </FieldDescription>
                    )}
                    {errors.amount && <FieldError>{errors.amount}</FieldError>}
                  </Field>
                </Advanced>
              </>
            )}

            {step === 'category' && (
              <>
                <p className="text-muted-foreground text-sm break-words">
                  {sentence}
                </p>
                <CategoryChips
                  categories={categories}
                  value={form.categoryId}
                  onPick={(categoryId) => {
                    change({ categoryId })
                    setErrors({})
                    goTo('review')
                  }}
                />
                {errors.categoryId && (
                  <p role="alert" className="text-destructive text-sm">
                    {errors.categoryId}
                  </p>
                )}
              </>
            )}

            {step === 'review' && (
              <>
                <div className="divide-y overflow-hidden rounded-lg border">
                  <StepLink label="Opérations" onClick={() => goTo('match')}>
                    <span className="font-medium">{sentence}</span>
                    {conditionsSummary && (
                      <span className="text-muted-foreground block text-xs">
                        {conditionsSummary}
                      </span>
                    )}
                  </StepLink>
                  <StepLink
                    label="Classer dans"
                    onClick={() => goTo('category')}
                  >
                    {category ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <CategoryIcon
                          icon={category.icon}
                          color={category.color}
                          size="sm"
                        />
                        <span className="font-medium">{category.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Catégorie inconnue
                      </span>
                    )}
                  </StepLink>
                </div>
                {category?.archivedAt && (
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Cette catégorie est archivée : choisissez-en une autre ou
                    désactivez la règle.
                  </p>
                )}

                {preview.isPending && body !== null && (
                  <div className="space-y-2" aria-hidden="true">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                )}
                {preview.isError && (
                  <p role="alert" className="text-destructive text-sm">
                    {ruleErrorMessage(preview.error)}
                  </p>
                )}
                {preview.data && (
                  <RulePreview
                    preview={preview.data}
                    categories={categories}
                    rules={rules}
                    selfId={selfId}
                    onPreferOver={(winner) =>
                      change({
                        priority: Math.min(PRIORITY_MAX, winner.priority + 1),
                      })
                    }
                  />
                )}

                <Advanced id={`${id}-outcome`} summary={outcomeSummary || null}>
                  {filesTransfers && (
                    <Field>
                      <FieldLabel htmlFor={`${id}-destination`}>
                        Compte de destination
                      </FieldLabel>
                      <NativeSelect
                        id={`${id}-destination`}
                        className="w-full"
                        value={form.counterpartAccountId}
                        onChange={(event) =>
                          change({ counterpartAccountId: event.target.value })
                        }
                      >
                        <NativeSelectOption value="">Aucun</NativeSelectOption>
                        {destinationChoices.map((account) => (
                          <NativeSelectOption
                            key={account.id}
                            value={account.id}
                          >
                            {account.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <FieldDescription>
                        Les virements classés par cette règle sont liés à ce
                        compte : ceux vers un placement comptent dans son
                        montant investi.
                      </FieldDescription>
                    </Field>
                  )}

                  <Field>
                    <FieldLabel htmlFor={`${id}-merchant`}>
                      Renommer le marchand
                    </FieldLabel>
                    <Input
                      id={`${id}-merchant`}
                      autoComplete="off"
                      maxLength={MERCHANT_MAX}
                      value={form.merchant}
                      onChange={(event) =>
                        change({ merchant: event.target.value })
                      }
                    />
                  </Field>

                  <Field
                    orientation="horizontal"
                    className="min-h-11 items-center"
                  >
                    <Switch
                      id={`${id}-enabled`}
                      checked={form.enabled}
                      onCheckedChange={(enabled) => change({ enabled })}
                    />
                    <FieldLabel htmlFor={`${id}-enabled`}>
                      Règle active
                    </FieldLabel>
                  </Field>

                  <Field>
                    <FieldLabel id={`${id}-priority`}>Priorité</FieldLabel>
                    <div
                      role="group"
                      aria-labelledby={`${id}-priority`}
                      className="flex items-center gap-2"
                    >
                      <Button
                        type="button"
                        variant="secondary"
                        outline
                        iconOnly
                        aria-label="Baisser la priorité"
                        disabled={form.priority <= PRIORITY_MIN}
                        onClick={() => change({ priority: form.priority - 1 })}
                      >
                        <MinusIcon />
                      </Button>
                      <output
                        aria-live="polite"
                        className="min-w-[4rem] flex-1 text-center text-sm tabular-nums"
                      >
                        {form.priority === 0
                          ? 'Normale'
                          : form.priority > 0
                            ? `+${form.priority}`
                            : form.priority}
                      </output>
                      <Button
                        type="button"
                        variant="secondary"
                        outline
                        iconOnly
                        aria-label="Monter la priorité"
                        disabled={form.priority >= PRIORITY_MAX}
                        onClick={() => change({ priority: form.priority + 1 })}
                      >
                        <PlusIcon />
                      </Button>
                    </div>
                    <FieldDescription>
                      Par défaut, la règle la plus précise passe en premier. Une
                      priorité plus haute passe avant, même devant une règle
                      plus précise.
                    </FieldDescription>
                  </Field>
                </Advanced>

                {rule && (
                  <Button
                    type="button"
                    ghost
                    variant="danger"
                    className="w-full"
                    onClick={() => {
                      onOpenChange(false)
                      onDelete(rule)
                    }}
                  >
                    <Trash2Icon aria-hidden />
                    Supprimer la règle
                  </Button>
                )}
              </>
            )}

            {requestError && (
              <p role="alert" className="text-destructive text-sm">
                {requestError}
              </p>
            )}
          </div>
          {!isMobile && footer}
        </form>
      </SheetContent>
    </Sheet>
  )
}
