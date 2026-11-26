import {
  Button,
  cn,
  formatCompactEuros,
  formatEuros,
  formatMonthLong,
  formatMonthShort,
  formatWholeEuros,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@capi/ui'
import { ArrowRightIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import type {
  SpendingKind,
  SpendingTrendDto,
  SpendingTrendMonthDto,
} from '#/api/types.gen'
import { formatShortDay } from '#/lib/period'
import { FIGURE_LABEL, KIND_COLOR, KIND_LABEL, NOTHING } from './kinds'
import {
  seriesColor,
  seriesLabel,
  UNCATEGORIZED_LABEL,
  UNKNOWN_ACCOUNT_LABEL,
} from './labels'
import { SpendingCategoryIcon } from './SpendingCategoryIcon'

/** A chip of the trend: one category (account, in Épargne) shown alone. */
export interface TrendChip {
  /** `?trend=` value: the category or account id, or `none` for the bucket without. */
  value: string
  name: string
  categoryId: string | null
  accountId: string | null
  icon: string | null
  color: string | null
}

interface SpendingTrendProps {
  data: SpendingTrendDto
  /** Category shown alone (`none` = uncategorized), or the total when undefined. */
  selected: string | undefined
  onSelectedChange: (next: string | undefined) => void
  /** The main categories, offered after « Tout ». */
  chips: readonly TrendChip[]
  /** The page's month, highlighted. */
  month: string
  /** Moves the page (its month navigator) to a month. */
  onOpenMonth: (month: string) => void
}

/** Height of the bars' area: taller on a wide card, where the detail floats over it. */
const PLOT_HEIGHT = 'h-[168px] @[34rem]:h-[232px]'
/** Room above the highest bar for the highlighted month's value. */
const HEADROOM = 1.22

/** The pill look of the Opérations filter chips: 44px, sized to its content. */
const CHIP =
  'relative inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none active:translate-y-px focus-visible:ring-[3px] focus-visible:ring-ring/85 pointer-coarse:touch-hitbox'
/* In glass (#506): the glass fill off, the primary tint on, no border. */
const CHIP_OFF = 'bg-glass-fill text-foreground hover:bg-foreground/10'
const CHIP_ON = 'bg-primary/12 text-primary hover:bg-primary/15'

/** `2026-03` → `M` (axis of a narrow chart). */
function monthInitial(month: string): string {
  return formatMonthShort(month).charAt(0).toUpperCase()
}

/** `2026-11` + day 9 → "9 nov." */
function partialDay(month: string, day: number): string {
  return formatShortDay(
    `${month}-${String(day).padStart(2, '0')}`,
    month.slice(0, 4),
  )
}

/**
 * Monthly spending over the last months, to answer « est-ce que je dépense
 * plus que d'habitude ? » first (#290): one bar per month (the total, or one
 * category chosen with the chips), the page's month highlighted, a partial
 * month hatched with the day it stops at, the average as a labelled line.
 * Hovering or tapping a month tells where its money went and offers to open
 * it.
 */
export function SpendingTrend({
  data,
  selected,
  onSelectedChange,
  chips,
  month,
  onOpenMonth,
}: SpendingTrendProps) {
  const single = selected !== undefined
  const series = single ? data.series.at(0) : undefined
  // The total in its part's colour: money out, in, set aside.
  const color = (series && seriesColor(series)) ?? KIND_COLOR[data.kind]
  const name = single
    ? (chips.find((chip) => chip.value === selected)?.name ??
      (series ? seriesLabel(series, data.kind) : 'Catégorie'))
    : 'Tout'

  const values = data.totalsCents
  const average = data.averageCents
  const scale = useMemo(
    () =>
      Math.max(1, average ?? 0, ...values.map((value) => Math.max(0, value))) *
      HEADROOM,
    [values, average],
  )
  const share = (cents: number) => (Math.max(0, cents) / scale) * 100

  // The month shown in the detail: tapped (pinned) or hovered with a mouse.
  const [pinned, setPinned] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const active = pinned ?? hovered
  const wrapper = useRef<HTMLDivElement>(null)
  const hint = useId()

  const shown = data.months.join()
  useEffect(() => {
    setPinned(null)
    setHovered(null)
  }, [shown, selected])

  // A tap elsewhere closes the detail, once that tap is done: closing it
  // on pointer down would shorten the page under the finger.
  useEffect(() => {
    if (pinned === null) return
    const close = (event: Event) => {
      if (!wrapper.current?.contains(event.target as Node)) setPinned(null)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [pinned])

  const empty = values.every((value) => value === 0)
  const first = data.months[0]
  const last = data.months.at(-1)
  const label = `${KIND_LABEL[data.kind]} par mois, ${single ? name : 'total'}, de ${first ? formatMonthLong(first) : ''} à ${last ? formatMonthLong(last) : ''}`

  const monthAt = (target: EventTarget) =>
    (target as HTMLElement).closest<HTMLElement>('[data-month]')?.dataset
      .month ?? null

  const onKeyDown = (event: KeyboardEvent) => {
    const count = data.months.length
    const current = data.months.indexOf(active ?? month)
    const from = current === -1 ? count - 1 : current
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = Math.max(0, from - 1)
    else if (event.key === 'ArrowRight') next = Math.min(count - 1, from + 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = count - 1
    else if (event.key === 'Escape' && pinned !== null) {
      event.preventDefault()
      setPinned(null)
      return
    } else return
    event.preventDefault()
    setPinned(data.months[next])
  }

  const activeIndex = active === null ? -1 : data.months.indexOf(active)

  return (
    <div className="@container space-y-3">
      <TrendChips
        chips={chips}
        selected={selected}
        onSelectedChange={onSelectedChange}
      />

      {empty ? (
        <div className="text-muted-foreground flex h-[220px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm">
          {NOTHING[data.kind]} sur ces {data.months.length} mois
        </div>
      ) : (
        <div
          ref={wrapper}
          data-slot="spending-trend-chart"
          className="relative"
          onPointerLeave={() => setHovered(null)}
        >
          <div className="flex">
            <AverageGutter
              average={average}
              bottom={average === null ? 0 : share(average)}
            />
            <div className="relative min-w-0 flex-1">
              <div
                role="group"
                aria-label={label}
                aria-describedby={hint}
                tabIndex={0}
                onKeyDown={onKeyDown}
                onPointerOver={(event: PointerEvent) => {
                  if (event.pointerType === 'mouse') {
                    setHovered(monthAt(event.target))
                  }
                }}
                onClick={(event) => {
                  const target = monthAt(event.target)
                  if (target === null) return
                  setPinned((current) => (current === target ? null : target))
                }}
                className={cn(
                  'border-border focus-visible:ring-ring/50 relative flex cursor-pointer items-stretch rounded-t-sm border-b outline-none focus-visible:ring-[3px]',
                  PLOT_HEIGHT,
                )}
              >
                <span id={hint} className="sr-only">
                  Touchez un mois, ou utilisez les flèches gauche et droite,
                  pour voir où est allé son argent.
                </span>
                {average !== null && (
                  <div
                    aria-hidden
                    data-slot="trend-average-line"
                    className="border-foreground/55 pointer-events-none absolute inset-x-0 z-[1] border-t border-dashed"
                    style={{ bottom: `${share(average)}%` }}
                  />
                )}
                {data.months.map((item, index) => (
                  <MonthColumn
                    key={item}
                    month={item}
                    value={values[index]}
                    detail={data.details[index]}
                    height={share(values[index])}
                    color={color}
                    selected={item === month}
                    active={item === active}
                    edge={
                      index === 0
                        ? 'start'
                        : index === data.months.length - 1
                          ? 'end'
                          : null
                    }
                  />
                ))}
              </div>
              <MonthAxis
                months={data.months}
                details={data.details}
                selected={month}
              />
              {/* On a phone the detail sits under the chart, the width of
                  the card; wider, it floats beside the month. */}
              <div
                aria-live="polite"
                className="-ml-[2.6rem] empty:hidden @[34rem]:pointer-events-none @[34rem]:absolute @[34rem]:top-1 @[34rem]:z-10 @[34rem]:ml-0 @[34rem]:w-56 @[34rem]:px-1.5 @[34rem]:[left:var(--tip-left,auto)] @[34rem]:[right:var(--tip-right,auto)]"
                style={tooltipPosition(activeIndex, data.months.length)}
              >
                {active !== null && activeIndex !== -1 && (
                  <MonthDetail
                    month={active}
                    value={values[activeIndex]}
                    detail={data.details[activeIndex]}
                    single={single}
                    name={name}
                    average={average}
                    sameDaysAverage={data.sameDaysAverageCents}
                    kind={data.kind}
                    current={active === month}
                    onOpen={() => onOpenMonth(active)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!empty && (
        <TrendTable
          data={data}
          label={label}
          name={single ? name : FIGURE_LABEL[data.kind]}
        />
      )}
    </div>
  )
}

/**
 * Where the floating detail goes on a wide card: beside its month, on the
 * side with more room, so the bar stays in view.
 */
function tooltipPosition(index: number, count: number): CSSProperties {
  if (index === -1) return {}
  const column = 100 / count
  if (index < count / 2) {
    return { '--tip-left': `${(index + 1) * column}%` } as CSSProperties
  }
  return { '--tip-right': `${(count - index) * column}%` } as CSSProperties
}

function TrendChips({
  chips,
  selected,
  onSelectedChange,
}: {
  chips: readonly TrendChip[]
  selected: string | undefined
  onSelectedChange: (next: string | undefined) => void
}) {
  const row = useRef<HTMLDivElement>(null)
  // A chip chosen from the URL stays in view in the scrolling row, without
  // scrolling the page.
  useEffect(() => {
    const container = row.current
    const chip = container?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!container || !chip) return
    if (chip.offsetLeft + chip.offsetWidth > container.clientWidth) {
      container.scrollLeft = chip.offsetLeft - container.offsetLeft - 12
    }
  }, [])

  return (
    <div
      ref={row}
      role="group"
      aria-label="Catégorie de la tendance"
      data-slot="trend-chips"
      className="-mx-3 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] @[34rem]:mx-0 @[34rem]:flex-wrap @[34rem]:px-0"
    >
      <button
        type="button"
        aria-pressed={selected === undefined}
        onClick={() => onSelectedChange(undefined)}
        className={cn(CHIP, selected === undefined ? CHIP_ON : CHIP_OFF)}
      >
        Tout
      </button>
      {chips.map((chip) => {
        const on = chip.value === selected
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={on}
            onClick={() => onSelectedChange(on ? undefined : chip.value)}
            className={cn(CHIP, 'pl-1.5', on ? CHIP_ON : CHIP_OFF)}
          >
            <SpendingCategoryIcon item={chip} size="sm" />
            {chip.name}
          </button>
        )
      })}
    </div>
  )
}

/** « Moy. 1 234 € » at the height of the average line, left of the plot. */
function AverageGutter({
  average,
  bottom,
}: {
  average: number | null
  bottom: number
}) {
  return (
    <div
      aria-hidden
      className={cn('relative w-[2.6rem] shrink-0', PLOT_HEIGHT)}
    >
      {average !== null && (
        <p
          data-slot="trend-average-label"
          className="text-muted-foreground absolute right-1 translate-y-1/2 text-right text-[0.55rem] leading-tight tabular-nums"
          style={{ bottom: `min(${bottom}%, calc(100% - 1.4rem))` }}
        >
          Moy.
          <br />
          <span className="text-foreground font-medium whitespace-nowrap">
            {formatWholeEuros(average)}
          </span>
        </p>
      )}
    </div>
  )
}

function MonthColumn({
  month,
  value,
  detail,
  height,
  color,
  selected,
  active,
  edge,
}: {
  month: string
  value: number
  detail: SpendingTrendMonthDto | undefined
  height: number
  color: string
  selected: boolean
  active: boolean
  edge: 'start' | 'end' | null
}) {
  const partial = detail?.status === 'partial'
  const hasBar = detail?.status !== 'empty' && value > 0
  const bar: CSSProperties = partial
    ? {
        height: `${height}%`,
        backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 6px)`,
        boxShadow: `inset 0 0 0 1.5px ${color}`,
      }
    : { height: `${height}%`, backgroundColor: color }
  return (
    <div
      data-slot="trend-month"
      data-month={month}
      data-status={detail?.status}
      data-selected={selected || undefined}
      data-active={active || undefined}
      className={cn(
        'relative flex h-full min-w-0 flex-1 items-end justify-center rounded-t-md transition-colors',
        active && 'bg-muted',
      )}
    >
      {hasBar && (
        <div
          data-slot="trend-bar"
          className={cn(
            'pointer-events-none w-[70%] max-w-[1.1rem] rounded-t-[0.2rem]',
            !selected && !active && !partial && 'opacity-45 dark:opacity-65',
          )}
          style={bar}
        />
      )}
      {selected && hasBar && (
        <span
          data-slot="trend-value"
          className={cn(
            'pointer-events-none absolute text-[0.55rem] font-semibold whitespace-nowrap tabular-nums',
            edge === 'end'
              ? 'right-0'
              : edge === 'start'
                ? 'left-0'
                : 'left-1/2 -translate-x-1/2',
          )}
          style={{ bottom: `calc(${height}% + 0.1rem)` }}
        >
          {formatCompactEuros(value)}
        </span>
      )}
    </div>
  )
}

/** Month names under the bars, with the day a partial month stops at. */
function MonthAxis({
  months,
  details,
  selected,
}: {
  months: readonly string[]
  details: readonly SpendingTrendMonthDto[]
  selected: string
}) {
  return (
    <div aria-hidden className="mt-1 flex text-[0.6rem] leading-tight">
      {months.map((month, index) => {
        const detail = details[index] as SpendingTrendMonthDto | undefined
        const last = index === months.length - 1
        return (
          <div
            key={month}
            className={cn(
              'min-w-0 flex-1 text-center',
              month === selected
                ? 'text-foreground font-semibold'
                : 'text-muted-foreground',
            )}
          >
            <span className="@[22rem]:hidden">{monthInitial(month)}</span>
            <span className="hidden @[22rem]:inline">
              {formatMonthShort(month)}
            </span>
            {detail?.status === 'partial' && detail.throughDay !== null && (
              <span
                data-slot="trend-partial-label"
                className={cn(
                  'text-muted-foreground block font-normal whitespace-nowrap',
                  last && 'text-right',
                )}
              >
                au {detail.throughDay}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** The hovered or tapped month: its total, where it went, « Voir ce mois ». */
function MonthDetail({
  month,
  value,
  detail,
  single,
  name,
  average,
  sameDaysAverage,
  kind,
  current,
  onOpen,
}: {
  month: string
  value: number
  detail: SpendingTrendMonthDto | undefined
  single: boolean
  name: string
  average: number | null
  sameDaysAverage: number | null
  kind: SpendingKind
  current: boolean
  onOpen: () => void
}) {
  const status = detail?.status ?? 'complete'
  const throughDay = detail?.throughDay ?? null
  const partial = status === 'partial' && throughDay !== null
  const reference = partial ? sameDaysAverage : average
  return (
    <div
      data-slot="trend-detail"
      className="bg-popover text-popover-foreground mt-3 space-y-2 rounded-lg border p-3 text-sm shadow-md @[34rem]:pointer-events-auto @[34rem]:mt-0"
    >
      <p className="font-medium">
        {formatMonthLong(month)}
        {partial && (
          <span className="text-muted-foreground font-normal">
            {' '}
            · au {partialDay(month, throughDay)}
          </span>
        )}
      </p>
      {status === 'empty' ? (
        <p className="text-muted-foreground text-xs">
          Pas encore de données pour ce mois.
        </p>
      ) : (
        <>
          <div className="space-y-0.5">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">
                {single ? name : FIGURE_LABEL[kind]}
              </span>
              <span className="font-semibold whitespace-nowrap tabular-nums">
                {formatEuros(value)}
              </span>
            </p>
            {reference !== null && (
              <p className="text-muted-foreground flex items-baseline justify-between gap-3 text-xs">
                <span>{partial ? `Moyenne au ${throughDay}` : 'Moyenne'}</span>
                <span className="whitespace-nowrap tabular-nums">
                  {formatEuros(reference)}
                </span>
              </p>
            )}
          </div>
          {!single && detail && detail.topCategories.length > 0 && (
            <ul
              aria-label="Principales catégories"
              className="space-y-1 border-t pt-2 text-xs"
            >
              {detail.topCategories.map((top) => (
                <li
                  key={top.categoryId ?? 'none'}
                  className="flex items-center gap-1.5"
                >
                  <SpendingCategoryIcon item={top} size="sm" />
                  <span className="min-w-0 flex-1 truncate">
                    {top.name ??
                      (kind === 'savings'
                        ? UNKNOWN_ACCOUNT_LABEL
                        : UNCATEGORIZED_LABEL)}
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    {formatWholeEuros(top.spentCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {!current && (
        <Button
          size="sm"
          outline
          variant="secondary"
          className="w-full"
          onClick={onOpen}
        >
          Voir ce mois
          <ArrowRightIcon aria-hidden />
        </Button>
      )}
    </div>
  )
}

/** The figures as a table, folded under « Voir le tableau ». */
function TrendTable({
  data,
  label,
  name,
}: {
  data: SpendingTrendDto
  label: string
  name: string
}) {
  return (
    <details data-slot="trend-table" className="group text-sm">
      <summary className="text-muted-foreground hover:text-foreground focus-visible:outline-ring relative w-fit cursor-pointer list-none rounded-sm underline-offset-4 select-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 pointer-coarse:touch-hitbox [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Voir le tableau</span>
        <span className="hidden group-open:inline">Masquer le tableau</span>
      </summary>
      <div className="mt-2">
        <Table>
          <TableCaption className="sr-only">{label}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Mois</TableHead>
              <TableHead scope="col" className="text-right">
                {name}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.months.map((month, index) => {
              const detail = data.details[index] as
                | SpendingTrendMonthDto
                | undefined
              return (
                <TableRow key={month}>
                  <TableHead scope="row" className="font-normal">
                    {formatMonthLong(month)}
                    {detail?.status === 'partial' &&
                      detail.throughDay !== null &&
                      ` (au ${partialDay(month, detail.throughDay)})`}
                  </TableHead>
                  <TableCell className="text-right tabular-nums">
                    {detail?.status === 'empty'
                      ? '—'
                      : formatEuros(data.totalsCents[index])}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          {data.averageCents !== null && (
            <TableFooter>
              <TableRow>
                <TableHead scope="row">
                  Moyenne ({data.averageMonths} mois complets)
                </TableHead>
                <TableCell className="text-right tabular-nums">
                  {formatEuros(data.averageCents)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </details>
  )
}
