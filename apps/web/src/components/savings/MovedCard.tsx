import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  formatWholeEuros,
} from '@capi/ui'
import type { SavingsOverviewDto } from '#/api/types.gen'
import { formatMonth } from '#/lib/calendar'
import {
  FigureRow,
  INVESTMENTS_COLOR,
  SAVINGS_COLOR,
  signedWholeEuros,
  SplitBar,
  StatusChip,
  TONE_TEXT,
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
      <CardContent className="space-y-4">
        <p className="text-2xl font-semibold tracking-tight whitespace-nowrap tabular-nums">
          {formatWholeEuros(total)}
        </p>
        {saved && (
          <div className="space-y-2">
            <FigureRow
              label="Épargné"
              value={formatWholeEuros(moved.savedCents)}
            />
            <SplitBar
              max={max}
              parts={[{ cents: moved.savedCents, color: 'bg-chart-savings' }]}
            />
          </div>
        )}
        <div className="space-y-2">
          <SplitBar
            max={max}
            parts={[
              { cents: moved.toSavingsCents, color: SAVINGS_COLOR },
              { cents: moved.toInvestmentsCents, color: INVESTMENTS_COLOR },
            ]}
          />
          <FigureRow
            label="Livrets"
            value={signedWholeEuros(moved.toSavingsCents)}
            dot={SAVINGS_COLOR}
          />
          <FigureRow
            label="Placements"
            value={signedWholeEuros(moved.toInvestmentsCents)}
            dot={INVESTMENTS_COLOR}
          />
        </div>
        {checking && (
          <div className="border-t pt-3">
            <FigureRow
              label="Compte courant"
              value={signedWholeEuros(rest)}
              tone={rest < 0 ? 'bad' : 'neutral'}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The same on a computer (#407, « A. Rangée de chiffres »): one strip, the
 * total over its split bar on the left, the three lines as figures on the
 * right.
 */
function MovedStrip({ period, moved }: { period: string; moved: Moved }) {
  const total = moved.toSavingsCents + moved.toInvestmentsCents
  const rest = moved.savedCents - total
  const figure = (label: string, cents: number, bad = false) => (
    <div className="min-w-0 space-y-0.5">
      <p className="text-muted-foreground text-xs whitespace-nowrap">{label}</p>
      <p
        className={cn(
          'text-lg font-semibold whitespace-nowrap tabular-nums',
          bad && TONE_TEXT.bad,
        )}
      >
        {signedWholeEuros(cents)}
      </p>
    </div>
  )
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <CardTitle>Mis de côté</CardTitle>
        <StatusChip tone="neutral">{period}</StatusChip>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)_repeat(3,auto)] items-end gap-x-8">
        <div className="space-y-2">
          <p className="text-xl font-semibold whitespace-nowrap tabular-nums">
            {formatWholeEuros(total)}
          </p>
          <SplitBar
            className="h-2"
            max={Math.max(total, 1)}
            parts={[
              { cents: moved.toSavingsCents, color: SAVINGS_COLOR },
              { cents: moved.toInvestmentsCents, color: INVESTMENTS_COLOR },
            ]}
          />
        </div>
        {figure('Livrets', moved.toSavingsCents)}
        {figure('Placements', moved.toInvestmentsCents)}
        {figure('Compte courant', rest, rest < 0)}
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
export function YearMovedCard({
  overview,
  wide = false,
}: {
  overview: SavingsOverviewDto
  /** A computer: one strip. */
  wide?: boolean
}) {
  const { months } = overview
  const sum = (pick: (m: (typeof months)[number]) => number) =>
    months.reduce((total, m) => total + pick(m), 0)
  const moved = {
    savedCents: sum((m) => m.netCents),
    toSavingsCents: sum((m) => m.movedToSavingsCents),
    toInvestmentsCents: sum((m) => m.movedToInvestmentsCents),
  }
  const period = `${months.length} mois`
  return wide ? (
    <MovedStrip period={period} moved={moved} />
  ) : (
    <MovedCard period={period} checking moved={moved} />
  )
}
