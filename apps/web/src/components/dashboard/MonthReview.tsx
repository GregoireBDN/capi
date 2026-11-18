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
import { categoryIconComponent } from '#/components/categories/category-icons'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { formatShortDay } from '#/lib/period'
import { ROUTES } from '#/lib/routes'
import { FigureTile } from './FigureTile'

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

        {/* mb-0: the card's own padding is enough at its end. */}
        <CardContent className="@container mb-0 space-y-5">
          {missing.length > 0 && <MissingAccounts accounts={missing} />}
          {/* The net worth at the month end on its own line, then the
              month's income, expenses and savings: one per line on a
              phone, the three side by side on a wide card. */}
          <div className="@container grid gap-2">
            <NetWorthTile review={review} />
            <div className="grid gap-2 @[36rem]:grid-cols-3">
              <FlowFigures review={review} />
            </div>
          </div>
          <BudgetSection review={review} />
          <ReviewAction review={review} />
        </CardContent>
      </Card>
    </section>
  )
}

/** Income, expenses and what was saved of them, read together. */
function FlowFigures({ review }: { review: MonthReviewDto }) {
  const { flow } = review
  const saved = flow.netCents
  return (
    // Its tiles are cells of the figures' grid.
    <dl className="contents" aria-label="Flux du mois">
      <FigureTile
        variant="dl"
        label="Revenus"
        value={formatWholeEuros(flow.incomeCents)}
      />
      <FigureTile
        variant="dl"
        label="Dépenses"
        value={formatWholeEuros(-flow.expenseCents)}
      />
      <FigureTile
        variant="dl"
        label="Épargné"
        value={formatSignedWhole(saved)}
        notes={[
          flow.savingsRate !== null &&
            `${formatPercent(flow.savingsRate)} des revenus`,
        ]}
        tone={saved > 0 ? 'good' : saved < 0 ? 'bad' : undefined}
      />
    </dl>
  )
}

/**
 * Net worth at the month end. Its change is shown only when investments
 * (or anything else) moved it: without them it equals « Épargné ».
 */
function NetWorthTile({ review }: { review: MonthReviewDto }) {
  const { netWorth } = review
  const other =
    netWorth.changeCents !== null &&
    netWorth.otherCents !== null &&
    Math.round(netWorth.otherCents / 100) !== 0
      ? { change: netWorth.changeCents, other: netWorth.otherCents }
      : null
  return (
    <section aria-label="Patrimoine" className="grid">
      <FigureTile
        label={`Patrimoine au ${formatShortDay(netWorth.date)}`}
        value={
          netWorth.endCents === null ? '—' : formatWholeEuros(netWorth.endCents)
        }
        notes={[
          other &&
            `${formatSignedWhole(other.change)} sur le mois, dont ${formatSignedWhole(other.other)} de placements et autres`,
        ]}
      />
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
      {/* One line on a wide card: the target, a long bar, what's left. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
        <p className="flex items-baseline gap-x-2">
          <span className="font-medium">Budget</span>
          <span className="text-muted-foreground whitespace-nowrap tabular-nums">
            {formatWholeEuros(budget.targetCents)}
          </span>
        </p>
        <BudgetBar
          spentCents={budget.spentCents}
          targetCents={budget.targetCents}
        />
        <p>
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
      </div>
      {drift.length > 0 && (
        <ul
          // 14px between rows: the 44px hit areas of the 32px pills never overlap.
          className="flex flex-wrap gap-x-1.5 gap-y-[14px] pt-1"
          aria-label="Écarts au budget"
        >
          {drift.map((item) => (
            <DriftChip key={item.categoryId} item={item} month={month} />
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * How much of the budget was used, as a bar: the amount spent is not
 * printed again (it is « Dépenses » when everything spent was budgeted),
 * only read out by screen readers.
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
    <div
      role="meter"
      aria-label="Budget"
      aria-valuemin={0}
      aria-valuemax={targetCents}
      aria-valuenow={spentCents}
      aria-valuetext={`${formatWholeEuros(spentCents)} dépensés sur ${formatWholeEuros(targetCents)}`}
      // Its own line on a phone, the rest of the line on a wide card.
      className="bg-muted h-2 flex-1 basis-full overflow-hidden rounded-full @[36rem]:basis-0"
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
  )
}

/**
 * A category above (+) or below (−) its target: a badge in its colour, its
 * icon and text in white; opens its transactions.
 */
function DriftChip({
  item,
  month,
}: {
  item: ReviewCategoryDto
  month: string
}) {
  const over = item.gapCents > 0
  const Icon = categoryIconComponent(item.icon)
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
        // The category's colour, darkened a little so white text stays
        // readable on its lighter shades (yellow, orange).
        className="focus-visible:ring-ring touch-hitbox relative inline-flex h-[32px] max-w-full items-center gap-1 rounded-full px-2.5 text-xs font-medium text-white outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{
          backgroundColor: `color-mix(in srgb, ${item.color ?? 'var(--chart-other)'} 78%, black)`,
        }}
      >
        <Icon aria-hidden className="size-[15px] shrink-0" />
        <span className="min-w-0 truncate">{item.name}</span>
        <span
          data-slot="review-gap"
          data-tone={over ? 'bad' : 'good'}
          className="shrink-0 font-semibold whitespace-nowrap tabular-nums"
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
 * when it has none, else « Revoir le mois »; all at the card's full width.
 */
function ReviewAction({ review }: { review: MonthReviewDto }) {
  if (review.closedAt === null) {
    return (
      <Button asChild className="w-full">
        <Link to={ROUTES.monthReview} search={{ month: review.month }}>
          <ListChecksIcon aria-hidden />
          Revue et clôture
        </Link>
      </Button>
    )
  }
  if (!review.nextMonthBudgeted) {
    return (
      <Button asChild outline variant="secondary" className="w-full">
        <Link to={ROUTES.budget} search={{ month: review.nextMonth }}>
          Préparer le budget du mois suivant
        </Link>
      </Button>
    )
  }
  return (
    <Button asChild outline variant="secondary" className="w-full">
      <Link to={ROUTES.monthReview} search={{ month: review.month }}>
        <ListChecksIcon aria-hidden />
        Revoir le mois
      </Link>
    </Button>
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
