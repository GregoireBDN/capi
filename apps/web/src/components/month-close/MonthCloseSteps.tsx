import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CategoryIcon,
  Checkbox,
  cn,
  formatPercent,
  formatWholeEuros,
  Label,
  ProgressMeter,
  Textarea,
} from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { ChevronRightIcon, CircleCheckIcon } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import type {
  AcknowledgeableStep,
  MonthCloseDto,
  MonthCloseStep,
} from '#/api/types.gen'
import {
  isValuedByHand,
  UpdateValueButton,
} from '#/components/accounts/UpdateValueButton'
import { formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'
import { accountLinkSearch } from '#/components/accounts/account-origin'

export const STEP_TITLES: Record<MonthCloseStep, string> = {
  imports: 'Relevés importés',
  review_queue: 'Opérations à revoir',
  recurring: 'Abonnements et prélèvements',
  budget: 'Budget',
  savings: 'Épargne',
  investments: 'Valeur des placements',
  close: 'Notes et clôture',
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count > 1 ? many : one}`

interface StepsProps {
  review: MonthCloseDto
  /** Saving a tick or the notes is in flight. */
  saving: boolean
  onAcknowledge: (step: AcknowledgeableStep, seen: boolean) => void
  /** Notes as typed (saved on blur and with the close). */
  notesDraft: string
  onNotesDraftChange: (notes: string) => void
  onNotesBlur: () => void
}

/** The review's steps in order, each with what is left and where to fix it. */
export function MonthCloseSteps(props: StepsProps) {
  const { review } = props
  const done = new Map(review.steps.map((step) => [step.key, step.done]))
  return (
    <ol className="space-y-3" aria-label="Étapes">
      {review.steps.map((step, index) => (
        <StepCard
          key={step.key}
          number={index + 1}
          step={step.key}
          done={done.get(step.key) ?? false}
        >
          <StepBody step={step.key} {...props} />
        </StepCard>
      ))}
    </ol>
  )
}

function StepCard({
  number,
  step,
  done,
  children,
}: {
  number: number
  step: MonthCloseStep
  done: boolean
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <li aria-labelledby={titleId} data-step={step} data-done={done}>
      <Card className="min-w-0">
        <CardHeader className="flex flex-row items-center gap-3">
          {done ? (
            <CircleCheckIcon
              aria-hidden
              className="text-chart-delta-good size-6 shrink-0"
            />
          ) : (
            <span
              aria-hidden
              className="text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
            >
              {number}
            </span>
          )}
          <CardTitle id={titleId} className="min-w-0 flex-1">
            {STEP_TITLES[step]}
            <span className="sr-only">{done ? ' : fait' : ' : à faire'}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">{children}</CardContent>
      </Card>
    </li>
  )
}

function StepBody({ step, ...props }: StepsProps & { step: MonthCloseStep }) {
  switch (step) {
    case 'imports':
      return <ImportsStep review={props.review} />
    case 'review_queue':
      return <ReviewQueueStep review={props.review} />
    case 'recurring':
      return <RecurringStep {...props} />
    case 'budget':
      return <BudgetStep {...props} />
    case 'savings':
      return <SavingsStep {...props} />
    case 'investments':
      return <InvestmentsStep review={props.review} />
    case 'close':
      return <NotesStep {...props} />
  }
}

/** A link to the page where the step is fixed. */
function FixLink({ children, ...link }: { children: ReactNode } & LinkTarget) {
  return (
    <Button asChild outline variant="secondary" size="sm">
      <Link {...link}>
        {children}
        <ChevronRightIcon aria-hidden />
      </Link>
    </Button>
  )
}

type LinkTarget =
  | {
      to: typeof ROUTES.import | typeof ROUTES.subscriptions
    }
  | {
      to: typeof ROUTES.transactions
      search: { review: true; month: string }
    }
  | {
      to: typeof ROUTES.budget | typeof ROUTES.savings
      search: { month: string }
    }

function Acknowledge({
  step,
  label,
  review,
  saving,
  onAcknowledge,
}: StepsProps & { step: AcknowledgeableStep; label: string }) {
  const id = useId()
  const closed = review.status === 'closed'
  return (
    <div className="flex min-h-11 items-center gap-2">
      <Checkbox
        id={id}
        checked={review.acknowledged.includes(step)}
        disabled={closed || saving}
        onCheckedChange={(value) => onAcknowledge(step, value === true)}
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  )
}

function ImportsStep({ review }: { review: MonthCloseDto }) {
  const { accounts, gaps } = review.imports
  return (
    <>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground">Aucun compte courant ou livret.</p>
      ) : (
        <ul className="divide-y">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex flex-wrap justify-between gap-x-3 py-1.5"
            >
              <span className="min-w-[7rem] flex-1 break-words">
                {account.name}
              </span>
              <span
                className={cn(
                  'ml-auto text-right',
                  account.upToDate
                    ? 'text-muted-foreground'
                    : 'text-chart-delta-bad',
                )}
              >
                {account.upToDate
                  ? account.lastDate === null
                    ? 'à jour'
                    : `à jour au ${formatShortDay(account.lastDate)}`
                  : account.lastDate === null
                    ? 'aucune donnée'
                    : `au ${formatShortDay(account.lastDate)}, ${plural(account.missingDays, 'jour manquant', 'jours manquants')}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {gaps.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium">Soldes qui ne se suivent pas</p>
          <ul className="space-y-1">
            {gaps.map((gap) => (
              <li
                key={`${gap.accountId}-${gap.toDate}`}
                className="flex flex-wrap justify-between gap-x-3"
              >
                <span className="min-w-[7rem] flex-1">
                  {gap.accountName} : entre le {formatShortDay(gap.fromDate)} et
                  le {formatShortDay(gap.toDate)}
                </span>
                <span className="ml-auto font-medium whitespace-nowrap tabular-nums">
                  {formatCents(gap.differenceCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <FixLink to={ROUTES.import}>Importer un relevé</FixLink>
    </>
  )
}

function ReviewQueueStep({ review }: { review: MonthCloseDto }) {
  const { count } = review.reviewQueue
  return (
    <>
      <p className={cn(count === 0 && 'text-muted-foreground')}>
        {count === 0
          ? 'Toutes les opérations du mois sont rangées.'
          : `${plural(count, 'opération', 'opérations')} du mois à revoir.`}
      </p>
      {count > 0 && (
        <FixLink
          to={ROUTES.transactions}
          search={{ review: true, month: review.month }}
        >
          Revoir
        </FixLink>
      )}
    </>
  )
}

function RecurringStep(props: StepsProps) {
  const { suggestedCount, priceChanges, chargedAfterEnd } =
    props.review.recurring
  return (
    <>
      <p className={cn(suggestedCount === 0 && 'text-muted-foreground')}>
        {suggestedCount === 0
          ? 'Tous les prélèvements détectés sont confirmés ou écartés.'
          : `${plural(suggestedCount, 'prélèvement détecté', 'prélèvements détectés')} à confirmer.`}
      </p>
      {chargedAfterEnd.length > 0 && (
        <div className="space-y-1">
          <p className="text-warning-foreground dark:text-warning font-medium">
            Prélevés après la résiliation
          </p>
          <ul className="space-y-1">
            {chargedAfterEnd.map((charge) => (
              <li
                key={charge.id}
                className="flex flex-wrap justify-between gap-x-3"
              >
                <span className="min-w-[7rem] flex-1 break-words">
                  {charge.name}{' '}
                  <span className="text-muted-foreground">
                    le {formatShortDay(charge.chargedOn)}, résilié au{' '}
                    {formatShortDay(charge.endedOn)}
                  </span>
                </span>
                <span className="ml-auto whitespace-nowrap tabular-nums">
                  {formatCents(charge.amountCents)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            Vérifiez la résiliation auprès du fournisseur, ou réactivez
            l’abonnement s’il continue.
          </p>
          {suggestedCount === 0 && (
            <FixLink to={ROUTES.subscriptions}>Voir les abonnements</FixLink>
          )}
        </div>
      )}
      {priceChanges.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium">Changements de prix</p>
          <ul className="space-y-1">
            {priceChanges.map((change) => (
              <li
                key={change.id}
                className="flex flex-wrap justify-between gap-x-3"
              >
                <span className="min-w-[7rem] flex-1 break-words">
                  {change.name}{' '}
                  <span className="text-muted-foreground">
                    le {formatShortDay(change.priceChangedOn)}
                  </span>
                </span>
                <span className="ml-auto whitespace-nowrap tabular-nums">
                  {change.previousAmountCents !== null &&
                    `${formatCents(change.previousAmountCents)} → `}
                  {formatCents(change.latestAmountCents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(priceChanges.length > 0 || chargedAfterEnd.length > 0) && (
        <Acknowledge
          {...props}
          step="recurring"
          label={
            priceChanges.length > 0 && chargedAfterEnd.length > 0
              ? 'Changements vus'
              : priceChanges.length > 0
                ? 'Changements de prix vus'
                : 'Prélèvements vus'
          }
        />
      )}
      {suggestedCount > 0 && (
        <FixLink to={ROUTES.subscriptions}>Confirmer</FixLink>
      )}
    </>
  )
}

function BudgetStep(props: StepsProps) {
  const { budget, income, month, nextMonth } = props.review
  return (
    <>
      {income.shortfalls.length > 0 && (
        <ul className="space-y-1" aria-label="Revenus pas reçus comme prévu">
          {income.shortfalls.map((line) => (
            <li
              key={line.categoryId}
              className="flex flex-wrap items-center justify-between gap-x-3"
            >
              <span className="flex min-w-[7rem] flex-1 items-center gap-2">
                <CategoryIcon icon={line.icon} color={line.color} size="sm" />
                <span className="min-w-0 break-words">{line.name}</span>
              </span>
              <span className="text-warning-foreground dark:text-warning ml-auto whitespace-nowrap tabular-nums">
                {line.status === 'missing'
                  ? `pas reçu (${formatWholeEuros(line.plannedCents)} prévus)`
                  : `${formatWholeEuros(line.plannedCents - (line.receivedCents ?? 0))} de moins que prévu`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {budget.budgetCount > 0 ? (
        <>
          <ProgressMeter
            label="Dépensé"
            value={budget.spentCents}
            target={budget.targetCents}
            valueFormatter={formatWholeEuros}
          />
          {budget.over.length > 0 && (
            <ul className="space-y-1" aria-label="Au-dessus de la cible">
              {budget.over.map((line) => (
                <li
                  key={line.categoryId}
                  className="flex flex-wrap items-center justify-between gap-x-3"
                >
                  <span className="flex min-w-[7rem] flex-1 items-center gap-2">
                    <CategoryIcon
                      icon={line.icon}
                      color={line.color}
                      size="sm"
                    />
                    <span className="min-w-0 break-words">{line.name}</span>
                  </span>
                  <span className="text-chart-delta-bad ml-auto whitespace-nowrap tabular-nums">
                    {formatWholeEuros(line.gapCents)} de trop
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">Pas de budget fixé ce mois-ci.</p>
      )}
      <Acknowledge {...props} step="budget" label="Budget relu" />
      <div className="flex flex-wrap gap-2">
        <FixLink to={ROUTES.budget} search={{ month }}>
          Voir le budget
        </FixLink>
        <FixLink to={ROUTES.budget} search={{ month: nextMonth }}>
          Préparer le mois suivant
        </FixLink>
      </div>
    </>
  )
}

function SavingsStep(props: StepsProps) {
  const { savings } = props.review
  return (
    <>
      {savings.targetCents !== null ? (
        <ProgressMeter
          goal="reach"
          label="Épargné"
          value={savings.netCents}
          target={savings.targetCents}
          valueFormatter={formatWholeEuros}
        />
      ) : (
        <p>
          Épargné :{' '}
          <span className="font-medium whitespace-nowrap tabular-nums">
            {formatWholeEuros(savings.netCents)}
          </span>{' '}
          <span className="text-muted-foreground">(pas de cible)</span>
        </p>
      )}
      {savings.goals.length > 0 && (
        <ul className="space-y-1" aria-label="Objectifs">
          {savings.goals.map((goal) => (
            <li
              key={goal.id}
              className="flex flex-wrap justify-between gap-x-3"
            >
              <span className="min-w-[7rem] flex-1 break-words">
                {goal.name}
              </span>
              <span className="text-muted-foreground ml-auto whitespace-nowrap tabular-nums">
                {goal.reached
                  ? 'atteint'
                  : `${formatPercent(goal.progressRatio)} de ${formatWholeEuros(goal.targetCents)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Acknowledge {...props} step="savings" label="Épargne relue" />
      <FixLink to={ROUTES.savings} search={{ month: props.review.month }}>
        Voir l’épargne
      </FixLink>
    </>
  )
}

function InvestmentsStep({ review }: { review: MonthCloseDto }) {
  const { accounts } = review.investments
  if (accounts.length === 0) {
    return (
      <p className="text-muted-foreground">
        Chaque placement a une valeur à la fin du mois.
      </p>
    )
  }
  return (
    <ul className="divide-y">
      {accounts.map((account) => (
        <li
          key={account.id}
          className="flex min-h-11 flex-wrap items-center gap-x-3 py-1"
        >
          <span className="min-w-[7rem] flex-1">
            <Link
              to={ROUTES.account}
              params={{ accountId: account.id }}
              search={accountLinkSearch('month-review')}
              className="break-words hover:underline"
            >
              {account.name}
            </Link>
            <span className="text-muted-foreground block text-xs">
              {account.lastDate === null
                ? 'Aucune valeur'
                : `Valeur au ${formatShortDay(account.lastDate)}`}
            </span>
          </span>
          {isValuedByHand(account.type) && (
            <span className="ml-auto">
              <UpdateValueButton account={account} display="label" />
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

function NotesStep({
  review,
  notesDraft,
  onNotesDraftChange,
  onNotesBlur,
}: StepsProps) {
  const id = useId()
  const closed = review.status === 'closed'
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Notes du mois</Label>
      <Textarea
        id={id}
        value={notesDraft}
        maxLength={4000}
        disabled={closed}
        placeholder="Ce qui a marqué le mois, ce qu’il faut changer…"
        onChange={(event) => onNotesDraftChange(event.target.value)}
        onBlur={onNotesBlur}
      />
      <p className="text-muted-foreground text-xs">
        {closed
          ? 'Rouvrez le mois pour modifier les notes.'
          : 'Enregistrées en quittant le champ et à la clôture.'}
      </p>
    </div>
  )
}
