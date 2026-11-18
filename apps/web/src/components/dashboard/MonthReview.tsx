import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  cn,
  formatPercent,
  formatWholeEuros,
  ItemList,
  ItemListGroup,
  ItemListRow,
} from '@finances/ui'
import { Link } from '@tanstack/react-router'
import { ListChecksIcon } from 'lucide-react'
import type {
  MonthReviewDto,
  ReviewCategoryDto,
  ReviewMissingAccountDto,
} from '#/api/types.gen'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'
import { SeeLink } from './DashboardCardHeader'

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
 * Review of a past month (#262, the owner's direction « A. Tuiles »): the
 * month navigator heads the card with the month's close status, then the
 * accounts left to update, the month's income, expenses and savings as
 * three figures, the net worth at the month end (its change only when
 * investments moved it, otherwise it is what was saved), spending against
 * the budget and the one action the month's state calls for. Every amount
 * is shown once and the month is named once, by the navigator.
 */
export function MonthReview({
  review,
  latest,
  onMonthChange,
}: MonthReviewProps) {
  const { month, missing } = review
  const closed = review.closedAt !== null

  return (
    <section aria-label="Bilan du mois" className="min-w-0">
      <Card className="min-w-0">
        <CardHeader className="flex flex-row flex-wrap items-center gap-x-3 gap-y-2">
          <MonthNavigator
            month={month}
            max={latest}
            onMonthChange={onMonthChange}
          />
          <Badge variant={closed ? 'success' : 'warning'} outline>
            {closed ? 'Clôturé' : 'À clôturer'}
          </Badge>
        </CardHeader>

        {/* A wide card puts the month's figures beside its budget. */}
        <CardContent className="@container space-y-5">
          {missing.length > 0 && <MissingAccounts accounts={missing} />}
          <div className="grid gap-5 @[36rem]:grid-cols-2 @[36rem]:gap-x-10">
            <div className="min-w-0 space-y-5">
              <FlowFigures review={review} />
              <NetWorthLine review={review} />
            </div>
            <BudgetSection review={review} />
          </div>
          <ReviewAction review={review} />
        </CardContent>
      </Card>
    </section>
  )
}

/** A figure with its label right above it, sized on its tile. */
function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string | null
  tone?: 'good' | 'bad'
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          'text-[clamp(1rem,6cqi,1.3rem)] font-semibold whitespace-nowrap tabular-nums',
          tone === 'good' && 'text-chart-delta-good',
          tone === 'bad' && 'text-chart-delta-bad',
        )}
      >
        {value}
      </dd>
      {note && (
        <dd className="text-muted-foreground text-xs whitespace-nowrap">
          {note}
        </dd>
      )}
    </div>
  )
}

/** Income, expenses and what was saved of them, read together. */
function FlowFigures({ review }: { review: MonthReviewDto }) {
  const { flow } = review
  const saved = flow.netCents
  return (
    <dl
      className="@container grid grid-cols-2 gap-3 @[13rem]:grid-cols-3"
      aria-label="Flux du mois"
    >
      <Figure label="Revenus" value={formatWholeEuros(flow.incomeCents)} />
      <Figure label="Dépenses" value={formatWholeEuros(-flow.expenseCents)} />
      <Figure
        label="Épargné"
        value={formatSignedWhole(saved)}
        note={
          flow.savingsRate === null ? null : formatPercent(flow.savingsRate)
        }
        tone={saved > 0 ? 'good' : saved < 0 ? 'bad' : undefined}
      />
    </dl>
  )
}

/**
 * Net worth at the month end. Its change is shown only when investments
 * (or anything else) moved it: without them it equals « Épargné » above.
 */
function NetWorthLine({ review }: { review: MonthReviewDto }) {
  const { netWorth } = review
  const other =
    netWorth.changeCents !== null &&
    netWorth.otherCents !== null &&
    Math.round(netWorth.otherCents / 100) !== 0
      ? { change: netWorth.changeCents, other: netWorth.otherCents }
      : null
  return (
    <section aria-label="Patrimoine">
      <p className="text-muted-foreground text-xs">
        Patrimoine au {formatShortDay(netWorth.date)}
      </p>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-lg font-semibold whitespace-nowrap tabular-nums">
          {netWorth.endCents === null
            ? '—'
            : formatWholeEuros(netWorth.endCents)}
        </span>
        {other && (
          <span className="text-muted-foreground text-sm">
            <span className="whitespace-nowrap">
              {formatSignedWhole(other.change)} sur le mois
            </span>
            , dont{' '}
            <span className="whitespace-nowrap">
              {formatSignedWhole(other.other)}
            </span>{' '}
            de placements et autres
          </span>
        )}
      </p>
    </section>
  )
}

/** Spending against the budget; the categories that drifted most as chips. */
function BudgetSection({ review }: { review: MonthReviewDto }) {
  const { budget, month } = review
  if (budget.budgetCount === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Pas de budget fixé pour ce mois.
      </p>
    )
  }
  // The two furthest above their target and the one furthest below: the
  // budget page has the rest.
  const drift = [...budget.over.slice(0, 2), ...budget.under.slice(0, 1)]
  return (
    <section aria-label="Budget" className="space-y-2">
      <BudgetBar
        spentCents={budget.spentCents}
        targetCents={budget.targetCents}
      />
      <p className="text-sm">
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
          <span className="text-muted-foreground">
            {' · '}
            <span className="whitespace-nowrap">
              {formatWholeEuros(budget.unbudgetedCents)} hors budget
            </span>
          </span>
        )}
      </p>
      {drift.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Écarts au budget">
          {drift.map((item) => (
            <DriftChip key={item.categoryId} item={item} month={month} />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * The budget's target and how much of it was used, as a bar: the amount
 * spent is not printed again (it is « Dépenses » when everything spent was
 * budgeted), only read out by screen readers.
 */
function BudgetBar({
  spentCents,
  targetCents,
}: {
  spentCents: number
  targetCents: number
}) {
  const ratio = targetCents > 0 ? spentCents / targetCents : 0
  return (
    <div className="space-y-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="font-medium">Budget</span>
        <span className="text-muted-foreground whitespace-nowrap tabular-nums">
          {formatWholeEuros(targetCents)}
        </span>
      </p>
      <div
        role="meter"
        aria-label="Budget"
        aria-valuemin={0}
        aria-valuemax={targetCents}
        aria-valuenow={spentCents}
        aria-valuetext={`${formatWholeEuros(spentCents)} dépensés sur ${formatWholeEuros(targetCents)}`}
        className="bg-muted h-2 overflow-hidden rounded-full"
      >
        <div
          className={cn(
            'h-full rounded-full',
            ratio > 1
              ? 'bg-chart-over'
              : ratio >= 0.9
                ? 'bg-chart-warning'
                : 'bg-primary',
          )}
          style={{ width: `${Math.min(ratio, 1) * 100}%` }}
        />
      </div>
    </div>
  )
}

/** A category above (+) or below (−) its target; opens its transactions. */
function DriftChip({
  item,
  month,
}: {
  item: ReviewCategoryDto
  month: string
}) {
  const over = item.gapCents > 0
  return (
    <li className="max-w-full">
      <Link
        to={ROUTES.transactions}
        search={{ month, category: item.categoryId, kind: 'expense' }}
        aria-label={
          over
            ? `${item.name} : ${formatWholeEuros(item.gapCents)} de trop`
            : `${item.name} : ${formatWholeEuros(-item.gapCents)} de marge`
        }
        className="bg-muted/60 hover:bg-muted focus-visible:ring-ring inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full px-3 text-sm outline-none focus-visible:ring-2"
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: item.color ?? 'var(--chart-other)' }}
        />
        <span className="min-w-0 truncate">{item.name}</span>
        <span
          data-slot="review-gap"
          data-tone={over ? 'bad' : 'good'}
          className={cn(
            'shrink-0 font-medium whitespace-nowrap tabular-nums',
            over ? 'text-chart-delta-bad' : 'text-chart-delta-good',
          )}
        >
          {over
            ? `+${formatWholeEuros(item.gapCents)}`
            : `−${formatWholeEuros(-item.gapCents)}`}
        </span>
      </Link>
    </li>
  )
}

/**
 * The one action the month's state calls for, without naming the month
 * again: close it while it is open, then prepare the next month's budget
 * when it has none, else a quiet link back to the review.
 */
function ReviewAction({ review }: { review: MonthReviewDto }) {
  if (review.closedAt === null) {
    return (
      <Button asChild className="w-fit">
        <Link to={ROUTES.monthReview} search={{ month: review.month }}>
          <ListChecksIcon aria-hidden />
          Revue et clôture
        </Link>
      </Button>
    )
  }
  if (!review.nextMonthBudgeted) {
    return (
      <Button asChild outline variant="secondary" className="w-fit">
        <Link to={ROUTES.budget} search={{ month: review.nextMonth }}>
          Préparer le budget du mois suivant
        </Link>
      </Button>
    )
  }
  return (
    <SeeLink
      label="Revoir le mois"
      to={ROUTES.monthReview}
      search={{ month: review.month }}
    />
  )
}

/**
 * What is missing before the month can be read as final, one target per
 * account: a cash account opens the import, an investment its page, where
 * updating the value is the main action.
 */
function MissingAccounts({
  accounts,
}: {
  accounts: ReviewMissingAccountDto[]
}) {
  return (
    <section
      aria-label="Comptes à mettre à jour"
      className="bg-warning/10 rounded-lg p-2"
    >
      <p className="text-warning-foreground dark:text-warning px-2 pt-1 text-sm font-medium">
        À mettre à jour avant de clôturer
      </p>
      <ItemList>
        <ItemListGroup>
          {accounts.map((account) => {
            const cash = account.group === 'cash'
            const subtitle = `${
              account.lastDate === null
                ? 'Aucune donnée'
                : `Au ${formatShortDay(account.lastDate)}`
            } · ${cash ? 'importer' : 'mettre à jour'}`
            return (
              <ItemListRow
                key={account.id}
                asChild
                title={account.name}
                subtitle={subtitle}
              >
                {cash ? (
                  <Link to={ROUTES.import} />
                ) : (
                  <Link
                    to={ROUTES.account}
                    params={{ accountId: account.id }}
                  />
                )}
              </ItemListRow>
            )
          })}
        </ItemListGroup>
      </ItemList>
    </section>
  )
}
