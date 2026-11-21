import { valueInCents } from '#/common/decimal'
import type { SecurityPriceSource } from '#/database/schema/domain-enums'

/**
 * The valuation of an account from its position statements (ADR 0006),
 * exact: quantities and prices are decimal strings, values integer cents
 * (round half to even, `valueInCents`). Pure functions, no database.
 */

export interface StatementLine {
  securityId: string
  /** Exact decimal string. */
  quantity: string
  /** The PRU, exact decimal string; null when unknown. */
  unitCostEur: string | null
}

export interface Statement {
  asOf: string
  cashCents: number
  lines: readonly StatementLine[]
}

export interface PricePoint {
  day: string
  /** Exact decimal string. */
  priceEur: string
  source: SecurityPriceSource
}

/** Each security's prices, oldest first. */
export type PriceSeries = ReadonlyMap<string, readonly PricePoint[]>

/** Sorts statements oldest first (a copy). */
export function byDay<T extends { asOf: string }>(statements: readonly T[]) {
  return [...statements].sort((a, b) => (a.asOf < b.asOf ? -1 : 1))
}

/** The latest statement on or before `day` (statements oldest first). */
export function statementOn<T extends { asOf: string }>(
  statements: readonly T[],
  day: string,
): T | null {
  let found: T | null = null
  for (const statement of statements) {
    if (statement.asOf > day) break
    found = statement
  }
  return found
}

/** The latest price on or before `day`. */
export function priceOn(
  prices: PriceSeries,
  securityId: string,
  day: string,
): PricePoint | null {
  let found: PricePoint | null = null
  for (const point of prices.get(securityId) ?? []) {
    if (point.day > day) break
    found = point
  }
  return found
}

/** A line's cost in cents (quantity × PRU), null without a PRU. */
export function lineCostCents(line: StatementLine): number | null {
  return line.unitCostEur === null
    ? null
    : Number(valueInCents(line.quantity, line.unitCostEur))
}

export interface ValueOnDay {
  /** Null when a line has no price on or before the day. */
  valueCents: number | null
  /** The securities without a price then. */
  missing: string[]
}

/**
 * The account's value at the end of `day`: the lines of its latest
 * statement on or before it, each at its latest price on or before it, plus
 * the cash. Null before the first statement.
 */
export function valueOn(
  statements: readonly Statement[],
  prices: PriceSeries,
  day: string,
): ValueOnDay | null {
  const statement = statementOn(statements, day)
  if (!statement) return null
  let cents = BigInt(statement.cashCents)
  const missing: string[] = []
  for (const line of statement.lines) {
    const price = priceOn(prices, line.securityId, day)
    if (!price) missing.push(line.securityId)
    else cents += valueInCents(line.quantity, price.priceEur)
  }
  return {
    valueCents: missing.length > 0 ? null : Number(cents),
    missing,
  }
}

/**
 * The days a computed value is written for, from `from` to `to`: each
 * statement's day and each price day of a security held on that day. Oldest
 * first, no duplicate.
 */
export function valuationDays(
  statements: readonly Statement[],
  prices: PriceSeries,
  from: string,
  to: string,
): string[] {
  const days = new Set<string>()
  const inRange = (day: string) => day >= from && day <= to
  for (const statement of statements) {
    if (inRange(statement.asOf)) days.add(statement.asOf)
  }
  const ids = new Set(
    statements.flatMap((statement) =>
      statement.lines.map((line) => line.securityId),
    ),
  )
  for (const id of ids) {
    for (const point of prices.get(id) ?? []) {
      if (!inRange(point.day)) continue
      const held = statementOn(statements, point.day)
      if (held?.lines.some((line) => line.securityId === id)) {
        days.add(point.day)
      }
    }
  }
  return [...days].sort()
}

/**
 * What the lines cost on `day` plus the cash, when every line has a PRU
 * (ADR 0006 § 6): the invested amount of an account that has no other.
 */
export function linesInvestedOn(
  statements: readonly Statement[],
  day: string,
): { investedCents: number; since: string } | null {
  const statement = statementOn(statements, day)
  if (!statement) return null
  let cents = statement.cashCents
  for (const line of statement.lines) {
    const cost = lineCostCents(line)
    if (cost === null) return null
    cents += cost
  }
  return { investedCents: cents, since: statement.asOf }
}

/** Whether a stored price of `existing` source may be replaced by `next`. */
export function priceReplaces(
  next: SecurityPriceSource,
  existing: SecurityPriceSource,
): boolean {
  const rank: Record<SecurityPriceSource, number> = {
    manual: 0,
    statement: 1,
    provider: 2,
  }
  return rank[next] <= rank[existing]
}
