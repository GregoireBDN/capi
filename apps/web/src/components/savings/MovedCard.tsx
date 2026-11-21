import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  formatWholeEuros,
} from '@finances/ui'
import type { SavingsOverviewDto } from '#/api/types.gen'
import { formatMonth } from '#/lib/calendar'
import {
  FigureRow,
  INVESTMENTS_COLOR,
  SAVINGS_COLOR,
  signedWholeEuros,
  SplitBar,
  StatusChip,
  STRIP,
} from './figures'

interface Moved {
  savedCents: number
  toSavingsCents: number
  toInvestmentsCents: number
}

/**
 * « Mis de côté » (#407): what left the checking accounts for the savings
 * accounts and investments, as one figure, split between them, and what it
 * did to the checking account (saved − put aside: kept there, or taken
 * from it). Transfers between the owner's own accounts never count as
 * saved; they are what this card is about.
 */
function MovedCard({
  period,
  moved,
  saved,
  checking,
}: {
  /** « Octobre », « 12 mois ». */
  period: string
  moved: Moved
  /** Shows what was saved beside it (the month's card). */
  saved?: boolean
  /** Shows the checking account's line. */
  checking: boolean
}) {
  const total = moved.toSavingsCents + moved.toInvestmentsCents
  const max = Math.max(saved ? moved.savedCents : 0, total, 1)
  const rest = moved.savedCents - total
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <CardTitle>Mis de côté</CardTitle>
        <StatusChip tone="neutral">{period}</StatusChip>
      </CardHeader>
      <CardContent className="@container space-y-4">
        {/* A computer: the figure beside its bars, then the lines abreast. */}
        <div className={STRIP}>
          <p className="text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums">
            {formatWholeEuros(total)}
          </p>
          <div className="space-y-2">
            {saved && (
              <>
                <FigureRow
                  label="Épargné"
                  value={formatWholeEuros(moved.savedCents)}
                />
                <SplitBar
                  max={max}
                  parts={[
                    { cents: moved.savedCents, color: 'bg-chart-savings' },
                  ]}
                />
              </>
            )}
            <SplitBar
              max={max}
              className={saved ? 'mt-4' : undefined}
              parts={[
                { cents: moved.toSavingsCents, color: SAVINGS_COLOR },
                { cents: moved.toInvestmentsCents, color: INVESTMENTS_COLOR },
              ]}
            />
          </div>
        </div>
        <div className="space-y-2 @[32rem]:ml-[15rem] @[32rem]:flex @[32rem]:flex-wrap @[32rem]:gap-x-10 @[32rem]:gap-y-2 @[32rem]:space-y-0">
          <FigureRow
            label="Livrets"
            value={signedWholeEuros(moved.toSavingsCents)}
            dot={SAVINGS_COLOR}
            stackWhenWide
          />
          <FigureRow
            label="Placements"
            value={signedWholeEuros(moved.toInvestmentsCents)}
            dot={INVESTMENTS_COLOR}
            stackWhenWide
          />
          {checking && (
            <div className="mt-3 border-t pt-3 @[32rem]:mt-0 @[32rem]:border-t-0 @[32rem]:pt-0">
              <FigureRow
                label="Compte courant"
                value={signedWholeEuros(rest)}
                tone={rest < 0 ? 'bad' : 'neutral'}
                stackWhenWide
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** The page month: saved, put aside, and the checking account once it ends. */
export function MonthMovedCard({ overview }: { overview: SavingsOverviewDto }) {
  const { period, current, moved } = overview
  return (
    <MovedCard
      period={formatMonth(period.month).replace(/\s\d{4}$/, '')}
      saved
      checking={period.status === 'complete'}
      moved={{
        savedCents: current.netCents,
        toSavingsCents: moved.toSavingsCents,
        toInvestmentsCents: moved.toInvestmentsCents,
      }}
    />
  )
}

/** The last 12 months (the current one so far), summed. */
export function YearMovedCard({ overview }: { overview: SavingsOverviewDto }) {
  const { months } = overview
  const sum = (pick: (m: (typeof months)[number]) => number) =>
    months.reduce((total, m) => total + pick(m), 0)
  return (
    <MovedCard
      period={`${months.length} mois`}
      checking
      moved={{
        savedCents: sum((m) => m.netCents),
        toSavingsCents: sum((m) => m.movedToSavingsCents),
        toInvestmentsCents: sum((m) => m.movedToInvestmentsCents),
      }}
    />
  )
}
