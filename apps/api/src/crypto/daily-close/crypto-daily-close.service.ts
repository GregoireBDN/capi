import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  Optional,
} from '@nestjs/common'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { DatabaseService } from '#/database/database.service'
import {
  accountsTable,
  balanceSnapshotsTable,
  cryptoHoldingsTable,
  cryptoMovementsTable,
} from '#/database/schema'
import { loadAssetMappings } from '#/imports/crypto/asset-mappings'
import type { AssetMapping } from '#/imports/crypto/crypto-import.types'
import type { HoldingMovement } from '#/imports/crypto/holdings'
import { addDays } from '#/imports/dedupe/calendar-date'
import { parisToday } from '#/investments/days'
import { formatQuantity } from '#/imports/crypto/quantity'
import { PRICE_HISTORY_MAX_DAYS } from '../coingecko.provider'
import {
  CryptoCostBasisService,
  cryptoInvestedOn,
  type LoadedCostBasis,
} from '../cost-basis.service'
import { CryptoPriceHistoryService } from './crypto-price-history.service'
import {
  type DayLine,
  dayRange,
  exchangeLinesByDay,
  msUntilNextClose,
  parisDayEnd,
  valueDay,
} from './daily-values'

const s = balanceSnapshotsTable
const h = cryptoHoldingsTable

/**
 * Days before yesterday a close still fills when they have no point: the
 * days the server was down, or left without a price (retried).
 */
export const CLOSE_CATCH_UP_DAYS = 31
/** The close runs this many minutes after midnight, Europe/Paris. */
export const CLOSE_MINUTES_AFTER_MIDNIGHT = 5
/** A close that left days without a price runs again this much later. */
export const CLOSE_RETRY_MS = 3_600_000
/** The catch-up starts this long after the server. */
const BOOT_DELAY_MS = 10_000
const CHUNK = 500

export interface CloseOptions {
  /**
   * Rebuild every open exchange's history from its movements (on boot):
   * otherwise only the exchanges whose import changed since the last close.
   */
  rebuildExchanges?: boolean
}

export interface CloseResult {
  /** Points written or replaced. */
  written: number
  /** A price request failed: the close should run again later. */
  retry: boolean
}

interface Plan {
  accountId: string
  /** Day → the lines held at its end. */
  lines: Map<string, DayLine[]>
  /** Whether the account already has a stored value (first 0 € left out). */
  valued: boolean
  /** Euros waiting on the exchange at the day's end (#373). */
  fiat: (day: string) => number
}

/**
 * The daily close of crypto accounts (#366): one `computed` value per open
 * crypto account and day, the holdings at the end of the day × that day's
 * closing price, upserted on (account, day). Page loads, « Actualiser » and
 * syncs only show today's live value; the stored history is this.
 *
 * - It runs once a day, `CLOSE_MINUTES_AFTER_MIDNIGHT` after midnight
 *   (Europe/Paris), for the days before, and once on boot to catch up the
 *   days missed (up to `CLOSE_CATCH_UP_DAYS`), with a plain timer started by
 *   `main.ts` (`start`): specs and scripts never start it. Runs are
 *   serialized in the process and idempotent (one API instance).
 * - Exchanges: their history is rebuilt from their movements (quantities
 *   day by day, as the import computes its holdings) as far back as the
 *   price history goes, on boot and after an import is committed or undone.
 * - Wallets and manual accounts: the holdings as they are (a wallet's from
 *   its first sync, a line typed by hand from the day it was added).
 * - A day without a price gets no point and is retried (an hour later when
 *   a request failed, else at the next close).
 *
 * Logs carry counts only, never quantities, prices or values.
 */
@Injectable()
export class CryptoDailyCloseService implements OnModuleDestroy {
  private readonly logger = new Logger(CryptoDailyCloseService.name)
  private timer: NodeJS.Timeout | null = null
  private started = false
  private queue: Promise<unknown> = Promise.resolve()
  /** Exchanges whose history is rebuilt at the next run. */
  private readonly pendingRebuilds = new Set<string>()

  private readonly costBasis: CryptoCostBasisService

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CryptoPriceHistoryService)
    private readonly history: CryptoPriceHistoryService,
    @Optional()
    @Inject(CryptoCostBasisService)
    costBasis?: CryptoCostBasisService,
  ) {
    this.costBasis = costBasis ?? new CryptoCostBasisService(database)
  }

  private get db() {
    return this.database.db
  }

  /** Starts the schedule: a catch-up shortly after boot, then every night. */
  start(): void {
    if (this.started) return
    this.started = true
    this.schedule(BOOT_DELAY_MS, { rebuildExchanges: true })
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.started = false
  }

  /**
   * An exchange's movements changed (an import committed or undone): its
   * history is rebuilt in the background once the schedule runs.
   */
  requestRebuild(accountId: string): void {
    this.pendingRebuilds.add(accountId)
    if (!this.started) return
    void this.run().catch((error: unknown) =>
      this.logger.warn(
        `Crypto history rebuild failed (${(error as Error).name})`,
      ),
    )
  }

  /** One close: the days up to yesterday (Europe/Paris) without a point. */
  run(
    now: Date = new Date(),
    options: CloseOptions = {},
  ): Promise<CloseResult> {
    const run = this.queue.then(() => this.close(now, options))
    this.queue = run.catch(() => undefined)
    return run
  }

  private schedule(delayMs: number, options: CloseOptions): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.tick(options), delayMs)
    // Never keeps the process alive on its own.
    this.timer.unref()
  }

  private async tick(options: CloseOptions): Promise<void> {
    let retry = false
    try {
      retry = (await this.run(new Date(), options)).retry
    } catch (error) {
      retry = true
      this.logger.warn(`Crypto daily close failed (${(error as Error).name})`)
    }
    if (!this.started) return
    const next = msUntilNextClose(new Date(), CLOSE_MINUTES_AFTER_MIDNIGHT)
    this.schedule(retry ? Math.min(CLOSE_RETRY_MS, next) : next, {})
  }

  private async close(now: Date, options: CloseOptions): Promise<CloseResult> {
    const today = parisToday(now)
    const yesterday = addDays(today, -1)
    const accounts = await this.db
      .select({
        id: accountsTable.id,
        cryptoSource: accountsTable.cryptoSource,
      })
      .from(accountsTable)
      .where(
        and(isNull(accountsTable.archivedAt), eq(accountsTable.type, 'crypto')),
      )
      .orderBy(asc(accountsTable.createdAt), asc(accountsTable.id))
    const rebuilt = new Set(
      accounts
        .filter(
          (account) =>
            account.cryptoSource === 'exchange' &&
            (options.rebuildExchanges || this.pendingRebuilds.has(account.id)),
        )
        .map((account) => account.id),
    )
    for (const id of rebuilt) this.pendingRebuilds.delete(id)

    const ids = accounts.map((account) => account.id)
    const [stored, holdings, basis] = await Promise.all([
      this.storedDays(ids),
      this.holdings(ids),
      this.costBasis.load(),
    ])

    const plans: Plan[] = []
    for (const account of accounts) {
      const days = stored.get(account.id) ?? []
      const lines = holdings.get(account.id) ?? []
      const manual = lines.filter((line) => line.origin === 'manual')
      // A line typed by hand counts from the day it was added.
      const manualOn = (day: string) =>
        manual.filter((line) => line.createdOn <= day)
      let byDay: Map<string, DayLine[]>
      if (rebuilt.has(account.id)) {
        const movements = await this.movements(account.id)
        if (movements.length === 0 && manual.length === 0) continue
        const first = [
          movements[0] && parisToday(new Date(movements[0].occurredAt)),
          ...manual.map((line) => line.createdOn),
        ]
          .filter((day): day is string => !!day)
          .sort()[0]
        const oldest = addDays(today, -(PRICE_HISTORY_MAX_DAYS - 1))
        const range = dayRange(first < oldest ? oldest : first, yesterday)
        const fromMovements = exchangeLinesByDay(
          movements,
          await this.resolver(movements),
          range,
        )
        byDay = new Map(
          range.map((day) => [
            day,
            [...(fromMovements.get(day) ?? []), ...manualOn(day)],
          ]),
        )
      } else {
        // An exchange's lines are rebuilt from its movements above.
        const observed =
          account.cryptoSource === 'exchange'
            ? null
            : observedLines(basis, account.id)
        if (lines.length === 0 && !observed) continue
        // From the first value, else from when its lines appeared (a
        // wallet's first sync), and at most `CLOSE_CATCH_UP_DAYS` back.
        const start = [
          days[0],
          observed?.first,
          ...lines.map((line) => line.createdOn),
        ]
          .filter((day): day is string => !!day)
          .sort()[0]
        const floor = addDays(yesterday, -CLOSE_CATCH_UP_DAYS)
        const known = new Set(days)
        const others = lines.filter((line) => line.origin !== 'manual')
        // A wallet's or manual account's quantities day by day are what its
        // reads (or edits) observed (#373); lines typed by hand on another
        // account count from the day they were added.
        byDay = new Map(
          dayRange(start < floor ? floor : start, yesterday)
            .filter((day) => !known.has(day))
            .map((day) => [
              day,
              observed
                ? [
                    ...observed.on(day),
                    ...(account.cryptoSource === 'manual' ? [] : manualOn(day)),
                  ]
                : [...others, ...manualOn(day)],
            ]),
        )
      }
      plans.push({
        accountId: account.id,
        lines: byDay,
        valued: days.length > 0,
        fiat: (day) =>
          account.cryptoSource === 'exchange'
            ? (cryptoInvestedOn(basis, account.id, day)?.fiatCents ?? 0)
            : 0,
      })
    }

    const needs = new Map<string, Set<string>>()
    for (const plan of plans) {
      for (const [day, lines] of plan.lines) {
        for (const line of lines) {
          const set = needs.get(line.assetId) ?? new Set<string>()
          set.add(day)
          needs.set(line.assetId, set)
        }
      }
    }
    const { prices, failed } = await this.history.dayPrices(needs, now)

    let written = 0
    for (const plan of plans) {
      const rows: (typeof s.$inferInsert)[] = []
      let valued = plan.valued
      for (const [day, lines] of [...plan.lines].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const fiat = plan.fiat(day)
        if (lines.length === 0 && fiat === 0 && !valued) continue
        const dayPrices = new Map<string, string>()
        for (const line of lines) {
          const price = prices.get(line.assetId)?.get(day)
          if (price !== undefined) dayPrices.set(line.assetId, price)
        }
        const value = valueDay(lines, dayPrices)
        if (value === null) continue
        const valueCents = value.valueCents + fiat
        // A first value of 0 € is no value (#207).
        if (valueCents === 0 && !valued) continue
        valued = true
        // The invested amount is computed on read (#370): never stored.
        rows.push({
          accountId: plan.accountId,
          date: day,
          valueCents,
          contributionsCents: null,
          source: 'computed',
        })
      }
      written += await this.upsert(rows, now)
      if (failed && rebuilt.has(plan.accountId)) {
        this.pendingRebuilds.add(plan.accountId)
      }
    }
    if (written > 0) {
      this.logger.log(
        `Crypto daily close: ${written} value(s) written for ${plans.length} account(s)`,
      )
    }
    return { written, retry: failed }
  }

  /** Computed points only: a typed value is never overwritten. */
  private async upsert(
    rows: (typeof s.$inferInsert)[],
    now: Date,
  ): Promise<number> {
    let written = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const result = await this.db
        .insert(s)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: [s.accountId, s.date],
          set: {
            valueCents: sql`excluded.value_cents`,
            contributionsCents: null,
            updatedAt: now,
          },
          setWhere: eq(s.source, 'computed'),
        })
        .returning({ id: s.id })
      written += result.length
    }
    return written
  }

  /** The days each account has a value on, oldest first. */
  private async storedDays(ids: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>()
    if (ids.length === 0) return result
    const rows = await this.db
      .select({ accountId: s.accountId, date: s.date })
      .from(s)
      .where(inArray(s.accountId, ids))
      .orderBy(asc(s.date))
    for (const row of rows) {
      const list = result.get(row.accountId) ?? []
      list.push(row.date)
      result.set(row.accountId, list)
    }
    return result
  }

  private async holdings(ids: string[]) {
    const result = new Map<
      string,
      (DayLine & { origin: string; createdOn: string })[]
    >()
    if (ids.length === 0) return result
    const rows = await this.db
      .select({
        accountId: h.accountId,
        assetId: h.assetId,
        quantity: h.quantity,
        investedCents: h.investedCents,
        origin: h.origin,
        createdAt: h.createdAt,
      })
      .from(h)
      .where(inArray(h.accountId, ids))
    for (const row of rows) {
      const list = result.get(row.accountId) ?? []
      list.push({
        assetId: row.assetId,
        quantity: row.quantity,
        investedCents: row.investedCents,
        origin: row.origin,
        createdOn: parisToday(row.createdAt),
      })
      result.set(row.accountId, list)
    }
    return result
  }

  private async movements(accountId: string): Promise<HoldingMovement[]> {
    const m = cryptoMovementsTable
    const rows = await this.db
      .select({
        id: m.id,
        occurredAt: m.occurredAt,
        kind: m.kind,
        asset: m.asset,
        quantity: m.quantity,
        eurCents: m.eurCents,
      })
      .from(m)
      .where(eq(m.accountId, accountId))
      .orderBy(asc(m.occurredAt), asc(m.createdAt), asc(m.dedupeHash))
    return rows.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString().replace('.000Z', 'Z'),
    }))
  }

  /** Built-in tickers, then the aliases saved by the imports. */
  private async resolver(
    movements: readonly HoldingMovement[],
  ): Promise<(ticker: string) => AssetMapping | null> {
    const mappings = await loadAssetMappings(
      this.db,
      movements.map((row) => row.asset),
    )
    return (ticker) => mappings.get(ticker) ?? null
  }
}

/**
 * A wallet's or manual account's quantities at the end of each day from its
 * observed movements (#373) and, on a wallet, its imported history (#426:
 * the observed ones are what it does not explain), or null when it has
 * none: the first day of its movements and the lines held at a day's end.
 */
function observedLines(
  basis: Pick<LoadedCostBasis, 'movements'>,
  accountId: string,
): { first: string; on: (day: string) => DayLine[] } | null {
  const movements = [...basis.movements.values()]
    .filter(
      (movement) =>
        movement.accountId === accountId && movement.assetId !== null,
    )
    .sort((a, b) => a.at - b.at)
  if (movements.length === 0) return null
  return {
    first: parisToday(new Date(movements[0].at)),
    on: (day) => {
      const end = parisDayEnd(day).getTime()
      const held = new Map<string, bigint>()
      for (const movement of movements) {
        if (movement.at >= end) break
        held.set(
          movement.assetId!,
          (held.get(movement.assetId!) ?? 0n) + movement.quantity,
        )
      }
      return [...held]
        .filter(([, units]) => units > 0n)
        .map(([assetId, units]) => ({
          assetId,
          quantity: formatQuantity(units),
          investedCents: null,
        }))
    },
  }
}
