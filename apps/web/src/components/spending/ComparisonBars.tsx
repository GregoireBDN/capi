import {
  Card,
  CardContent,
  cn,
  formatWholeEuros,
  Label,
  Skeleton,
  Switch,
} from '@capi/ui'
import { Link } from '@tanstack/react-router'
import {
  ChevronRightIcon,
  MinusIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import type {
  CategorySpendingDto,
  SpendingByCategoryDto,
} from '#/api/types.gen'
import { ROUTES } from '#/lib/routes'
import { operationsSearch } from './CategoryRanking'
import { INCREASE_IS_GOOD, KIND_COLOR } from './kinds'
import { categoryLabel, monthName } from './labels'
import { SpendingCategoryIcon } from './SpendingCategoryIcon'

/** The bars of what the month is compared with. */
const COMPARED_COLOR =
  'color-mix(in oklch, var(--muted-foreground) 45%, transparent)'

/** « Novembre » (the year only when it is not the reference's). */
function monthTitle(month: string, reference: string): string {
  const name = monthName(month, reference)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** « 1er » for the first day, the number otherwise. */
const day = (value: number) => (value === 1 ? '1er' : String(value))

/**
 * What each bar is, in words (#410, the owner: « Au 1–12 oct. » was not
 * clear): « Novembre, jusqu’au 12 », « Octobre, du 1er au 12 », « Moyenne
 * des 6 mois précédents, du 1er au 12 »; whole months need no days.
 */
export function comparisonLabels(data: SpendingByCategoryDto) {
  const partial = data.period.status === 'partial'
  const through = data.period.throughDay ?? 0
  const previousDay = data.period.previousUntil
    ? Number(data.period.previousUntil.slice(8, 10))
    : through
  const months = data.averageMonths
  return {
    now: `${monthTitle(data.month, data.month)}${partial ? `, jusqu’au ${day(through)}` : ''}`,
    previous: `${monthTitle(data.previousMonth, data.month)}${partial ? `, du 1er au ${previousDay}` : ''}`,
    // Short (the owner): the first bar already says how far the month goes.
    average: months > 1 ? `Moyenne sur ${months} mois` : 'Le mois précédent',
  }
}

/** « 99 € de moins », toned by whether it is good news; « Autant » at 0. */
function Difference({
  cents,
  increaseIsGood,
  suffix,
}: {
  cents: number
  increaseIsGood: boolean
  /** Says which month differs: « en novembre ». */
  suffix?: string
}) {
  const tone =
    cents === 0 ? 'neutral' : cents > 0 === increaseIsGood ? 'good' : 'bad'
  const Icon =
    cents > 0 ? TrendingUpIcon : cents < 0 ? TrendingDownIcon : MinusIcon
  return (
    <span
      data-slot="comparison-difference"
      data-tone={tone}
      className={cn(
        // Wraps after the amount on a narrow phone; the amount never breaks.
        'inline-flex items-start gap-1 text-xs font-medium break-normal tabular-nums',
        tone === 'good' && 'text-chart-delta-good',
        tone === 'bad' && 'text-chart-delta-bad',
        tone === 'neutral' && 'text-muted-foreground',
      )}
    >
      <Icon aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>
        {cents === 0 ? (
          'Autant'
        ) : (
          <>
            <span className="whitespace-nowrap">
              {formatWholeEuros(Math.abs(cents))}
            </span>{' '}
            de {cents > 0 ? 'plus' : 'moins'}
          </>
        )}
        {suffix && ` ${suffix}`}
      </span>
    </span>
  )
}

function Bar({
  label,
  cents,
  max,
  color,
  strong = false,
  difference,
}: {
  label: string
  cents: number
  max: number
  color: string
  strong?: boolean
  /** How the month differs from this one. */
  difference?: ReactNode
}) {
  return (
    <div data-slot="comparison-bar" className="space-y-1.5">
      <div className="flex items-baseline gap-2 text-sm">
        <span
          className={cn(
            'min-w-0 flex-1 break-normal',
            strong ? 'font-medium' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            'whitespace-nowrap tabular-nums',
            strong ? 'font-semibold' : 'text-muted-foreground',
          )}
        >
          {formatWholeEuros(cents)}
        </span>
      </div>
      <div aria-hidden className="bg-muted h-2 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full"
          style={{
            width: `${(Math.max(0, cents) / max) * 100}%`,
            background: color,
          }}
        />
      </div>
      {difference && <div>{difference}</div>}
    </div>
  )
}

/** The row that grew the most (expenses) or moved the most (income, savings). */
function biggestChange(data: SpendingByCategoryDto) {
  const expense = data.kind === 'expense'
  return data.categories.reduce<CategorySpendingDto | null>((best, item) => {
    const wanted = expense ? item.deltaCents > 0 : item.deltaCents !== 0
    return wanted &&
      (!best || Math.abs(item.deltaCents) > Math.abs(best.deltaCents))
      ? item
      : best
  }, null)
}

/**
 * The category (account, in Épargne) that changed the most, with its icon,
 * what it was and what it is, opening its operations.
 */
function BiggestChange({
  data,
  accountId,
}: {
  data: SpendingByCategoryDto
  accountId: string | undefined
}) {
  const item = biggestChange(data)
  const title =
    data.kind === 'expense'
      ? 'La catégorie qui augmente le plus'
      : data.kind === 'income'
        ? 'La catégorie qui a le plus changé'
        : 'Le compte qui a le plus changé'
  // « octobre, du 1er au 12 », as the bar's label.
  const { previous } = comparisonLabels(data)
  return (
    <div data-slot="biggest-change" className="space-y-1 border-t pt-3">
      <p className="text-muted-foreground text-xs">{title}</p>
      {item ? (
        <Link
          to={ROUTES.transactions}
          search={operationsSearch(item, data.kind, data.month, accountId)}
          className="hover:bg-muted/60 -mx-2 flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1.5"
        >
          <SpendingCategoryIcon item={item} />
          <span className="min-w-0 flex-1 space-y-0.5">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="min-w-0 truncate text-sm font-medium">
                {categoryLabel(item, data.kind)}
              </span>
              <Difference
                cents={item.deltaCents}
                increaseIsGood={INCREASE_IS_GOOD[data.kind]}
              />
            </span>
            <span className="text-muted-foreground block text-xs break-normal tabular-nums">
              {formatWholeEuros(item.spentCents)} contre{' '}
              {formatWholeEuros(item.previousSpentCents)} en{' '}
              {previous.charAt(0).toLowerCase() + previous.slice(1)}
            </span>
          </span>
          <ChevronRightIcon
            aria-hidden
            className="text-muted-foreground size-4 shrink-0"
          />
        </Link>
      ) : (
        <p className="text-muted-foreground text-sm">
          {data.kind === 'expense'
            ? 'Aucune catégorie en hausse.'
            : 'Rien n’a bougé.'}
        </p>
      )}
    </div>
  )
}

export function ComparisonBarsSkeleton() {
  return (
    <Skeleton
      className="h-56 rounded-xl"
      aria-busy="true"
      aria-label="Chargement des comparaisons"
    />
  )
}

/**
 * « Compter les dépenses exceptionnelles (250 € ce mois-ci) » (#410, the
 * owner's « A. À sa place »): the switch sits under the bars it changes.
 * Only where there is something to count (or it is on); never in Épargne,
 * whose moves all count.
 */
function OneOffSwitch({
  data,
  onChange,
}: {
  data: SpendingByCategoryDto
  onChange: (on: boolean) => void
}) {
  const id = useId()
  if (data.kind === 'savings') return null
  if (data.oneOffCents === 0 && !data.includeOneOffs) return null
  const what =
    data.kind === 'expense'
      ? 'dépenses exceptionnelles'
      : 'revenus exceptionnels'
  return (
    <div
      data-slot="one-off-switch"
      className="flex min-h-11 items-center gap-3 border-t pt-3"
    >
      <Switch
        id={id}
        checked={data.includeOneOffs}
        onCheckedChange={onChange}
      />
      <Label htmlFor={id} className="text-sm font-normal break-normal">
        Compter les {what}
        {data.oneOffCents > 0 && (
          <span className="text-muted-foreground">
            {' '}
            ({formatWholeEuros(data.oneOffCents)} ce mois-ci)
          </span>
        )}
      </Label>
    </div>
  )
}

/**
 * The part's month against the month before and the average (#410, the
 * owner's « C. Barres »): one bar each, so their lengths compare at a
 * glance, the difference in words beside each, like for like while the
 * month is partial; then the row that changed the most.
 */
export function ComparisonBars({
  data,
  accountId,
  onIncludeOneOffsChange,
}: {
  data: SpendingByCategoryDto
  /** Account filter, carried over to the biggest change's operations. */
  accountId?: string
  /** Counts the one-offs, or not, in every figure of the page. */
  onIncludeOneOffsChange: (on: boolean) => void
}) {
  const labels = comparisonLabels(data)
  const good = INCREASE_IS_GOOD[data.kind]
  // « en novembre »: the month shown is the one that differs.
  const inMonth = `en ${monthName(data.month, data.month)}`
  const max = Math.max(
    1,
    data.totalCents,
    data.previousTotalCents,
    data.averageTotalCents ?? 0,
  )
  return (
    <section aria-label="Comparaisons du mois">
      <Card size="sm">
        <CardContent className="space-y-3">
          <Bar
            label={labels.now}
            cents={data.totalCents}
            max={max}
            color={KIND_COLOR[data.kind]}
            strong
          />
          <Bar
            label={labels.previous}
            cents={data.previousTotalCents}
            max={max}
            color={COMPARED_COLOR}
            difference={
              <Difference
                cents={data.totalCents - data.previousTotalCents}
                increaseIsGood={good}
                suffix={inMonth}
              />
            }
          />
          {data.averageTotalCents !== null && (
            <Bar
              label={labels.average}
              cents={data.averageTotalCents}
              max={max}
              color={COMPARED_COLOR}
              difference={
                <Difference
                  cents={data.totalCents - data.averageTotalCents}
                  increaseIsGood={good}
                  suffix={inMonth}
                />
              }
            />
          )}
          <BiggestChange data={data} accountId={accountId} />
          <OneOffSwitch data={data} onChange={onIncludeOneOffsChange} />
        </CardContent>
      </Card>
    </section>
  )
}
