/**
 * Time-scaled index axis for line and area charts.
 *
 * Calendar strings (`YYYY-MM-DD`, `YYYY-MM`) become UTC timestamps, so
 * uneven dates (e.g. investment snapshots) are spaced by the time between
 * them. Ticks fall on calendar boundaries (days, Mondays, months, quarters,
 * years) and are labelled in French, in UTC so no time zone shifts them.
 */

const DAY = 86_400_000
/** 1970-01-05, the first Monday after the epoch (epoch day 4). */
const MONDAY_OFFSET = 4

type TimeUnit = 'day' | 'month' | 'year'

type TimeInterval = { unit: TimeUnit; step: number }

/** Candidate tick intervals, finest first. */
const INTERVALS: ReadonlyArray<TimeInterval> = [
  { unit: 'day', step: 1 },
  { unit: 'day', step: 2 },
  { unit: 'day', step: 7 },
  { unit: 'day', step: 14 },
  { unit: 'month', step: 1 },
  { unit: 'month', step: 2 },
  { unit: 'month', step: 3 },
  { unit: 'month', step: 6 },
  { unit: 'year', step: 1 },
  { unit: 'year', step: 2 },
  { unit: 'year', step: 5 },
  { unit: 'year', step: 10 },
]

const dayLabel = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const monthLabel = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})
const yearLabel = new Intl.DateTimeFormat('fr-FR', {
  year: 'numeric',
  timeZone: 'UTC',
})

const LABELS: Record<TimeUnit, Intl.DateTimeFormat> = {
  day: dayLabel,
  month: monthLabel,
  year: yearLabel,
}

const mod = (value: number, step: number) => ((value % step) + step) % step

/** Tick timestamps of `interval` within `[min, max]`, ascending. */
function intervalTicks(
  min: number,
  max: number,
  { unit, step }: TimeInterval,
): number[] {
  const ticks: number[] = []
  if (unit === 'day') {
    const offset = step % 7 === 0 ? MONDAY_OFFSET : 0
    for (let day = Math.ceil(min / DAY); day * DAY <= max; day++) {
      if (mod(day - offset, step) === 0) ticks.push(day * DAY)
    }
    return ticks
  }
  const start = new Date(min)
  if (unit === 'month') {
    let month = start.getUTCFullYear() * 12 + start.getUTCMonth()
    for (; ; month++) {
      const time = Date.UTC(Math.floor(month / 12), mod(month, 12), 1)
      if (time > max) return ticks
      if (time >= min && mod(month, step) === 0) ticks.push(time)
    }
  }
  for (let year = start.getUTCFullYear(); ; year++) {
    const time = Date.UTC(year, 0, 1)
    if (time > max) return ticks
    if (time >= min && mod(year, step) === 0) ticks.push(time)
  }
}

/**
 * Ticks for a time axis covering `[min, max]` (UTC timestamps): the finest
 * calendar interval giving at most `maxCount` ticks, plus the matching
 * French label (`14 mars`, `mars 26`, `2026`). Ticks are unique and sorted.
 */
function timeTicks(
  min: number,
  max: number,
  maxCount = 5,
): { ticks: number[]; format: (time: number) => string } {
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  let chosen: { ticks: number[]; unit: TimeUnit } | undefined
  for (const interval of INTERVALS) {
    const ticks = intervalTicks(low, high, interval)
    chosen = { ticks, unit: interval.unit }
    if (ticks.length <= maxCount) break
  }
  const { ticks, unit } = chosen ?? { ticks: [], unit: 'day' }
  const label = LABELS[unit]
  return { ticks, format: (time) => label.format(time) }
}

/**
 * Domain of a time axis: the first and last dates, padded by a day on each
 * side when there is a single date so the point is not on the edge.
 */
function timeDomain(min: number, max: number): [number, number] {
  return min === max ? [min - DAY, max + DAY] : [min, max]
}

export { timeDomain, timeTicks }
