import {
  Button,
  cn,
  Dialog,
  DialogContent,
  Field,
  FieldError,
  FieldLabel,
  DateField,
  Input,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  SheetSteps,
  useIsMobile,
} from '@capi/ui'
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  CalendarIcon,
  CalendarOffIcon,
  ChevronRightIcon,
  CoinsIcon,
  InfinityIcon,
  ListChecksIcon,
  PencilIcon,
  ShapesIcon,
  TargetIcon,
  WalletIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { toast } from 'sonner'
import type { CategoryIcon } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import { LARGE_AMOUNT_CENTS } from '#/components/amount/signed-amount'
import { centsToInput, parseEurosToCents } from '#/components/budget/amount'
import { IconPicker } from '#/components/categories/IconPicker'
import { currentDay } from '#/lib/calendar'
import { formatCalendarDate, formatCents, formatWholeEuros } from '#/lib/money'
import { accountsQuery, categoriesQuery, isBankAccount } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { AccountChips } from './AccountChips'
import { ChoiceList } from './ChoiceList'
import { EnvelopeAvatar } from './EnvelopeAvatar'
import { addMonthsTo, ENVELOPE_TEMPLATES, monthsUntil } from './format'
import type { EnvelopeTemplate } from './format'
import {
  accountEnvelopesQuery,
  afterEnvelopesChanged,
  createEnvelope,
  envelopeErrorMessage,
} from './queries'

const NAME_MAX = 100

type Step = 'what' | 'name' | 'amount' | 'when' | 'start' | 'review'
const STEPS: readonly Step[] = [
  'what',
  'name',
  'amount',
  'when',
  'start',
  'review',
]
type When = '3' | '6' | '12' | 'date' | 'none'
const WHEN_CHOICES: { key: When; label: string; months?: number }[] = [
  { key: '3', label: 'Dans 3 mois', months: 3 },
  { key: '6', label: 'Dans 6 mois', months: 6 },
  { key: '12', label: 'Dans un an', months: 12 },
  { key: 'date', label: 'Une date…' },
  { key: 'none', label: 'Pas de date' },
]

const TITLES: Record<Step, string> = {
  what: 'Pour quoi ?',
  name: 'Son nom',
  amount: 'Un objectif ?',
  when: 'Pour quand ?',
  start: 'Déjà de côté ?',
  review: 'C’est bon ?',
}

/**
 * « Nouvelle enveloppe » (#428, « B. Modèle d'abord »), six screens with
 * Suivant / Retour: a template (it fills in the icon, colour and
 * categories), the name and icon, the target (or none), the due date (or
 * none) with what it means per month, what to set aside from each bank
 * account's « libre » (the money does not move), then a recap whose lines
 * go back to their step. The split key is set on each account's page.
 */
export function CreateEnvelopeSheet({
  open,
  onOpenChange,
  accountId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The account it was started from: first in « Pour commencer ». */
  accountId?: string
}) {
  const isMobile = useIsMobile()
  const id = useId()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const today = currentDay()

  const [step, setStep] = useState<Step>('what')
  const [template, setTemplate] = useState<EnvelopeTemplate | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<CategoryIcon>('piggy-bank')
  const [target, setTarget] = useState('')
  const [noTarget, setNoTarget] = useState(false)
  const [when, setWhen] = useState<When | null>(null)
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [startAccount, setStartAccount] = useState<string | null>(null)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep('what')
    setTemplate(null)
    setName('')
    setIcon('piggy-bank')
    setTarget('')
    setNoTarget(false)
    setWhen(null)
    setDate('')
    setStart('')
    setStartAccount(null)
    setTried(false)
  }, [open])
  useEffect(() => {
    headingRef.current?.focus()
    setTried(false)
  }, [step])

  const categories = useQuery({ ...categoriesQuery, enabled: open })
  const accounts = useQuery({ ...accountsQuery, enabled: open })
  const banks = (accounts.data ?? [])
    .filter((a) => isBankAccount(a) && a.archivedAt === null)
    .sort((a, b) => Number(b.id === accountId) - Number(a.id === accountId))
  const splits = useQueries({
    queries: banks.map((a) => ({
      ...accountEnvelopesQuery(a.id),
      enabled: open && step !== 'what',
    })),
  })
  const freeOf = new Map(
    banks.map((a, i) => [a.id, Math.max(0, splits[i]?.data?.freeCents ?? 0)]),
  )

  const color = template?.color ?? '#1baf7a'
  const targetCents = noTarget ? null : parseEurosToCents(target)
  const dueDate =
    when === null || when === 'none'
      ? null
      : when === 'date'
        ? date || null
        : addMonthsTo(today, Number(when))
  // « Déjà de côté ? » (#430, the owner: one amount like « Ajouter »): on
  // the account it was started from, else the one with the most « libre »;
  // one chip per account changes it. More accounts later with « Ajouter ».
  const bestStart = [...banks]
    .sort(
      (a, b) =>
        Number(b.id === accountId) - Number(a.id === accountId) ||
        (freeOf.get(b.id) ?? 0) - (freeOf.get(a.id) ?? 0),
    )
    .at(0)
  const loaded = splits.every((q) => q.data !== undefined)
  const startOn =
    banks.find((a) => a.id === startAccount) ?? (loaded ? bestStart : undefined)
  const startFree = startOn ? (freeOf.get(startOn.id) ?? 0) : 0
  const typedStart = parseEurosToCents(start)
  const startCents =
    startOn && typedStart && typedStart > 0
      ? [{ accountId: startOn.id, amountCents: typedStart }]
      : []
  const startTotal = startCents.reduce((sum, s) => sum + s.amountCents, 0)
  const categoryIds = (template?.categorySlugs ?? []).flatMap((slug) => {
    const found = (categories.data ?? []).find((c) => c.slug === slug)
    return found ? [found.id] : []
  })

  const errors: Partial<Record<Step, string>> = {
    name: name.trim() === '' ? 'Indiquez un nom.' : undefined,
    amount:
      !noTarget && (targetCents === null || targetCents <= 0)
        ? 'Indiquez un montant.'
        : undefined,
    when:
      when === null
        ? 'Choisissez une échéance.'
        : when === 'date' && (!date || date <= today)
          ? 'Choisissez une date à venir.'
          : undefined,
    start:
      startTotal > startFree
        ? `Au plus ${formatCents(startFree)} sur ce compte.`
        : undefined,
  }
  const error = errors[step]

  const create = useMutation({
    mutationFn: () =>
      createEnvelope({
        name: name.trim(),
        icon,
        color,
        targetCents,
        dueDate,
        categoryIds,
        start: startCents,
      }),
    onSuccess: async (envelope) => {
      await afterEnvelopesChanged(queryClient)
      toast.success(`Enveloppe ${envelope.name} créée`)
      onOpenChange(false)
      void navigate({
        to: ROUTES.envelope,
        params: { envelopeId: envelope.id },
      })
    },
    onError: (e) => toast.error(envelopeErrorMessage(e)),
  })

  // Without a target, no due date: « Pour quand ? » is skipped (#430).
  const steps = noTarget ? STEPS.filter((s) => s !== 'when') : STEPS
  const index = steps.indexOf(step)
  const next = () => {
    setTried(true)
    if (error) return
    if (step === 'review') create.mutate()
    else setStep(steps[index + 1])
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    next()
  }
  function pickTemplate(t: EnvelopeTemplate) {
    setTemplate(t)
    setName(t.name)
    setIcon(t.icon)
    setStep('name')
  }

  const monthlyFor = (due: string) =>
    targetCents
      ? Math.ceil(
          Math.max(0, targetCents - startTotal) / monthsUntil(today, due),
        )
      : null
  const perMonth =
    targetCents && dueDate
      ? Math.ceil(
          Math.max(0, targetCents - startTotal) / monthsUntil(today, dueDate),
        )
      : null

  let body: ReactNode
  switch (step) {
    case 'what':
      body = (
        <div className="grid grid-cols-2 gap-2 @md:grid-cols-3">
          {ENVELOPE_TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={template?.key === t.key}
              onClick={() => pickTemplate(t)}
              className={cn(
                'bg-card hover:bg-muted/60 focus-visible:ring-ring flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium outline-none focus-visible:ring-2',
                template?.key === t.key && 'border-primary',
              )}
            >
              <EnvelopeAvatar envelope={t} size="lg" />
              {t.label}
            </button>
          ))}
        </div>
      )
      break
    case 'name':
      body = (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <EnvelopeAvatar envelope={{ icon, color }} size="lg" />
            <Field className="flex-1" data-invalid={tried && !!error}>
              <FieldLabel htmlFor={`${id}-name`} className="sr-only">
                Nom
              </FieldLabel>
              <Input
                id={`${id}-name`}
                value={name}
                maxLength={NAME_MAX}
                autoComplete="off"
                placeholder="Lisbonne en mai"
                aria-invalid={tried && !!error}
                onChange={(event) => setName(event.target.value)}
              />
              {tried && error && <FieldError>{error}</FieldError>}
            </Field>
          </div>
          <IconPicker
            label="Icône"
            value={icon}
            color={color}
            onChange={(chosen) => setIcon(chosen)}
          />
        </div>
      )
      break
    case 'amount':
      body = (
        <div className="space-y-4">
          <div
            role="radiogroup"
            aria-label="Objectif"
            className="grid grid-cols-2 gap-2"
          >
            {[
              {
                none: false,
                icon: <TargetIcon aria-hidden />,
                label: 'Un objectif',
                hint: 'Un voyage, un achat',
              },
              {
                none: true,
                icon: <InfinityIcon aria-hidden />,
                label: 'Sans objectif',
                hint: 'Imprévus, cadeaux',
              },
            ].map((choice) => (
              <button
                key={choice.label}
                type="button"
                role="radio"
                aria-checked={noTarget === choice.none}
                onClick={() => {
                  setNoTarget(choice.none)
                  if (choice.none) setWhen(null)
                }}
                className={cn(
                  'bg-card hover:bg-muted/60 focus-visible:ring-ring flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center outline-none focus-visible:ring-2 [&_svg]:size-6',
                  noTarget === choice.none &&
                    'border-primary bg-[color-mix(in_srgb,var(--primary)_8%,var(--card))] [&_svg]:text-primary',
                )}
              >
                {choice.icon}
                <span className="text-sm font-medium">{choice.label}</span>
                <span className="text-muted-foreground text-xs">
                  {choice.hint}
                </span>
              </button>
            ))}
          </div>
          {!noTarget && (
            <Field data-invalid={tried && !!error}>
              <FieldLabel htmlFor={`${id}-target`}>Montant visé</FieldLabel>
              <AmountField
                id={`${id}-target`}
                maxCents={LARGE_AMOUNT_CENTS}
                placeholder="1 500"
                value={target}
                onValueChange={(typed) => setTarget(typed)}
              />
              {tried && error && <FieldError>{error}</FieldError>}
            </Field>
          )}
        </div>
      )
      break
    case 'when':
      body = (
        <div className="space-y-3">
          <ChoiceList
            label="Pour quand"
            value={when}
            onChange={(choice) => setWhen(choice as When)}
            choices={WHEN_CHOICES.map((choice) => {
              const monthly =
                choice.months !== undefined
                  ? monthlyFor(addMonthsTo(today, choice.months))
                  : choice.key === 'date' && when === 'date' && dueDate
                    ? monthlyFor(dueDate)
                    : null
              return {
                id: choice.key,
                icon: (
                  <span className="bg-muted text-muted-foreground grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold [&_svg]:size-[0.8rem]">
                    {choice.months ??
                      (choice.key === 'date' ? (
                        <CalendarIcon aria-hidden />
                      ) : (
                        <CalendarOffIcon aria-hidden />
                      ))}
                  </span>
                ),
                label: choice.label,
                value:
                  monthly === null ? undefined : (
                    <span className="whitespace-nowrap">
                      {formatWholeEuros(monthly)}
                      <span className="text-muted-foreground text-xs font-normal">
                        {' '}
                        /mois
                      </span>
                    </span>
                  ),
              }
            })}
          />
          {when === 'date' && (
            <Field data-invalid={tried && !!error}>
              <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
              <DateField
                id={`${id}-date`}
                title="Date"
                min={today}
                value={date}
                onChange={(day) => setDate(day)}
              />
            </Field>
          )}
          {tried && error && (
            <p className="text-destructive text-sm">{error}</p>
          )}
        </div>
      )
      break
    case 'start':
      body = (
        <div className="space-y-3">
          <AccountChips
            accounts={banks.map((a) => ({
              accountId: a.id,
              name: a.name,
              cents: freeOf.get(a.id) ?? 0,
            }))}
            value={startOn?.id ?? null}
            onChange={(chosen) => {
              setStartAccount(chosen)
              setStart('')
            }}
          />
          <Field data-invalid={tried && !!error}>
            <FieldLabel htmlFor={`${id}-start`} className="sr-only">
              Déjà de côté
            </FieldLabel>
            <div className="flex items-center gap-2">
              <AmountField
                id={`${id}-start`}
                groupClassName="flex-1"
                placeholder="0"
                value={start}
                disabled={startFree <= 0}
                onValueChange={(typed) => setStart(typed)}
              />
              <Button
                type="button"
                variant="secondary"
                outline
                disabled={startFree <= 0}
                onClick={() => setStart(centsToInput(startFree))}
              >
                Tout
              </Button>
            </div>
            {tried && error && <FieldError>{error}</FieldError>}
          </Field>
          <p className="text-muted-foreground text-xs">
            Vide : rien pour l’instant.
          </p>
        </div>
      )
      break
    case 'review':
      body = (
        <ul className="divide-y rounded-xl border">
          <RecapRow label="Nom" onEdit={() => setStep('name')}>
            <span className="flex items-center gap-2">
              <EnvelopeAvatar envelope={{ icon, color }} size="sm" />
              {name.trim()}
            </span>
          </RecapRow>
          <RecapRow label="Montant" onEdit={() => setStep('amount')}>
            {targetCents === null ? 'Sans objectif' : formatCents(targetCents)}
          </RecapRow>
          {!noTarget && (
            <RecapRow label="Pour quand" onEdit={() => setStep('when')}>
              {dueDate ? formatCalendarDate(dueDate) : 'Pas de date'}
              {perMonth !== null && (
                <span className="text-muted-foreground block text-xs">
                  {formatWholeEuros(perMonth)} par mois
                </span>
              )}
            </RecapRow>
          )}
          <RecapRow label="Déjà de côté" onEdit={() => setStep('start')}>
            {startCents.length === 0
              ? 'Rien'
              : startCents
                  .map(
                    (s) =>
                      `${banks.find((a) => a.id === s.accountId)?.name ?? ''} ${formatCents(s.amountCents)}`,
                  )
                  .join(' · ')}
          </RecapRow>
          {categoryIds.length > 0 && (
            <RecapRow label="Paie pour" onEdit={() => setStep('what')}>
              {categoryIds
                .map(
                  (cid) =>
                    (categories.data ?? []).find((c) => c.id === cid)?.name,
                )
                .join(', ')}
            </RecapRow>
          )}
        </ul>
      )
      break
  }

  const stepIcons: Record<Step, ReactNode> = {
    what: <ShapesIcon aria-hidden />,
    name: <PencilIcon aria-hidden />,
    amount: <CoinsIcon aria-hidden />,
    when: <CalendarIcon aria-hidden />,
    start: <WalletIcon aria-hidden />,
    review: <ListChecksIcon aria-hidden />,
  }
  const stepLabels: Record<Step, string> = {
    what: 'Pour quoi',
    name: 'Nom',
    amount: 'Montant',
    when: 'Quand',
    start: 'Déjà',
    review: 'Vérifier',
  }

  const content = (
    <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetBar
        title="Nouvelle enveloppe"
        description={`Étape ${index + 1} sur ${steps.length} : ${TITLES[step]}`}
        steps={
          <SheetSteps
            current={step}
            onSelect={(key) => setStep(key as Step)}
            steps={steps.map((s, i) => ({
              key: s,
              label: stepLabels[s],
              icon: stepIcons[s],
              disabled: i > index || (i > 0 && template === null),
            }))}
          />
        }
        onBack={index > 0 ? () => setStep(steps[index - 1]) : undefined}
        action={
          step === 'what' ? undefined : (
            <SheetBarAction
              type="submit"
              label={step === 'review' ? 'Créer' : 'Suivant'}
              icon={
                step === 'review' ? undefined : (
                  <ChevronRightIcon aria-hidden strokeWidth={2.6} />
                )
              }
              loading={create.isPending}
            />
          )
        }
      />
      <div
        data-sheet-scroll=""
        className="@container min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-4 pb-4"
      >
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="pb-3 text-lg leading-snug font-semibold outline-none"
        >
          {TITLES[step]}
        </h3>
        {body}
      </div>
    </form>
  )

  return isMobile ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="screen">{content}</SheetContent>
    </Sheet>
  ) : (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[min(40rem,calc(100svh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          headingRef.current?.focus()
        }}
      >
        {content}
      </DialogContent>
    </Dialog>
  )
}

/** A line of « C'est bon ? »: tapping it goes back to its step. */
function RecapRow({
  label,
  onEdit,
  children,
}: {
  label: string
  onEdit: () => void
  children: ReactNode
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Modifier : ${label}`}
        className="hover:bg-muted/60 focus-visible:ring-ring flex min-h-11 w-full items-center gap-3 p-3 text-left text-sm outline-none focus-visible:ring-2"
      >
        <span className="min-w-0 flex-1 break-normal">
          <span className="text-muted-foreground block text-xs">{label}</span>
          <span className="block font-medium">{children}</span>
        </span>
        <ChevronRightIcon
          aria-hidden
          className="text-muted-foreground size-4 shrink-0"
        />
      </button>
    </li>
  )
}
