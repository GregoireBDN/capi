import { Inject, Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
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
   * Links the departures and arrivals that match one way only
   * (`matchTransfers`) among those not linked, answered nor unlinked by
   * hand, and names each side's account on the other. Run after each wallet
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
