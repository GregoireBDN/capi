/**
 * What the dashboard says at a glance (#405, the owner's direction « A. À
 * faire, puis un chiffre »): the things to do, in the order they matter,
 * and how the month's spending stands against an even pace. Pure functions,
 * so the rules are tested apart from the page.
 */

/**
 * Bank data older than this many days is stale: the dashboard asks for an
 * import and says how old its figures are (as the forecast does with
 * `FORECAST_STALE_AFTER_DAYS` in the API).
 */
export const STALE_AFTER_DAYS = 7

/** Whole days from `from` to `to`, two calendar dates (`YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  )
}

/** True when the bank data stops more than `STALE_AFTER_DAYS` before today. */
export function isStale(dataUntil: string | null, today: string): boolean {
  return dataUntil !== null && daysBetween(dataUntil, today) > STALE_AFTER_DAYS
}

export type Todo =
  | { kind: 'import'; dataUntil: string | null; ageDays: number | null }
  | { kind: 'close'; month: string; missing: number }
  | { kind: 'budget'; month: string }
  | { kind: 'review'; count: number }
  | {
      kind: 'repayment'
      count: number
      contactName: string
      amountCents: number
    }
  | { kind: 'renewal'; id: string; name: string; renewalDate: string }
  | { kind: 'subscriptions'; count: number }
  | { kind: 'values'; count: number }

export interface TodoInput {
  /** Today in Europe/Paris. */
  today: string
  /** The latest bank data of every account (`GET /coverage`). */
  dataUntil: string | null
  /** Whether the owner has an account fed by imports. */
  hasBankAccount: boolean
  /**
   * The month before the current one: closed or not, its accounts left to
   * update and whether the month after it (the current one) has a budget.
   */
  previous: {
    month: string
    closed: boolean
    missing: number
    nextMonthBudgeted: boolean
  } | null
  reviewCount: number
  /** Recent transfers that look like a repayment (« À revoir »). */
  repayments: Array<{ contactName: string; amountCents: number }>
  /** Prepaid plans renewing within 30 days, not decided yet. */
  renewals: Array<{ id: string; name: string; renewalDate: string }>
  /** Recurring series detected and not confirmed or dismissed yet. */
  suggestedSubscriptions: number
  /** Investment accounts whose value is older than their update rhythm. */
  staleValues: number
}

/**
 * The things to do, most pressing first: a stale import (every figure
 * below depends on it), last month to close, then the current month's
 * budget once it is, the review queue, repayments to link, prepaid renewals,
 * detected subscriptions to check and investment values to update. Empty
 * when all is done.
 */
export function buildTodos(input: TodoInput): Todo[] {
  const todos: Todo[] = []
  if (input.hasBankAccount) {
    if (input.dataUntil === null) {
      todos.push({ kind: 'import', dataUntil: null, ageDays: null })
    } else if (isStale(input.dataUntil, input.today)) {
      todos.push({
        kind: 'import',
        dataUntil: input.dataUntil,
        ageDays: daysBetween(input.dataUntil, input.today),
      })
    }
  }
  const previous = input.previous
  if (previous && !previous.closed) {
    todos.push({
      kind: 'close',
      month: previous.month,
      missing: previous.missing,
    })
  } else if (previous && !previous.nextMonthBudgeted) {
    todos.push({ kind: 'budget', month: input.today.slice(0, 7) })
  }
  if (input.reviewCount > 0) {
    todos.push({ kind: 'review', count: input.reviewCount })
  }
  if (input.repayments.length > 0) {
    const [first] = input.repayments
    todos.push({
      kind: 'repayment',
      count: input.repayments.length,
      contactName: first.contactName,
      amountCents: first.amountCents,
    })
  }
  for (const renewal of [...input.renewals].sort((a, b) =>
    a.renewalDate.localeCompare(b.renewalDate),
  )) {
    todos.push({ kind: 'renewal', ...renewal })
  }
  if (input.suggestedSubscriptions > 0) {
    todos.push({ kind: 'subscriptions', count: input.suggestedSubscriptions })
  }
  if (input.staleValues > 0) {
    todos.push({ kind: 'values', count: input.staleValues })
  }
  return todos
}

export interface PaceInput {
  targetCents: number
  /** Spent in the budgeted categories. */
  spentCents: number
  /** The day the month's data is read to (its last known day). */
  day: number
  daysInMonth: number
}

export interface Pace {
  /** Target − spent; negative when over. */
  leftCents: number
  /** What an even pace through the month would have spent by `day`. */
  paceCents: number
  /** Spent − pace: positive when ahead of the pace (spending fast). */
  aheadCents: number
  over: boolean
  /**
   * `under` (behind the pace by at least 10 €), `on` (within 10 €),
   * `ahead` (spending faster), `over` (past the target).
   */
  state: 'under' | 'on' | 'ahead' | 'over'
}

/** Within this many cents of the pace, the month is « dans le rythme ». */
const ON_PACE_CENTS = 1_000

/**
 * The month's spending against an even pace, read up to the day its data
 * goes to (like for like with a partial month: the pace of the days known,
 * not of today).
 */
export function budgetPace(input: PaceInput): Pace {
  const leftCents = input.targetCents - input.spentCents
  const day = Math.max(0, Math.min(input.day, input.daysInMonth))
  const paceCents =
    input.daysInMonth > 0
      ? Math.round((input.targetCents * day) / input.daysInMonth)
      : 0
  const aheadCents = input.spentCents - paceCents
  const over = leftCents < 0
  const state = over
    ? 'over'
    : Math.abs(aheadCents) < ON_PACE_CENTS
      ? 'on'
      : aheadCents < 0
        ? 'under'
        : 'ahead'
  return { leftCents, paceCents, aheadCents, over, state }
}

/** Number of days in `month` (`YYYY-MM`). */
export function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
}
