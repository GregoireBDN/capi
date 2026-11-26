import {
  cn,
  Dialog,
  DialogContent,
  Field,
  FieldError,
  FieldLabel,
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
  ChevronRightIcon,
  CoinsIcon,
  ListChecksIcon,
  PencilIcon,
  ShapesIcon,
  WalletIcon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { toast } from 'sonner'
import type { CategoryIcon } from '#/api/types.gen'
import { AmountField } from '#/components/amount/AmountField'
import { LARGE_AMOUNT_CENTS } from '#/components/amount/signed-amount'
import { parseEurosToCents } from '#/components/budget/amount'
import { IconPicker } from '#/components/categories/IconPicker'
import { currentDay } from '#/lib/calendar'
import { formatCalendarDate, formatCents, formatWholeEuros } from '#/lib/money'
import { accountsQuery, categoriesQuery, isBankAccount } from '#/lib/queries'
import { ROUTES } from '#/lib/routes'
import { EnvelopeAvatar } from './EnvelopeAvatar'
import {
  addMonthsTo,
  ENVELOPE_TEMPLATES,
  monthsUntil,
} from './format'
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
const WHEN_CHOICES: { key: When; label: string }[] = [
  { key: '3', label: 'Dans 3 mois' },
  { key: '6', label: 'Dans 6 mois' },
  { key: '12', label: 'Dans un an' },
  { key: 'date', label: 'Une date…' },
  { key: 'none', label: 'Pas de date' },
]

const TITLES: Record<Step, string> = {
  what: 'Pour quoi ?',
  name: 'Son nom',
  amount: 'Combien ?',
  when: 'Pour quand ?',
  start: 'Pour commencer',
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
  const [start, setStart] = useState<Record<string, string>>({})
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
    setStart({})
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
  const startCents = banks.flatMap((a) => {
    const cents = parseEurosToCents(start[a.id] ?? '')
    return cents && cents > 0 ? [{ accountId: a.id, amountCents: cents }] : []
  })
  const startTotal = startCents.reduce((sum, s) => sum + s.amountCents, 0)
  const categoryIds = (template?.categorySlugs ?? []).flatMap((slug) => {
    const found = (categories.data ?? []).find((c) => c.slug === slug)
    return found ? [found.id] : []
  })

  const errors: Partial<Record<Step, string>> = {
    name: name.trim() === '' ? 'Indiquez un nom.' : undefined,
    amount:
      !noTarget && (targetCents === null || targetCents <= 0)
        ? 'Indiquez un montant, ou « Pas de montant ».'
        : undefined,
    when:
      when === null
        ? 'Choisissez une échéance.'
        : when === 'date' && (!date || date <= today)
          ? 'Choisissez une date à venir.'
          : undefined,
    start: startCents.some((s) => s.amountCents > (freeOf.get(s.accountId) ?? 0))
      ? 'Plus que ce qui est libre sur un compte.'
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

  const index = STEPS.indexOf(step)
  const next = () => {
    setTried(true)
    if (error) return
    if (step === 'review') create.mutate()
    else setStep(STEPS[index + 1])
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
        <div className="space-y-3">
          <Field data-invalid={tried && !!error}>
            <FieldLabel htmlFor={`${id}-target`} className="sr-only">
              Montant
            </FieldLabel>
            <AmountField
              id={`${id}-target`}
              maxCents={LARGE_AMOUNT_CENTS}
              placeholder="1 500"
              value={noTarget ? '' : target}
              disabled={noTarget}
              onValueChange={(typed) => setTarget(typed)}
            />
            {tried && error && <FieldError>{error}</FieldError>}
          </Field>
          <Pill
            pressed={noTarget}
            onClick={() => {
              setNoTarget(!noTarget)
              if (!noTarget) setStep('when')
            }}
          >
            Pas de montant
          </Pill>
        </div>
      )
      break
    case 'when':
      body = (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {WHEN_CHOICES.map((choice) => (
              <Pill
                key={choice.key}
                pressed={when === choice.key}
                onClick={() => setWhen(choice.key)}
              >
                {choice.label}
              </Pill>
            ))}
          </div>
          {when === 'date' && (
            <Field data-invalid={tried && !!error}>
              <FieldLabel htmlFor={`${id}-date`}>Date</FieldLabel>
              <Input
                id={`${id}-date`}
                type="date"
                min={today}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
          )}
          {tried && error && (
            <p className="text-destructive text-sm">{error}</p>
          )}
          {perMonth !== null && (
            <p className="text-lg font-semibold">
              Soit {formatWholeEuros(perMonth)}{' '}
              <span className="text-muted-foreground text-sm font-normal">
                par mois
              </span>
            </p>
          )}
        </div>
      )
      break
    case 'start':
      body = (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Pris sur le « libre » de chaque compte. L’argent ne bouge pas.
          </p>
          <ul className="divide-y rounded-xl border">
            {banks.map((account) => {
              const free = freeOf.get(account.id) ?? 0
              return (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3"
                >
                  <span className="min-w-[7rem] flex-1">
                    <span className="block text-sm font-medium break-normal">
                      {account.name}
                    </span>
                    <span className="text-muted-foreground block text-xs whitespace-nowrap">
                      Libre {formatCents(free)}
                    </span>
                  </span>
                  <AmountField
                    aria-label={`Pour commencer, sur ${account.name}`}
                    groupClassName="ml-auto w-32"
                    placeholder="0"
                    value={start[account.id] ?? ''}
                    disabled={free <= 0}
                    onValueChange={(typed) =>
                      setStart({ ...start, [account.id]: typed })
                    }
                  />
                </li>
              )
            })}
          </ul>
          {tried && error && (
            <p className="text-destructive text-sm">{error}</p>
          )}
          <p className="text-sm">
            Total{' '}
            <span className="font-semibold tabular-nums">
              {formatCents(startTotal)}
            </span>
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
            {targetCents === null ? 'Pas de montant' : formatCents(targetCents)}
          </RecapRow>
          <RecapRow label="Pour quand" onEdit={() => setStep('when')}>
            {dueDate ? formatCalendarDate(dueDate) : 'Pas de date'}
            {perMonth !== null && (
              <span className="text-muted-foreground block text-xs">
                {formatWholeEuros(perMonth)} par mois
              </span>
            )}
          </RecapRow>
          <RecapRow label="Pour commencer" onEdit={() => setStep('start')}>
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
    start: 'Départ',
    review: 'Vérifier',
  }

  const content = (
    <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <SheetBar
        title="Nouvelle enveloppe"
        description={`Étape ${index + 1} sur ${STEPS.length} : ${TITLES[step]}`}
        steps={
          <SheetSteps
            current={step}
            onSelect={(key) => setStep(key as Step)}
            steps={STEPS.map((s, i) => ({
              key: s,
              label: stepLabels[s],
              icon: stepIcons[s],
              disabled: i > index || (i > 0 && template === null),
            }))}
          />
        }
        onBack={index > 0 ? () => setStep(STEPS[index - 1]) : undefined}
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

/** A choice as a rounded pill (« Dans 3 mois », « Pas de montant »). */
function Pill({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'focus-visible:ring-ring min-h-11 rounded-full border px-4 text-sm font-medium outline-none focus-visible:ring-2',
        pressed
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card hover:bg-muted/60',
      )}
    >
      {children}
    </button>
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

