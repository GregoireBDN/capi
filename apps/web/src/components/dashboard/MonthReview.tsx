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
import {
  CircleCheckIcon,
  ClockIcon,
  HourglassIcon,
  ListChecksIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { MonthReviewDto, ReviewMissingAccountDto } from '#/api/types.gen'
import { MonthNavigator } from '#/components/month/MonthNavigator'
import { PeriodNote } from '#/components/PeriodNote'
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
  /** Latest month that can be reviewed (the current month, #321). */
  max: string
  /**
   * Shown in place of the net worth while the current month runs: how it
   * will end (the forecast row). Today's net worth is in « Comptes ».
   */
  forecast?: ReactNode
  onMonthChange: (month: string) => void
}

/**
 * Review of a month (#262, the owner's direction « A. Tuiles »): the month
 * navigator heads the card with the month's close status, then the
 * accounts left to update, the month's income, expenses and savings as
 * three figures, the net worth at the month end (its change only when
 * investments moved it, otherwise it is what was saved), spending against
 * the budget and the one action the month's state calls for. Every amount
 * is shown once and the month is named once, by the navigator.
 *
 * The current month (#321) is read so far: « En cours », how far its data
 * goes, the forecast in place of the net worth (today's is in « Comptes »,
 * with its change since the last month end), no account to update and no
 * close until it is over.
 */
export function MonthReview({
  review,
  max,
  forecast,
  onMonthChange,
}: MonthReviewProps) {
  const { month, missing, current } = review
  const closed = review.closedAt !== null
  const status = current
    ? {
        label: 'En cours',
        icon: <HourglassIcon className="size-[22px]" />,
        // A quiet tone: nothing to do about it yet.
        color:
          'color-mix(in oklch, var(--primary) 70%, var(--muted-foreground))',
      }
    : closed
      ? {
          label: 'Clôturé',
          icon: <CircleCheckIcon className="size-[22px]" />,
          color:
            'color-mix(in oklch, var(--success) 25%, var(--success-foreground))',
        }
      : {
          label: 'À clôturer',
          icon: <ClockIcon className="size-[22px]" />,
          color:
            'color-mix(in oklch, var(--warning) 25%, var(--warning-foreground))',
        }

  return (
    <section aria-label="Bilan du mois" className="min-w-0">
      <Card className="min-w-0">
        {/* The navigator fills the row up to the status; its label grows
            between the two arrows (#264). */}
        <CardHeader className="@container flex flex-row flex-wrap items-center gap-2">
          <MonthNavigator
            month={month}
            max={max}
            onMonthChange={onMonthChange}
            className="w-auto flex-auto"
          />
          {/* As tall as the navigator, mid-tone background, white text; an
              icon on a phone, its word from
              22rem of header. */}
          <Badge
            className="h-auto shrink-0 gap-1.5 self-stretch border-transparent px-3 text-white"
            // A mid tone between the theme's light and dark shades of the
            // status colour, under white text.
            style={{ backgroundColor: status.color }}
          >
            {/* Wrapped: the badge sizes its direct svg children to 12px. */}
            <span aria-hidden className="flex">
              {status.icon}
            </span>
            <span className="sr-only @[22rem]:not-sr-only">{status.label}</span>
          </Badge>
        </CardHeader>

        {/* mb-0: the card's own padding is enough at its end. */}
        <CardContent className="@container space-y-5">
          {current && <PeriodNote period={review.period} />}
          {/* The current month's end has not come: nothing is late yet. */}
          {!current && missing.length > 0 && (
            <MissingAccounts accounts={missing} />
          )}
          {/* The net worth at the month end (how it will end, while it
              runs) on its own line, then the month's income, expenses and
              savings: one per line on a phone, the three side by side on a
              wide card. */}
          <div className="@container grid gap-2">
            {current ? forecast : <NetWorthTile review={review} />}
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
 * legend naming each part and what's left (a list on a phone). The total of the expenses is the « Dépenses » tile.
 */
function BudgetSection({ review }: { review: MonthReviewDto }) {
  const { budget } = review
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
  return (
    <section aria-label="Budget du mois" className="space-y-2 text-sm">
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
      {/* Owner's « Tableau » on a phone: one line per part, the label left,
          the amount right, what's left last under a rule. From 36rem the
          same items on one line. */}
      <ul
        className="grid gap-y-1 text-xs @[36rem]:flex @[36rem]:flex-wrap @[36rem]:gap-x-4"
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
        <li
          className={cn(
            'border-border mt-0.5 flex items-baseline justify-between gap-1.5 border-t pt-1 font-medium',
            '@[36rem]:mt-0 @[36rem]:border-0 @[36rem]:pt-0',
            over && 'text-chart-delta-bad',
          )}
        >
          <span>{over ? 'Dépassé de' : 'Reste'}</span>
          <span className="font-semibold whitespace-nowrap tabular-nums">
            {formatWholeEuros(Math.abs(budget.remainingCents))}
          </span>
        </li>
      </ul>
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
      <span className="ml-auto font-medium whitespace-nowrap tabular-nums @[36rem]:ml-0">
        {value}
      </span>
    </li>
  )
}

/**
 * The one action the month's state calls for, without naming the month
 * again: none while it runs, close it while it is open, then prepare the next month's budget
 * when it has none, else « Revoir le mois »; all at the card's full width.
 */
function ReviewAction({ review }: { review: MonthReviewDto }) {
  // Closing is for past months only.
  if (review.current) return null
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
        À mettre à jour
        <span className="hidden @[36rem]:inline"> avant de clôturer</span>
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
