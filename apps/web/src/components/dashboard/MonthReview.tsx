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
import { CircleCheckIcon, ClockIcon, ListChecksIcon } from 'lucide-react'
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
        {/* The navigator fills the row up to the status (`fill`). */}
        <CardHeader className="@container flex flex-row flex-wrap items-center gap-2">
          <MonthNavigator
            month={month}
            max={latest}
            onMonthChange={onMonthChange}
            fill
            className="w-auto flex-auto"
          />
          {/* Mid-tone background, white text; an icon on a phone, its word from
              22rem of header. */}
          <Badge
            className="h-8 shrink-0 gap-1 border-transparent px-2.5 text-white"
            // A mid tone between the theme's light and dark shades of the
            // status colour, under white text.
            style={{
              backgroundColor: closed
                ? 'color-mix(in oklch, var(--success) 25%, var(--success-foreground))'
                : 'color-mix(in oklch, var(--warning) 25%, var(--warning-foreground))',
            }}
          >
            {closed ? (
              <CircleCheckIcon aria-hidden className="size-4" />
            ) : (
              <ClockIcon aria-hidden className="size-4" />
            )}
            <span className="sr-only @[22rem]:not-sr-only">
              {closed ? 'Clôturé' : 'À clôturer'}
            </span>
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

/** Hatching of the expenses in categories without a budget. */
const UNBUDGETED_FILL =
  'bg-[repeating-linear-gradient(135deg,var(--muted-foreground)_0_3px,transparent_3px_6px)] opacity-60'

/**
 * Spending against the budget as one stacked bar (owner's choice « Barre
 * empilée »): the month's expenses in the categories with a budget, then
 * those without one (hatched), the budget as a mark across the bar, a
 * legend naming each part and what's left; the categories that drifted
 * most as badges. The total of the expenses is the « Dépenses » tile.
 */
function BudgetSection({ review }: { review: MonthReviewDto }) {
  const { budget, month } = review
  if (budget.budgetCount === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Pas de budget fixé pour ce mois.
      </p>
    )
  }
  const spent = Math.max(0, budget.spentCents)
  const unbudgeted = Math.max(0, budget.unbudgetedCents)
  const scale = Math.max(spent + unbudgeted, budget.targetCents, 1)
  const share = (cents: number) => `${(cents / scale) * 100}%`
  const over = budget.remainingCents < 0
  // The two furthest above their target and the one furthest below: the
  // budget page has the rest.
  const drift = [...budget.over.slice(0, 2), ...budget.under.slice(0, 1)]
  return (
    <section aria-label="Budget" className="space-y-2 text-sm">
      <p className="font-medium">Budget</p>
      <div
        role="meter"
        aria-label="Budget"
        aria-valuemin={0}
        aria-valuemax={budget.targetCents}
        aria-valuenow={budget.spentCents}
        aria-valuetext={`${formatWholeEuros(budget.spentCents)} dépensés dans les catégories avec budget sur ${formatWholeEuros(budget.targetCents)}, plus ${formatWholeEuros(unbudgeted)} sans budget`}
        className="relative"
      >
        <div className="bg-muted flex h-3 overflow-hidden rounded-full">
          <div
            className={cn('h-full', over ? 'bg-chart-over' : 'bg-primary')}
            style={{ width: share(spent) }}
          />
          <div
            className={cn('h-full', UNBUDGETED_FILL)}
            style={{ width: share(unbudgeted) }}
          />
        </div>
        {/* The budget, as a mark across the bar. */}
        <div
          aria-hidden
          className="bg-foreground absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded"
          style={{ left: share(budget.targetCents) }}
        />
      </div>
      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs"
        aria-label="Légende"
      >
        {/* The two parts only when both exist: otherwise « Avec budget »
            would repeat « Dépenses ». */}
        {unbudgeted > 0 && (
          <>
            <LegendItem
              swatch={over ? 'bg-chart-over' : 'bg-primary'}
              label="Avec budget"
              value={formatWholeEuros(budget.spentCents)}
            />
            <LegendItem
              swatch={UNBUDGETED_FILL}
              label="Sans budget"
              value={formatWholeEuros(unbudgeted)}
            />
          </>
        )}
        <LegendItem
          swatch="bg-foreground mx-1 w-0.5"
          label="Budget"
          value={formatWholeEuros(budget.targetCents)}
        />
      </ul>
      <p className="text-xs">
        <span className={cn('font-medium', over && 'text-chart-delta-bad')}>
          {over
            ? `Dépassé de ${formatWholeEuros(-budget.remainingCents)}`
            : `Reste ${formatWholeEuros(budget.remainingCents)}`}
        </span>
        <span className="text-muted-foreground">
          {' '}
          sur les catégories avec budget
        </span>
      </p>
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

function LegendItem({
  swatch,
  label,
  value,
}: {
  swatch: string
  label: string
  value: string
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', swatch)}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium whitespace-nowrap tabular-nums">
        {value}
      </span>
    </li>
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
