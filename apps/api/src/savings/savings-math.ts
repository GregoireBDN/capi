/**
 * Pure savings arithmetic: averages over full months and the plan /
 * projection of a goal. Amounts are integer cents, days `YYYY-MM-DD` and
 * months `YYYY-MM` strings handled without any time zone (see
 * `dashboard/calendar.ts`).
 *
 * Month counting convention: one monthly saving is counted at each **month
 * end** (the end of the current month included). A goal due on 31 December,
 * seen on 6 November, has 2 savings left (end of November, end of December);
 * one due on 15 December has 1 (end of November).
 */

import { monthEnd, shiftMonth } from '#/dashboard/calendar'

/** Income and expense totals of one calendar month. */
export interface MonthFigures {
  month: string
  incomeCents: number
  expenseCents: number
  oneOffIncomeCents: number
  oneOffExpenseCents: number
  movedToSavingsCents: number
  movedToInvestmentsCents: number
}

export interface AverageFigures {
  /** Requested window, in full months. */
  months: number
  /** Months actually averaged (the window, minus months before any data). */
  monthCount: number
  from: string | null
  to: string | null
  incomeCents: number | null
  expenseCents: number | null
  netCents: number | null
  netExcludingOneOffsCents: number | null
  movedCents: number | null
  savingsRate: number | null
}

const average = (total: number, count: number) => Math.round(total / count)

/**
 * Averages of the `window` full months before `current` (the current month
 * is never in it), skipping the months before `firstDataMonth` so a short
 * history is not diluted by empty months. Null figures when no month is
 * left. The savings rate is the window's net over its income.
 */
export function averageOver(
  figures: ReadonlyMap<string, MonthFigures>,
  current: string,
  window: number,
  firstDataMonth: string | null,
): AverageFigures {
  const months: string[] = []
  for (let i = window; i >= 1; i--) {
    const month = shiftMonth(current, -i)
    if (firstDataMonth !== null && month >= firstDataMonth) months.push(month)
  }
  const count = months.length
  if (count === 0) {
    return {
      months: window,
      monthCount: 0,
      from: null,
      to: null,
      incomeCents: null,
      expenseCents: null,
      netCents: null,
      netExcludingOneOffsCents: null,
      movedCents: null,
      savingsRate: null,
    }
  }
  let income = 0
  let expense = 0
  let oneOff = 0
  let moved = 0
  for (const month of months) {
    const row = figures.get(month)
    if (!row) continue
    income += row.incomeCents
    expense += row.expenseCents
    oneOff += row.oneOffIncomeCents + row.oneOffExpenseCents
    moved += row.movedToSavingsCents + row.movedToInvestmentsCents
  }
  const net = income + expense
  return {
    months: window,
    monthCount: count,
    from: months[0],
    to: months[count - 1],
    incomeCents: average(income, count),
    expenseCents: average(expense, count),
    netCents: average(net, count),
    netExcludingOneOffsCents: average(net - oneOff, count),
    movedCents: average(moved, count),
    savingsRate: income > 0 ? net / income : null,
  }
}

const monthIndex = (day: string) =>
  Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1

/**
 * Month ends from `today` (included) to `targetDate` (included); at least 1
 * when the target date is today or later, 0 when it has passed.
 */
export function monthsLeft(today: string, targetDate: string): number {
  if (targetDate < today) return 0
  const isMonthEnd = targetDate === monthEnd(targetDate.slice(0, 7))
  return Math.max(
    1,
    monthIndex(targetDate) - monthIndex(today) + (isMonthEnd ? 1 : 0),
  )
}
