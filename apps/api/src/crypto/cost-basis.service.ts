import { Inject, Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { DatabaseService } from '#/database/database.service'
import type * as schema from '#/database/schema'
import {
  accountsTable,
  cryptoMovementsTable,
  cryptoTransferLinksTable,
} from '#/database/schema'
import { loadAssetMappings } from '#/imports/crypto/asset-mappings'
import { FIAT_TICKERS } from '#/imports/crypto/assets'
import { parisDayEnd } from './daily-close/daily-values'
import {
  type CostAccount,
  type CostAccountSource,
  type CostBasis,
  type CostLink,
  type CostMovement,
  type InvestedStep,
  replayCosts,
  stepBefore,
  toUnits,
} from './cost-basis'
import { formatQuantity } from '#/imports/crypto/quantity'
import { type MatchCandidate, matchTransfers } from './transfer-matching'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type Executor = Db | Tx

const m = cryptoMovementsTable
const l = cryptoTransferLinksTable

/** A crypto account as the replay and its readers need it. */
export interface CostBasisAccount extends CostAccount {
  name: string
  archived: boolean
}

/** A movement with what the pages show of it. */
export interface LoadedMovement extends CostMovement {
  /** The movement is an exchange line whose ticker has no price id. */
  unmapped: boolean
}

/** The replay of every crypto account, with what it was computed from. */
export interface LoadedCostBasis extends CostBasis {
  accounts: Map<string, CostBasisAccount>
  movements: Map<string, LoadedMovement>
  links: CostLink[]
}

/** What a read of a wallet (or the lines of a manual account) holds now. */
export interface ObservedPosition {
  assetId: string
  symbol: string
  /** Exact decimal string, ≥ 0. */
  quantity: string
}

/**
 * What a wallet held of each asset at each of its reads (#426): the sum of
 * its observed and imported movements up to each read, taken before its
 * imported movements change, so its observed movements can be rewritten
 * around the new ones (`reconcileObserved`).
 */
export interface ReadPositions {
  /** The reads (epoch ms), oldest first. */
  times: number[]
  /** Per price id, the quantity held at each read (units of 10^-18). */
  positions: Map<string, bigint[]>
  symbols: Map<string, string>
}

interface ImportedQuantity {
  at: number
  assetId: string
  symbol: string
  units: bigint
}

/**
 * The cost that follows the coins (#373), read from the database: loads
 * every crypto account's movements and transfer links and replays them
 * (`replayCosts`), records what a wallet's reads (or a manual account's
 * edits) found risen or fallen, and links the two sides of the transfers
 * between the owner's accounts. Never logs quantities, values or
 * addresses: counts only.
 */
@Injectable()
export class CryptoCostBasisService {
  private readonly logger = new Logger(CryptoCostBasisService.name)

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  /** Replays every crypto account (archived ones too: coins went there). */
  async load(executor: Executor = this.db): Promise<LoadedCostBasis> {
    const accountRows = await executor
      .select({
        id: accountsTable.id,
        name: accountsTable.name,
        source: accountsTable.cryptoSource,
        observedAt: accountsTable.cryptoObservedAt,
        archivedAt: accountsTable.archivedAt,
      })
      .from(accountsTable)
      .where(eq(accountsTable.type, 'crypto'))
    const accounts = new Map<string, CostBasisAccount>(
      accountRows.map((row) => [
        row.id,
        {
          id: row.id,
          name: row.name,
          source: (row.source ?? 'manual') as CostAccountSource,
          observedAt: row.observedAt?.getTime() ?? null,
          archived: row.archivedAt !== null,
        },
      ]),
    )
    const rows =
      accounts.size === 0
        ? []
        : await executor
            .select({
              id: m.id,
              accountId: m.accountId,
              occurredAt: m.occurredAt,
              kind: m.kind,
              asset: m.asset,
              assetId: m.assetId,
              quantity: m.quantity,
              eurCents: m.eurCents,
              observedSince: m.observedSince,
              counterpartAccountId: m.counterpartAccountId,
              resolution: m.resolution,
              costCents: m.costCents,
            })
            .from(m)
            .where(inArray(m.accountId, [...accounts.keys()]))
    const mappings = await loadAssetMappings(
      executor,
      rows.filter((row) => row.assetId === null).map((row) => row.asset),
    )
    const movements = new Map<string, LoadedMovement>()
    for (const row of rows) {
      const assetId = row.assetId ?? mappings.get(row.asset)?.assetId ?? null
      movements.set(row.id, {
        id: row.id,
        accountId: row.accountId,
        at: row.occurredAt.getTime(),
        kind: row.kind,
        asset: row.asset,
        assetId,
        quantity: toUnits(row.quantity),
        eurCents: row.eurCents,
        observedSince: row.observedSince?.getTime() ?? null,
        counterpartAccountId: row.counterpartAccountId,
        resolution: row.resolution,
        costCents: row.costCents,
        unmapped: assetId === null && !FIAT_TICKERS.has(row.asset),
      })
    }
    const links = (
      await executor
        .select({ outId: l.outMovementId, inId: l.inMovementId })
        .from(l)
    ).filter((link) => movements.has(link.outId) && movements.has(link.inId))
    const basis = replayCosts(
      [...accounts.values()],
      [...movements.values()],
      links,
    )
    return { ...basis, accounts, movements, links }
  }

  /**
   * Records what a complete read of a wallet (or an edit of a manual
   * account's lines) found: one observed movement per asset whose quantity
   * rose or fell since the last one, dated now, after the account's last
   * read (none on its first: the opening position). Nothing when nothing
   * changed. `answers`: the cost the owner typed with the lines, for an
   * arrival of that asset. Returns how many it wrote.
   */
  async observe(
    executor: Executor,
    accountId: string,
    positions: readonly ObservedPosition[],
    now: Date,
    operation: 'wallet_sync' | 'manual_edit',
    answers: ReadonlyMap<string, number> = new Map(),
  ): Promise<number> {
    const [account] = await executor
      .select({ observedAt: accountsTable.cryptoObservedAt })
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId))
      .for('update')
    if (!account) return 0
    const held = await executor
      .select({
        assetId: m.assetId,
        symbol: sql<string>`min(${m.asset})`,
        quantity: sql<string>`sum(${m.quantity})::text`,
      })
      .from(m)
      .where(
        and(
          eq(m.accountId, accountId),
          inArray(m.kind, ['observed_in', 'observed_out']),
        ),
      )
      .groupBy(m.assetId)
    const before = new Map(
      held.map((row) => [
        row.assetId!,
        { symbol: row.symbol, units: toUnits(row.quantity) },
      ]),
    )
    // Operations imported from the wallet's own history (#426) are already
    // counted: a read records only what neither explains.
    for (const row of await this.importedQuantities(executor, accountId)) {
      const known = before.get(row.assetId)
      before.set(row.assetId, {
        symbol: known?.symbol ?? row.symbol,
        units: (known?.units ?? 0n) + row.units,
      })
    }
    const after = new Map<string, { symbol: string; units: bigint }>()
    for (const position of positions) {
      const known = after.get(position.assetId)
      after.set(position.assetId, {
        symbol: known?.symbol ?? position.symbol,
        units: (known?.units ?? 0n) + toUnits(position.quantity),
      })
    }
    const since = account.observedAt
    const rows: (typeof m.$inferInsert)[] = []
    for (const assetId of new Set([...before.keys(), ...after.keys()])) {
      const was = before.get(assetId)?.units ?? 0n
      const next = after.get(assetId)?.units ?? 0n
      const delta = next - was
      if (delta === 0n) continue
      const symbol = (after.get(assetId) ?? before.get(assetId))!.symbol
      const cost = delta > 0n ? answers.get(assetId) : undefined
      rows.push({
        accountId,
        occurredAt: now,
        observedSince: since,
        operation: since === null ? 'opening' : operation,
        kind: delta > 0n ? 'observed_in' : 'observed_out',
        asset: symbol.slice(0, 20),
        assetId,
        quantity: formatQuantity(delta),
        resolution: cost === undefined ? null : 'bought',
        costCents: cost ?? null,
        dedupeHash: `observed:${randomUUID()}`,
      })
    }
    if (rows.length > 0) await executor.insert(m).values(rows)
    await executor
      .update(accountsTable)
      .set({ cryptoObservedAt: now, updatedAt: now })
      .where(eq(accountsTable.id, accountId))
    if (rows.length > 0) {
      this.logger.log(`Crypto movements observed: ${rows.length}`)
    }
    return rows.length
  }

  /**
   * The account's imported movements (a Ledger Live history, #426) with a
   * price id, as signed quantities; unmapped tickers and fiat are left out.
   */
  private async importedQuantities(
    executor: Executor,
    accountId: string,
  ): Promise<ImportedQuantity[]> {
    const rows = await executor
      .select({
        occurredAt: m.occurredAt,
        asset: m.asset,
        quantity: m.quantity,
      })
      .from(m)
      .where(and(eq(m.accountId, accountId), isNotNull(m.importId)))
    const mappings = await loadAssetMappings(
      executor,
      rows.map((row) => row.asset),
    )
    const quantities: ImportedQuantity[] = []
    for (const row of rows) {
      const mapping = mappings.get(row.asset)
      if (!mapping) continue
      quantities.push({
        at: row.occurredAt.getTime(),
        assetId: mapping.assetId,
        symbol: mapping.symbol,
        units: toUnits(row.quantity),
      })
    }
    return quantities
  }

  /**
   * What the account held at each of its reads (#426), from its observed
   * and imported movements; null when it was never read. Taken before its
   * imported movements change (an import committed or undone).
   */
  async readPositions(
    executor: Executor,
    accountId: string,
  ): Promise<ReadPositions | null> {
    const [account] = await executor
      .select({ observedAt: accountsTable.cryptoObservedAt })
      .from(accountsTable)
      .where(eq(accountsTable.id, accountId))
      .for('update')
    const observed = await this.observedRows(executor, accountId)
    const times = [
      ...new Set([
        ...observed.map((row) => row.occurredAt.getTime()),
        ...(account?.observedAt ? [account.observedAt.getTime()] : []),
      ]),
    ].sort((a, b) => a - b)
    if (times.length === 0) return null
    const imported = await this.importedQuantities(executor, accountId)
    const symbols = new Map<string, string>()
    const flows: { at: number; assetId: string; units: bigint }[] = []
    for (const row of observed) {
      symbols.set(row.assetId!, row.asset)
      flows.push({
        at: row.occurredAt.getTime(),
        assetId: row.assetId!,
        units: toUnits(row.quantity),
      })
    }
    for (const row of imported) {
      if (!symbols.has(row.assetId)) symbols.set(row.assetId, row.symbol)
      flows.push(row)
    }
    const positions = new Map<string, bigint[]>()
    for (const assetId of symbols.keys()) {
      positions.set(
        assetId,
        cumulativeAt(
          times,
          flows.filter((flow) => flow.assetId === assetId),
        ),
      )
    }
    return { times, positions, symbols }
  }

  /**
   * Rewrites a wallet's observed movements once its imported movements
   * changed (#426), so that at each read its observed and imported
   * movements still add up to what the read found: what an imported
   * operation explains is no longer observed, so nothing counts twice; what
   * it does not stays observed. An observed movement whose quantity must
   * change is replaced (its answer and link with it: the imported
   * operation now carries them); one that stays the same is kept as it is.
   * Returns how many observed movements it removed and wrote.
   */
  async reconcileObserved(
    executor: Executor,
    accountId: string,
    before: ReadPositions,
    now: Date,
  ): Promise<{ removed: number; written: number }> {
    const imported = await this.importedQuantities(executor, accountId)
    const observed = await this.observedRows(executor, accountId)
    const { times } = before
    const symbols = new Map(before.symbols)
    for (const row of imported) {
      if (!symbols.has(row.assetId)) symbols.set(row.assetId, row.symbol)
    }
    // The previous read of each read: an existing movement's own, else the
    // read before it in the list.
    const sinceOf = new Map<number, Date | null>()
    for (const row of observed) {
      sinceOf.set(row.occurredAt.getTime(), row.observedSince)
    }
    const removed: string[] = []
    const rows: (typeof m.$inferInsert)[] = []
    for (const [assetId, symbol] of symbols) {
      const held = before.positions.get(assetId) ?? times.map(() => 0n)
      const explained = cumulativeAt(
        times,
        imported.filter((row) => row.assetId === assetId),
      )
      let previous = 0n
      times.forEach((time, i) => {
        const residue = held[i] - explained[i]
        const delta = residue - previous
        previous = residue
        const existing = observed.filter(
          (row) => row.assetId === assetId && row.occurredAt.getTime() === time,
        )
        const current = existing.reduce(
          (sum, row) => sum + toUnits(row.quantity),
          0n,
        )
        if (current === delta) return
        removed.push(...existing.map((row) => row.id))
        if (delta === 0n) return
        // The earliest read still known opens the account (the reads whose
        // movements an import replaced are forgotten).
        const since =
          i === 0
            ? null
            : sinceOf.has(time)
              ? sinceOf.get(time)!
              : new Date(times[i - 1])
        rows.push({
          accountId,
          occurredAt: new Date(time),
          observedSince: since,
          operation: since === null ? 'opening' : 'wallet_sync',
          kind: delta > 0n ? 'observed_in' : 'observed_out',
          asset: symbol.slice(0, 20),
          assetId,
          quantity: formatQuantity(delta),
          dedupeHash: `observed:${randomUUID()}`,
          updatedAt: now,
        })
      })
    }
    for (let i = 0; i < removed.length; i += 500) {
      await executor.delete(m).where(inArray(m.id, removed.slice(i, i + 500)))
    }
    if (rows.length > 0) await executor.insert(m).values(rows)
    if (removed.length > 0 || rows.length > 0) {
      this.logger.log(
        `Observed crypto movements reconciled: ${removed.length} removed, ${rows.length} written`,
      )
    }
    return { removed: removed.length, written: rows.length }
  }

  private observedRows(executor: Executor, accountId: string) {
    return executor
      .select({
        id: m.id,
        occurredAt: m.occurredAt,
        observedSince: m.observedSince,
        asset: m.asset,
        assetId: m.assetId,
        quantity: m.quantity,
      })
      .from(m)
      .where(
        and(
          eq(m.accountId, accountId),
          inArray(m.kind, ['observed_in', 'observed_out']),
        ),
      )
  }

  /**
   * Links the departures and arrivals that match one way only
   * (`matchTransfers`: by transaction hash first, #426) among those not
   * linked, answered nor unlinked by hand, and names each side's account on
   * the other. Run after each wallet
   * read and each exchange import commit. Returns how many it linked.
   */
  async match(executor: Executor = this.db): Promise<number> {
    const linked = or(
      sql`exists (select 1 from ${l} where ${l.outMovementId} = ${m.id})`,
      sql`exists (select 1 from ${l} where ${l.inMovementId} = ${m.id})`,
    )!
    const rows = await executor
      .select({
        id: m.id,
        accountId: m.accountId,
        kind: m.kind,
        asset: m.asset,
        assetId: m.assetId,
        quantity: m.quantity,
        occurredAt: m.occurredAt,
        observedSince: m.observedSince,
        counterpartAccountId: m.counterpartAccountId,
        txHashDigest: m.txHashDigest,
      })
      .from(m)
      .where(
        and(
          inArray(m.kind, [
            'withdrawal',
            'deposit',
            'observed_in',
            'observed_out',
          ]),
          isNull(m.resolution),
          eq(m.autoMatch, true),
          sql`not (${linked})`,
        ),
      )
    const mappings = await loadAssetMappings(
      executor,
      rows.filter((row) => row.assetId === null).map((row) => row.asset),
    )
    const candidates: MatchCandidate[] = []
    for (const row of rows) {
      if (FIAT_TICKERS.has(row.asset)) continue
      if (row.kind === 'observed_in' && row.observedSince === null) continue
      const assetId = row.assetId ?? mappings.get(row.asset)?.assetId
      if (!assetId) continue
      const units = toUnits(row.quantity)
      candidates.push({
        id: row.id,
        accountId: row.accountId,
        kind: row.kind,
        assetId,
        quantity: units < 0n ? -units : units,
        at: row.occurredAt.getTime(),
        observedSince: row.observedSince?.getTime() ?? null,
        counterpartAccountId: row.counterpartAccountId,
        txHashDigest: row.txHashDigest,
      })
    }
    const pairs = matchTransfers(candidates)
    if (pairs.length === 0) return 0
    const byId = new Map(candidates.map((c) => [c.id, c]))
    for (const pair of pairs) {
      await this.writeLink(executor, pair.outId, pair.inId, 'auto', byId)
    }
    this.logger.log(`Crypto transfers linked: ${pairs.length}`)
    return pairs.length
  }

  /** Writes one link and names each side's account on the other. */
  async writeLink(
    executor: Executor,
    outId: string,
    inId: string,
    matched: 'auto' | 'manual',
    known?: ReadonlyMap<string, { accountId: string }>,
  ): Promise<void> {
    let accounts = known
    if (!accounts?.has(outId) || !accounts.has(inId)) {
      const rows = await executor
        .select({ id: m.id, accountId: m.accountId })
        .from(m)
        .where(inArray(m.id, [outId, inId]))
      accounts = new Map(rows.map((row) => [row.id, row]))
    }
    const out = accounts.get(outId)!
    const arrival = accounts.get(inId)!
    await executor
      .insert(l)
      .values({ outMovementId: outId, inMovementId: inId, matched })
    const now = new Date()
    await executor
      .update(m)
      .set({ counterpartAccountId: arrival.accountId, updatedAt: now })
      .where(eq(m.id, outId))
    await executor
      .update(m)
      .set({ counterpartAccountId: out.accountId, updatedAt: now })
      .where(eq(m.id, inId))
  }
}

/**
 * The account's invested amount at the end of a Europe/Paris day: the
 * replay's step in force then (cost of the coins whose cost is known, plus
 * the euros waiting), null before its first movement.
 */
export function cryptoInvestedOn(
  basis: Pick<CostBasis, 'steps'>,
  accountId: string,
  day: string,
): InvestedStep | null {
  return stepBefore(basis, accountId, parisDayEnd(day).getTime())
}

/** The account's invested amount now. */
export function cryptoInvestedNow(
  basis: Pick<CostBasis, 'steps'>,
  accountId: string,
  now: Date,
): InvestedStep | null {
  return stepBefore(basis, accountId, now.getTime() + 1)
}

/** The sum of `flows` up to each of `times` (sorted), included. */
function cumulativeAt(
  times: readonly number[],
  flows: readonly { at: number; units: bigint }[],
): bigint[] {
  const sorted = [...flows].sort((a, b) => a.at - b.at)
  const sums: bigint[] = []
  let sum = 0n
  let next = 0
  for (const time of times) {
    while (next < sorted.length && sorted[next].at <= time) {
      sum += sorted[next].units
      next++
    }
    sums.push(sum)
  }
  return sums
}
