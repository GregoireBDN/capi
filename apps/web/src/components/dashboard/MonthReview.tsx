import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  formatPercent,
  formatWholeEuros,
  ProgressMeter,
} from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { ChevronRightIcon, ListChecksIcon, UploadIcon } from 'lucide-react'
import type {
  MonthReviewDto,
  ReviewCategoryDto,
  ReviewMissingAccountDto,
} from '#/api/types.gen'
import {
  isValuedByHand,
  UpdateValueButton,
} from '#/components/accounts/UpdateValueButton'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { ofMonth } from '#/lib/calendar'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'

const signedWholeEuros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})

/** `+1 120 €`, `−60 €`, `0 €`. */
export function formatSignedWhole(cents: number): string {
  return signedWholeEuros.format(cents / 100)
}

interface MonthReviewProps {
  review: MonthReviewDto
  /** Latest month that can be reviewed (the previous calendar month). */
  latest: string
  onMonthChange: (month: string) => void
}

/**
 * Review of a closed month: where the net worth ended and what moved it
 * (saved from the month's income and expenses vs investments and the rest),
 * spending against the budget with the categories that drifted most, and
 * what is missing while the month isn't fully imported.
 */
export function MonthReview({
  review,
  latest,
  onMonthChange,
}: MonthReviewProps) {
  const { month, budget, flow, missing, closed } = review

  return (
    <section aria-labelledby="month-review-title" className="min-w-0">
      <Card className="min-w-0">
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <CardTitle id="month-review-title">
              Bilan {ofMonth(month)}
            </CardTitle>
            <Badge variant={closed ? 'success' : 'warning'}>
              {closed ? 'Complet' : 'À compléter'}
            </Badge>
          </div>
          <MonthNavigator
            month={month}
            max={latest}
            onMonthChange={onMonthChange}
          />
        </CardHeader>

        <CardContent className="space-y-5">
          {missing.length > 0 && <MissingAccounts accounts={missing} />}

          <NetWorthSection review={review} />

          <section aria-label="Budget" className="space-y-3">
            {budget.budgetCount > 0 ? (
              <>
                <ProgressMeter
                  label="Dépensé"
                  value={budget.spentCents}
                  target={budget.targetCents}
                  valueFormatter={formatWholeEuros}
                  hideStatus
                />
                <p className="flex flex-wrap justify-between gap-x-3 text-sm">
                  <span
                    className={cn(
                      'font-medium whitespace-nowrap',
                      budget.remainingCents < 0 && 'text-chart-delta-bad',
                    )}
                  >
                    {budget.remainingCents < 0
                      ? `Dépassé de ${formatWholeEuros(-budget.remainingCents)}`
                      : `Reste ${formatWholeEuros(budget.remainingCents)}`}
                  </span>
                  {budget.unbudgetedCents > 0 && (
                    <span className="text-muted-foreground whitespace-nowrap">
                      + {formatWholeEuros(budget.unbudgetedCents)} hors budget
                    </span>
                  )}
                </p>
                <Drift month={month} over={budget.over} under={budget.under} />
              </>
            ) : (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-muted-foreground text-sm">
                  Dépensé, sans budget fixé
                </p>
                <p className="text-lg font-semibold whitespace-nowrap tabular-nums">
                  {formatWholeEuros(-flow.expenseCents)}
                </p>
              </div>
            )}
          </section>

          <div className="grid gap-2">
            <Button asChild className="w-full">
              <Link to={ROUTES.budget} search={{ month: review.nextMonth }}>
                Préparer le budget {ofMonth(review.nextMonth)}
              </Link>
            </Button>
            <Button asChild outline variant="secondary" className="w-full">
              <Link to={ROUTES.monthReview} search={{ month }}>
                <ListChecksIcon aria-hidden />
                Revue et clôture {ofMonth(month)}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

/** Net worth at the month end, its change and where it came from. */
function NetWorthSection({ review }: { review: MonthReviewDto }) {
  const { netWorth, flow } = review
  const { changeCents, savedCents, otherCents } = netWorth
  // The split bar only reads well when both parts add up (both positive).
  const showBar =
    changeCents !== null &&
    otherCents !== null &&
    savedCents >= 0 &&
    otherCents >= 0 &&
    changeCents > 0
  const savedShare = showBar ? savedCents / changeCents : 0

  return (
    <section aria-label="Patrimoine" className="space-y-2">
      <p className="text-muted-foreground text-sm">
        Patrimoine au {formatShortDay(netWorth.date)}
      </p>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[clamp(1.1rem,8cqi,1.6rem)] font-semibold whitespace-nowrap tabular-nums">
          {netWorth.endCents === null
            ? '—'
            : formatWholeEuros(netWorth.endCents)}
        </p>
        {changeCents !== null && (
          <p
            className={cn(
              'font-medium whitespace-nowrap tabular-nums',
              changeCents > 0 && 'text-chart-delta-good',
              changeCents < 0 && 'text-chart-delta-bad',
            )}
          >
            {formatSignedWhole(changeCents)}
          </p>
        )}
      </div>
      {showBar && (
        <div
          aria-hidden
          className="bg-muted flex h-1.5 overflow-hidden rounded-full"
        >
          <div
            className="bg-chart-delta-good h-full"
            style={{ width: `${savedShare * 100}%` }}
          />
          <div className="bg-chart-1 h-full flex-1" />
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-3 text-sm">
        <div className="min-w-0">
          <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="bg-chart-delta-good size-2 shrink-0 rounded-full"
            />
            Épargné
          </dt>
          <dd className="flex flex-wrap gap-x-1 font-medium tabular-nums">
            <span className="whitespace-nowrap">
              {formatSignedWhole(savedCents)}
            </span>
            {flow.savingsRate !== null && (
              <span className="text-muted-foreground font-normal whitespace-nowrap">
                {' '}
                · {formatPercent(flow.savingsRate)}
              </span>
            )}
          </dd>
        </div>
        {otherCents !== null && (
          <div className="min-w-0">
            <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className="bg-chart-1 size-2 shrink-0 rounded-full"
              />
              Placements et autres
            </dt>
            <dd className="font-medium whitespace-nowrap tabular-nums">
              {formatSignedWhole(otherCents)}
            </dd>
          </div>
        )}
      </dl>
    </section>
  )
}

/** Categories furthest above and below their target. */
function Drift({
  month,
  over,
  under,
}: {
  month: string
  over: ReviewCategoryDto[]
  under: ReviewCategoryDto[]
}) {
  const rows = [
    ...over.map((item) => ({ item, kind: 'over' as const })),
    ...under.map((item) => ({ item, kind: 'under' as const })),
  ]
  if (rows.length === 0) return null
  return (
    <ul className="divide-y" aria-label="Écarts au budget">
      {rows.map(({ item, kind }) => (
        <li key={item.categoryId}>
          <Link
            to={ROUTES.transactions}
            search={{ month, category: item.categoryId, kind: 'expense' }}
            className="hover:bg-muted/60 focus-visible:outline-ring -mx-2 flex min-h-11 items-center gap-2 rounded-md px-2 py-2 text-sm focus-visible:outline-2"
          >
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: item.color ?? 'var(--chart-other)' }}
            />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span
              data-slot="review-gap"
              data-tone={kind === 'over' ? 'bad' : 'good'}
              className={cn(
                'font-medium whitespace-nowrap tabular-nums',
                kind === 'over'
                  ? 'text-chart-delta-bad'
                  : 'text-chart-delta-good',
              )}
            >
              {kind === 'over'
                ? `${formatWholeEuros(item.gapCents)} de trop`
                : `${formatWholeEuros(-item.gapCents)} de marge`}
            </span>
            <ChevronRightIcon
              aria-hidden
              className="text-muted-foreground size-4 shrink-0"
            />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/**
 * What is missing before the month can be read as final: cash accounts are
 * imported, investment values valued by hand are updated in place.
 */
function MissingAccounts({
  accounts,
}: {
  accounts: ReviewMissingAccountDto[]
}) {
  const needsImport = accounts.some((account) => account.group === 'cash')
  // Rows keep one height when some carry the 44px update button.
  const withActions = accounts.some((account) => isValuedByHand(account.type))
  return (
    <section
      aria-label="Comptes à mettre à jour"
      className="bg-muted/50 space-y-2 rounded-lg p-3"
    >
      <p className="text-sm font-medium">À mettre à jour</p>
      <ul className="space-y-1 text-sm">
        {accounts.map((account) => (
          <li
            key={account.id}
            className={cn(
              'flex items-center gap-x-2',
              withActions && 'min-h-11',
            )}
          >
            <span className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-3">
              <span className="min-w-0 truncate">{account.name}</span>
              <span className="text-muted-foreground whitespace-nowrap">
                {account.lastDate === null
                  ? 'jamais'
                  : `au ${formatShortDay(account.lastDate)}`}
              </span>
            </span>
            {isValuedByHand(account.type) && (
              <UpdateValueButton account={account} />
            )}
          </li>
        ))}
      </ul>
      {needsImport && (
        <Button asChild outline variant="secondary" size="sm">
          <Link to={ROUTES.import}>
            <UploadIcon aria-hidden />
            Importer
          </Link>
        </Button>
      )}
    </section>
  )
}
