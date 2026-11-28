import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  formatPercent,
  formatWholeEuros,
} from '@capi/ui'
import { CalendarXIcon, CheckIcon, TargetIcon } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type {
  MonthPeriodDto,
  SavingsMonthDto,
  SavingsOverviewDto,
} from '#/api/types.gen'
import { useRegisterPageAction } from '#/components/app-shell/page-actions'
import { NearestMonthButton } from '#/components/month/NearestMonthButton'
import { formatMonth } from '#/lib/calendar'
import { comparisonLabel, formatShortDay } from '#/lib/period'
import {
  FigureRow,
  signedWholeEuros,
  SplitBar,
  Stat,
  StatusChip,
  TONE_TEXT,
} from './figures'
import type { Tone } from './figures'
import { TargetForm } from './TargetForm'

/** Months of the dots: the last full months, reached or not. */
export const RECENT_MONTHS = 6

/** « Octobre », the month alone. */
function monthName(month: string): string {
  return formatMonth(month).replace(/\s\d{4}$/, '')
}

/**
 * Where the month stands (#407): a full month against its target, or
 * against the average without one; a month whose data stops before its end
 * gets no verdict, only the same days of the month before.
 */
export function monthStatus(
  period: Pick<MonthPeriodDto, 'status' | 'month' | 'dataUntil'>,
  netCents: number,
  target: number | null,
  currentMonth: string,
): { label: string; tone: Tone } | null {
  if (period.status === 'partial') {
    return period.month === currentMonth || period.dataUntil === null
      ? { label: 'En cours', tone: 'neutral' }
      : {
          label: `Jusqu’au ${formatShortDay(period.dataUntil)}`,
          tone: 'neutral',
        }
  }
  if (target === null) return null
  return netCents >= target
    ? { label: 'Cible atteinte', tone: 'good' }
    : { label: 'Sous la cible', tone: 'bad' }
}

/**
 * The month (#407, the owner's « A. Jauge », far less text): « Épargné »
 * and its status, the figure, a gauge with the target (else the average)
 * as a mark, then two figures: the gap and the share of the income, or,
 * while the month runs, the same days of the month before and the last
 * month. Then the last full months as dots and the average. The target is
 * edited in place, from « ⋮ » or « Fixer une cible ».
 */
export function MonthCard({
  overview,
  onMonthChange,
  wide = false,
}: {
  overview: SavingsOverviewDto
  onMonthChange: (month: string) => void
  /** A computer: the month as one row of figures (#407, « A. Rangée »). */
  wide?: boolean
}) {
  const target = overview.monthlyTargetCents
  const [editing, setEditing] = useState(false)
  // In the page's « ⋮ » inside the shell (#386).
  const inMenu = useRegisterPageAction({
    label: target === null ? 'Fixer une cible' : 'Modifier la cible',
    icon: <TargetIcon />,
    onSelect: () => setEditing(true),
  })
  const { period } = overview
  const partial = period.status === 'partial'

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <CardTitle>
          {wide
            ? partial && period.dataUntil !== null
              ? `${monthName(period.month)}, au ${formatShortDay(period.dataUntil)}`
              : monthName(period.month)
            : partial && period.month === overview.currentMonth
              ? 'Épargné à ce jour'
              : 'Épargné'}
        </CardTitle>
        {period.status !== 'empty' && <MonthStatusChip overview={overview} />}
      </CardHeader>
      <CardContent className="space-y-4">
        {editing ? (
          <TargetForm target={target} onDone={() => setEditing(false)} />
        ) : period.status === 'empty' ? (
          <EmptyState
            variant="inline"
            icon={<CalendarXIcon />}
            title={`Rien en ${monthName(period.month).toLowerCase()}`}
            description="Aucune opération ce mois-là."
            actions={
              <NearestMonthButton
                month={period.month}
                onMonthChange={onMonthChange}
                outline
                variant="secondary"
              />
            }
          />
        ) : wide ? (
          <MonthRow overview={overview} />
        ) : (
          <MonthFigures overview={overview} />
        )}
        {!editing && target === null && period.status !== 'empty' && (
          <Button outline size="sm" onClick={() => setEditing(true)}>
            <TargetIcon aria-hidden />
            Fixer une cible
          </Button>
        )}
        {!editing && target !== null && !inMenu && (
          <Button ghost size="sm" onClick={() => setEditing(true)}>
            Modifier la cible
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

function MonthStatusChip({ overview }: { overview: SavingsOverviewDto }) {
  const status = monthStatus(
    overview.period,
    overview.current.netCents,
    overview.monthlyTargetCents,
    overview.currentMonth,
  )
  if (status === null) return null
  return (
    <StatusChip
      tone={status.tone}
      icon={status.tone === 'good' ? <CheckIcon aria-hidden /> : undefined}
    >
      {status.label}
    </StatusChip>
  )
}

function MonthFigures({ overview }: { overview: SavingsOverviewDto }) {
  const { period, current, previous, months } = overview
  const target = overview.monthlyTargetCents
  const average = overview.projectionAverageCents
  const net = current.netCents
  const partial = period.status === 'partial'
  const status = monthStatus(period, net, target, overview.currentMonth)
  const oneOff = current.oneOffIncomeCents + current.oneOffExpenseCents
  const recent = months.filter((m) => m.complete).slice(-RECENT_MONTHS)
  const lastFull = partial
    ? months.find((m) => m.month === period.previousMonth && m.complete)
    : undefined

  return (
    <>
      <div className="space-y-4">
        <p
          className={cn(
            'text-[2.6rem] leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums',
            net < 0 && 'text-chart-delta-bad',
          )}
        >
          {formatWholeEuros(net)}
        </p>
        <Gauge
          net={net}
          reference={target ?? average}
          referenceLabel={target === null ? 'Moyenne' : 'Cible'}
          tone={status?.tone ?? 'neutral'}
          partial={partial}
        />
      </div>
      <div className="space-y-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {partial ? (
              <>
                <Stat
                  value={signedWholeEuros(net - previous.netCents)}
                  label={comparisonLabel(period, 'vs mois précédent')}
                  tone={net >= previous.netCents ? 'good' : 'bad'}
                />
                {lastFull && (
                  <Stat
                    value={
                      <span className="inline-flex items-center gap-1">
                        {formatWholeEuros(lastFull.netCents)}
                        {target !== null && lastFull.netCents >= target && (
                          <CheckIcon
                            aria-label="cible atteinte"
                            className="text-chart-delta-good size-[1em]"
                          />
                        )}
                      </span>
                    }
                    label={monthName(lastFull.month)}
                  />
                )}
              </>
            ) : (
              <>
                {(target ?? average) !== null && (
                  <Stat
                    value={signedWholeEuros(net - (target ?? average ?? 0))}
                    label={target === null ? 'vs moyenne' : 'vs cible'}
                    tone={
                      target === null ? 'neutral' : (status?.tone ?? 'neutral')
                    }
                  />
                )}
                <Stat
                  value={
                    current.savingsRate === null
                      ? '—'
                      : formatPercent(current.savingsRate)
                  }
                  label={
                    current.savingsRate === null
                      ? 'sans revenus'
                      : 'des revenus'
                  }
                />
              </>
            )}
          </div>
          {oneOff !== 0 && (
            <FigureRow
              label="Hors exceptionnel"
              value={formatWholeEuros(net - oneOff)}
            />
          )}
        </div>
        {(recent.length > 0 || average !== null) && (
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-3 text-xs">
            {target !== null && <ReachedDots months={recent} target={target} />}
            {average !== null && (
              <span className="ml-auto">
                Moyenne{' '}
                <span className="text-foreground font-medium tabular-nums">
                  {formatWholeEuros(average)}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/** « +254 € vs cible », the gap in its tone, under the month's figure. */
function Gap({
  cents,
  tone,
  label,
}: {
  cents: number
  tone: Tone
  label: string
}) {
  return (
    <span className="block">
      <span className={cn('font-semibold tabular-nums', TONE_TEXT[tone])}>
        {signedWholeEuros(cents)}
      </span>{' '}
      {label}
    </span>
  )
}

/** A figure under its label, at a reading size (the computer's row). */
function RowFigure({
  label,
  value,
  tone = 'neutral',
  note,
  big = false,
}: {
  label: ReactNode
  value: ReactNode
  tone?: Tone
  note?: ReactNode
  big?: boolean
}) {
  return (
    <div className="min-w-0 space-y-0.5 pr-3 [&:not(:first-child)]:pl-3">
      <p className="text-muted-foreground truncate text-xs">{label}</p>
      <p
        className={cn(
          'leading-tight font-semibold whitespace-nowrap tabular-nums',
          big ? 'text-2xl' : 'text-lg',
          TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      {note && (
        <div className="text-muted-foreground text-xs whitespace-nowrap">
          {note}
        </div>
      )}
    </div>
  )
}

/**
 * The month on a computer (#407, the owner's « A. Rangée de chiffres »):
 * five figures in one row (Épargné with its gap under it, the rate, Mis de
 * côté, what it did to the checking account, the average with the dots),
 * then a thin gauge. While the month runs: the gap is to the same days of
 * the month before, last month replaces the rate, no checking account.
 */
function MonthRow({ overview }: { overview: SavingsOverviewDto }) {
  const { period, current, previous, months, moved } = overview
  const target = overview.monthlyTargetCents
  const average = overview.projectionAverageCents
  const net = current.netCents
  const partial = period.status === 'partial'
  const status = monthStatus(period, net, target, overview.currentMonth)
  const oneOff = current.oneOffIncomeCents + current.oneOffExpenseCents
  const recent = months.filter((m) => m.complete).slice(-RECENT_MONTHS)
  const lastFull = partial
    ? months.find((m) => m.month === period.previousMonth && m.complete)
    : undefined
  const reference = target ?? average
  const checking = net - moved.totalCents
  return (
    <div className="space-y-4">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `auto repeat(${partial ? 3 : 4}, minmax(0, 1fr))`,
        }}
      >
        <RowFigure
          label={partial ? 'À ce jour' : 'Épargné'}
          value={formatWholeEuros(net)}
          tone={net < 0 ? 'bad' : 'neutral'}
          note={
            <span className="space-y-0.5">
              {partial ? (
                <Gap
                  cents={net - previous.netCents}
                  tone={net >= previous.netCents ? 'good' : 'bad'}
                  label={comparisonLabel(period, 'vs mois précédent')}
                />
              ) : (
                reference !== null && (
                  <Gap
                    cents={net - reference}
                    tone={
                      target === null ? 'neutral' : (status?.tone ?? 'neutral')
                    }
                    label={target === null ? 'vs moyenne' : 'vs cible'}
                  />
                )
              )}
              {oneOff !== 0 && (
                <span className="block">
                  Hors exceptionnel {formatWholeEuros(net - oneOff)}
                </span>
              )}
            </span>
          }
          big
        />
        {partial ? (
          <RowFigure
            label={lastFull ? monthName(lastFull.month) : 'Mois précédent'}
            value={
              lastFull ? (
                <span className="inline-flex items-center gap-1">
                  {formatWholeEuros(lastFull.netCents)}
                  {target !== null && lastFull.netCents >= target && (
                    <CheckIcon
                      aria-label="cible atteinte"
                      className="text-chart-delta-good size-[0.9em]"
                    />
                  )}
                </span>
              ) : (
                '—'
              )
            }
          />
        ) : (
          <RowFigure
            label="Taux d’épargne"
            value={
              current.savingsRate === null
                ? '—'
                : formatPercent(current.savingsRate)
            }
            note={current.savingsRate === null ? 'sans revenus' : undefined}
          />
        )}
        <RowFigure
          label="Mis de côté"
          value={formatWholeEuros(moved.totalCents)}
        />
        {!partial && (
          <RowFigure
            label="Compte courant"
            value={signedWholeEuros(checking)}
            tone={checking < 0 ? 'bad' : 'neutral'}
          />
        )}
        <RowFigure
          label="Moyenne"
          value={average === null ? '—' : formatWholeEuros(average)}
          note={
            target !== null && recent.length > 0 ? (
              <ReachedDots months={recent} target={target} />
            ) : undefined
          }
        />
      </div>
      <Gauge
        net={net}
        reference={reference}
        referenceLabel={target === null ? 'Moyenne' : 'Cible'}
        tone={status?.tone ?? 'neutral'}
        partial={partial}
        thin
      />
    </div>
  )
}

/**
 * The month against its reference: the bar up to the month's figure, the
 * reference as a mark with its name above it.
 */
function Gauge({
  net,
  reference,
  referenceLabel,
  tone,
  partial,
  thin = false,
}: {
  net: number
  reference: number | null
  referenceLabel: string
  tone: Tone
  partial: boolean
  /** A computer: a thin bar under the row of figures. */
  thin?: boolean
}) {
  if (reference === null || reference <= 0) return null
  const scale = Math.max(reference * 1.6, net * 1.1)
  const mark = (reference / scale) * 100
  return (
    <div className={thin ? 'relative pt-4' : 'relative pt-5'}>
      <SplitBar
        className={thin ? 'h-2' : 'h-3.5'}
        max={scale}
        parts={[
          {
            cents: net,
            color: partial
              ? 'bg-primary/60'
              : tone === 'good'
                ? 'bg-chart-delta-good'
                : tone === 'bad'
                  ? 'bg-chart-delta-bad'
                  : 'bg-chart-savings',
          },
        ]}
      />
      <span
        aria-hidden
        className={cn(
          'bg-foreground absolute w-0.5 rounded-full',
          thin
            ? 'bottom-[-0.25rem] h-[1.1rem]'
            : 'bottom-[-0.35rem] h-[1.5rem]',
        )}
        style={{ left: `${mark}%` }}
      />
      <span
        className="text-muted-foreground absolute top-0 -translate-x-1/2 text-[11px] whitespace-nowrap"
        style={{ left: `${mark}%` }}
      >
        {referenceLabel} {formatWholeEuros(reference)}
      </span>
    </div>
  )
}

/** The last full months as dots, reached or not, then « 5/6 ». */
function ReachedDots({
  months,
  target,
}: {
  months: SavingsMonthDto[]
  target: number
}) {
  if (months.length === 0) return null
  const reached = months.filter((m) => m.netCents >= target).length
  return (
    <span className="flex items-center gap-2">
      <ol
        aria-label="Derniers mois complets"
        className="flex items-center gap-1"
      >
        {months.map((m) => {
          const ok = m.netCents >= target
          return (
            <li
              key={m.month}
              title={`${formatMonth(m.month)} : ${ok ? 'atteinte' : 'non atteinte'}`}
              className={cn(
                'size-[10px] rounded-full',
                ok ? 'bg-chart-delta-good' : 'bg-muted-foreground/25',
              )}
            >
              <span className="sr-only">
                {`${formatMonth(m.month)} : ${ok ? 'atteinte' : 'non atteinte'}`}
              </span>
            </li>
          )
        })}
      </ol>
      <span
        className="text-foreground font-medium tabular-nums"
        aria-label={`Cible atteinte ${reached} mois sur ${months.length}`}
      >
        {reached}/{months.length}
      </span>
    </span>
  )
}
