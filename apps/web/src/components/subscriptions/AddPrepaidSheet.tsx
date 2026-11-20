import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Sheet,
  SheetBar,
  SheetBarAction,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Skeleton,
  useIsMobile,
} from '@finances/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { toast } from 'sonner'
import { transactionsControllerList } from '#/api'
import type { TransactionDto } from '#/api/types.gen'
import { displayLabel } from '#/components/transactions/labels'
import { formatCents } from '#/lib/money'
import { unwrap } from '#/lib/queries'
import { ROW_BUTTON, ROW_LIST } from '#/lib/row-list'
import {
  addDays,
  addMonths,
  formatDayMonth,
  prepaidMonthlyCents,
} from './format'
import { PrepaidTermControl } from './PrepaidTermControl'
import {
  declarePrepaid,
  recurringErrorMessage,
  undoablePrepaidToast,
} from './queries'

const NAME_MAX = 255
const STEP_COUNT = 3
/** Debits read: the largest of the last 13 months (or of the search). */
const CANDIDATES_READ = 100
/** Debits listed, one per payee. */
const CANDIDATES_SHOWN = 30

type Screen = 'payment' | 'term' | 'review'

/** Large expenses of the last 13 months, or those matching `q`. */
function candidatesQuery(q: string, today: string) {
  return {
    queryKey: ['transactions', 'prepaid-candidates', q, today] as const,
    queryFn: () =>
      unwrap(
        transactionsControllerList({
          query: {
            kind: 'expense',
            from: addDays(addMonths(today, -13), 1),
            to: today,
            sort: 'amount_asc',
            limit: CANDIDATES_READ,
            ...(q.trim() ? { q: q.trim() } : {}),
          },
          throwOnError: false,
        }),
      ),
    staleTime: 30_000,
  }
}

/**
 * The debits not paying a prepaid plan yet, the largest of each payee only
 * (twelve rents would hide the rest), largest first.
 */
export function largestPerPayee(
  transactions: readonly TransactionDto[],
): TransactionDto[] {
  const seen = new Set<string>()
  const result: TransactionDto[] = []
  for (const transaction of [...transactions].sort(
    (a, b) => a.amountCents - b.amountCents,
  )) {
    if (transaction.amountCents >= 0 || transaction.prepaidItemId !== null) {
      continue
    }
    const payee = displayLabel(transaction).toLowerCase()
    if (seen.has(payee)) continue
    seen.add(payee)
    result.push(transaction)
    if (result.length === CANDIDATES_SHOWN) break
  }
  return result
}

/**
 * « Ajouter un abonnement prépayé » (#314): one decision per screen
 * (owner's choice), « Retour » and « Étape n sur 3 ». 1. the upfront payment
 * among the debits of the last 13 months, largest first, or found by a
 * search; 2. the term; 3. the name and what it gives (monthly cost,
 * renewal), then « Ajouter ». A bottom sheet on phones, a dialog elsewhere;
 * the toast offers « Annuler ».
 */
export function AddPrepaidSheet({
  open,
  onOpenChange,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  today: string
}) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const id = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [screen, setScreen] = useState<Screen>('payment')
  const [search, setSearch] = useState('')
  const [payment, setPayment] = useState<TransactionDto | null>(null)
  const [termMonths, setTermMonths] = useState(12)
  const [name, setName] = useState('')

  // Fresh flow on every opening.
  useEffect(() => {
    if (!open) return
    setScreen('payment')
    setSearch('')
    setPayment(null)
    setTermMonths(12)
    setName('')
  }, [open])
  useEffect(() => {
    headingRef.current?.focus()
  }, [screen])

  const candidates = useQuery({
    ...candidatesQuery(search, today),
    enabled: open && screen === 'payment',
  })
  const debits = largestPerPayee(candidates.data?.items ?? [])

  const add = useMutation({
    mutationFn: () =>
      declarePrepaid({
        transactionId: payment!.id,
        termMonths,
        name: name.trim(),
      }),
    onSuccess: (declaration) => {
      onOpenChange(false)
      undoablePrepaidToast(queryClient, declaration)
    },
    onError: (error) => toast.error(recurringErrorMessage(error)),
  })

  const nameError = name.trim() === '' ? 'Indiquez un nom.' : null
  const amountCents = payment ? -payment.amountCents : 0

  let title: string
  let body: ReactNode
  let action: { label: string; loading?: boolean; disabled?: boolean } | null =
    null
  let onSubmit = () => {}
  switch (screen) {
    case 'payment':
      title = 'Quel paiement ?'
      body = (
        <div className="space-y-3">
          <div className="relative">
            <SearchIcon
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              type="search"
              aria-label="Rechercher un paiement"
              placeholder="Hébergeur, logiciel, assurance…"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <p className="text-muted-foreground text-sm">
            Le paiement fait en une fois pour plusieurs mois. Le plus gros de
            chaque bénéficiaire sur 13 mois, les plus gros d’abord.
          </p>
          {candidates.isPending ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : candidates.isError ? (
            <p className="text-destructive text-sm">
              Impossible de charger les opérations.
            </p>
          ) : debits.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Aucune dépense trouvée.
            </p>
          ) : (
            <ul aria-label="Dépenses" className={cn('bg-card', ROW_LIST)}>
              {debits.map((transaction) => (
                <li key={transaction.id}>
                  <button
                    type="button"
                    className={cn(
                      ROW_BUTTON,
                      'flex min-h-11 items-center gap-2 p-3 text-left',
                    )}
                    onClick={() => {
                      setPayment(transaction)
                      setName(displayLabel(transaction).slice(0, NAME_MAX))
                      setScreen('term')
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {displayLabel(transaction)}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {formatDayMonth(transaction.bookingDate, today)}
                        {transaction.category
                          ? ` · ${transaction.category.name}`
                          : ''}
                        {` · ${transaction.accountName}`}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold whitespace-nowrap tabular-nums">
                      {formatCents(-transaction.amountCents)}
                    </span>
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="text-muted-foreground size-4 shrink-0"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )
      break
    case 'term':
      title = 'Pour combien de mois ?'
      body = payment && (
        <div className="space-y-4">
          <p className="text-sm">
            {displayLabel(payment)} ·{' '}
            <span className="tabular-nums">{formatCents(amountCents)}</span> le{' '}
            {formatDayMonth(payment.bookingDate, today)}
          </p>
          <PrepaidTermControl
            value={termMonths}
            onChange={(next) => setTermMonths(next ?? 12)}
            amountCents={amountCents}
            label="Payé d’avance pour"
          />
        </div>
      )
      action = { label: 'Suivant' }
      onSubmit = () => setScreen('review')
      break
    case 'review':
      title = 'Vérifier'
      body = payment && (
        <div className="space-y-4">
          <Field data-invalid={nameError !== null}>
            <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={NAME_MAX}
              autoComplete="off"
              aria-invalid={nameError !== null}
              onChange={(event) => setName(event.target.value)}
            />
            {nameError && <FieldError>{nameError}</FieldError>}
          </Field>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Par mois</dt>
            <dd className="text-right font-semibold tabular-nums">
              {formatCents(prepaidMonthlyCents(amountCents, termMonths))}
            </dd>
            <dt className="text-muted-foreground">Payé</dt>
            <dd className="text-right tabular-nums">
              {formatCents(amountCents)} le{' '}
              {formatDayMonth(payment.bookingDate, today)}
            </dd>
            <dt className="text-muted-foreground">Durée</dt>
            <dd className="text-right">{termMonths} mois</dd>
            <dt className="text-muted-foreground">Renouvellement</dt>
            <dd className="text-right">
              {formatDayMonth(
                addMonths(payment.bookingDate, termMonths),
                today,
              )}
            </dd>
          </dl>
          <p className="text-muted-foreground text-sm">
            Le paiement reste dans les dépenses de son mois, mais sort des
            moyennes et des budgets proposés. Un rappel vient 30 jours avant le
            renouvellement.
          </p>
        </div>
      )
      action = {
        label: 'Ajouter',
        loading: add.isPending,
        disabled: nameError !== null,
      }
      onSubmit = () => {
        if (!nameError) add.mutate()
      }
      break
  }

  const step = screen === 'payment' ? 1 : screen === 'term' ? 2 : 3
  function back() {
    setScreen(screen === 'review' ? 'term' : 'payment')
  }
  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit()
  }

  const Title = isMobile ? SheetTitle : DialogTitle
  const Description = isMobile ? SheetDescription : DialogDescription
  const content = (
    <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      {isMobile ? (
        <SheetBar
          title={title}
          description={`Abonnement prépayé · étape ${step} sur ${STEP_COUNT}`}
          onBack={screen !== 'payment' ? back : undefined}
          action={
            action && (
              <SheetBarAction
                type="submit"
                label={action.label}
                icon={
                  step === STEP_COUNT ? undefined : (
                    <ChevronRightIcon aria-hidden strokeWidth={2.6} />
                  )
                }
                loading={action.loading}
                disabled={action.disabled}
              />
            )
          }
        />
      ) : (
        <>
          <Title className="sr-only">Ajouter un abonnement prépayé</Title>
          <Description className="sr-only">
            Le paiement, la durée, puis le nom.
          </Description>
          <div className="flex min-h-14 items-center gap-2 py-2 pr-12 pl-2">
            {screen !== 'payment' ? (
              <Button type="button" ghost variant="secondary" onClick={back}>
                <ChevronLeftIcon aria-hidden />
                Retour
              </Button>
            ) : (
              <span className="w-2" />
            )}
            <p className="text-muted-foreground text-sm whitespace-nowrap">
              Étape {step} sur {STEP_COUNT}
            </p>
          </div>
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="px-4 pb-3 text-lg leading-snug font-semibold outline-none"
          >
            {title}
          </h3>
        </>
      )}
      <div
        data-sheet-scroll=""
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4 group-data-[side=screen]/sheet:pt-4"
      >
        {body}
      </div>
      {!isMobile && action && (
        <div className="flex shrink-0 gap-2 border-t px-4 py-3">
          <Button
            type="submit"
            className="min-h-11 flex-1 font-medium"
            loading={action.loading}
            disabled={action.disabled}
          >
            {action.label}
          </Button>
        </div>
      )}
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
