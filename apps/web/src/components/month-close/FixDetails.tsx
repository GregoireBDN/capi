import { Button, cn } from '@capi/ui'
import { Link } from '@tanstack/react-router'
import { CheckIcon, ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { AcknowledgeableStep, MonthCloseDto } from '#/api/types.gen'
import {
  isValuedByHand,
  UpdateValueButton,
} from '#/components/accounts/UpdateValueButton'
import { accountLinkSearch } from '#/components/accounts/account-origin'
import { formatCents } from '#/lib/money'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'

/**
 * What a step left to fix shows in its sheet (#541): each line with where
 * it is fixed. Budget and savings are no longer steps to tick: the month's
 * answer shows them.
 */
const plural = (count: number, one: string, many: string) =>
  `${count} ${count > 1 ? many : one}`

export interface FixProps {
  review: MonthCloseDto
  /** Saving a tick is in flight. */
  saving: boolean
  onAcknowledge: (step: AcknowledgeableStep, seen: boolean) => void
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

/** « Vu »: the judgement step ticked from its sheet. */
function Acknowledge({
  step,
  review,
  saving,
  onAcknowledge,
}: FixProps & { step: AcknowledgeableStep }) {
  const seen = review.acknowledged.includes(step)
  return (
    <Button
      size="sm"
      variant={seen ? 'secondary' : 'primary'}
      outline={seen}
      iconStart={<CheckIcon />}
      disabled={review.status === 'closed'}
      loading={saving}
      aria-pressed={seen}
      onClick={() => onAcknowledge(step, !seen)}
    >
      Vu
    </Button>
  )
}

export function ImportsStep({ review }: { review: MonthCloseDto }) {
  const { accounts, gaps } = review.imports
  return (
    <>
      {accounts.length === 0 ? (
        <p className="text-muted-foreground">Aucun compte courant ou livret.</p>
      ) : (
        <ul className="space-y-1">
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

export function ReviewQueueStep({ review }: { review: MonthCloseDto }) {
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

export function RecurringStep(props: FixProps) {
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
        <Acknowledge {...props} step="recurring" />
      )}
      {suggestedCount > 0 && (
        <FixLink to={ROUTES.subscriptions}>Confirmer</FixLink>
      )}
    </>
  )
}

export function InvestmentsStep({ review }: { review: MonthCloseDto }) {
  const { accounts } = review.investments
  if (accounts.length === 0) {
    return (
      <p className="text-muted-foreground">
        Chaque placement a une valeur à la fin du mois.
      </p>
    )
  }
  return (
    <ul className="space-y-1">
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
