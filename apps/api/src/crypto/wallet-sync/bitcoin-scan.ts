import { and, count, eq, inArray, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import {
  cryptoBitcoinScanAddressesTable,
  cryptoBitcoinScansTable,
} from '#/database/schema'
import type { BitcoinAddressType } from '#/database/schema/domain-enums'
import { MAX_ADDRESSES_PER_BRANCH } from './bitcoin-derivation'

/**
 * Resumable Bitcoin scans (#268). A public Esplora answers one address per
 * request with a per-IP budget, so the state of every address read is kept:
 * a pass reads the used addresses (their balance can change) and the gap
 * window after the last used one on each branch, skipping what it already
 * read, so a pass cut short by a rate limit resumes where it stopped and a
 * complete re-sync does not start from address 0. Only branch, index, usage
 * and balance are stored: addresses are derived again from the key.
 */

type Db = PostgresJsDatabase<typeof schema>

export type ScanBranch = 0 | 1

export interface AddressRead {
  branch: ScanBranch
  index: number
  used: boolean
  balanceSats: bigint
  readAt: Date
}

export interface ScanState {
  id: string
  passStartedAt: Date | null
  completedAt: Date | null
  /** Last read state per address, keyed by `stateKey`. */
  states: Map<string, AddressRead>
}

export function stateKey(branch: ScanBranch, index: number): string {
  return `${branch}:${index}`
}

/** Whether an address was read during the pass started at `passStart`. */
export function readInPass(
  read: AddressRead | undefined,
  passStart: Date,
): boolean {
  return read !== undefined && read.readAt.getTime() >= passStart.getTime()
}

/**
 * Indices of a branch the pass still has to read: the used addresses known
 * so far and the `gapLimit` addresses after the last used one (strict gap
 * limit), minus those read since `passStart`. Called again after each read,
 * since a used address found in the window moves the window.
 */
export function pendingIndices(
  states: ReadonlyMap<string, AddressRead>,
  branch: ScanBranch,
  passStart: Date,
  gapLimit: number,
): number[] {
  const wanted = new Set<number>()
  let lastUsed = -1
  for (const read of states.values()) {
    if (read.branch !== branch || !read.used) continue
    wanted.add(read.index)
    lastUsed = Math.max(lastUsed, read.index)
  }
  const end = Math.min(lastUsed + gapLimit, MAX_ADDRESSES_PER_BRANCH - 1)
  for (let index = lastUsed + 1; index <= end; index++) wanted.add(index)
  return [...wanted]
    .filter(
      (index) => !readInPass(states.get(stateKey(branch, index)), passStart),
    )
    .sort((x, y) => x - y)
}

/** Sum of the last read balances of a scan (satoshis). */
export function scanTotal(scan: Pick<ScanState, 'states'>): bigint {
  let total = 0n
  for (const read of scan.states.values()) total += read.balanceSats
  return total
}

/** What the last complete pass of a key found in one address type. */
export interface ScanSummary {
  addressType: BitcoinAddressType
  usedAddresses: number
  completedAt: Date
}

const s = cryptoBitcoinScansTable
const sa = cryptoBitcoinScanAddressesTable

/** Database side of the scans (`crypto_bitcoin_scans` and their addresses). */
export class BitcoinScanStore {
  constructor(private readonly db: () => Db) {}

  /** The scan of a key in a type, created empty the first time. */
  async load(
    keyId: string,
    addressType: BitcoinAddressType,
  ): Promise<ScanState> {
    await this.db()
      .insert(s)
      .values({ keyId, addressType })
      .onConflictDoNothing({ target: [s.keyId, s.addressType] })
    const [scan] = await this.db()
      .select()
      .from(s)
      .where(and(eq(s.keyId, keyId), eq(s.addressType, addressType)))
    const rows = await this.db().select().from(sa).where(eq(sa.scanId, scan.id))
    const states = new Map<string, AddressRead>()
    for (const row of rows) {
      const branch = row.branch === 1 ? 1 : 0
      states.set(stateKey(branch, row.addressIndex), {
        branch,
        index: row.addressIndex,
        used: row.used,
        balanceSats: row.balanceSats,
        readAt: row.readAt,
      })
    }
    return {
      id: scan.id,
      passStartedAt: scan.passStartedAt,
      completedAt: scan.completedAt,
      states,
    }
  }

  async startPass(scanId: string, at: Date): Promise<void> {
    await this.db()
      .update(s)
      .set({ passStartedAt: at, updatedAt: new Date() })
      .where(eq(s.id, scanId))
  }

  async complete(scanId: string, at: Date): Promise<void> {
    await this.db()
      .update(s)
      .set({ passStartedAt: null, completedAt: at, updatedAt: new Date() })
      .where(eq(s.id, scanId))
  }

  /** Stores the addresses read (latest state wins). */
  async save(scanId: string, reads: readonly AddressRead[]): Promise<void> {
    if (reads.length === 0) return
    // One row per address, the last read of the batch kept.
    const latest = new Map<string, AddressRead>()
    for (const read of reads)
      latest.set(stateKey(read.branch, read.index), read)
    await this.db()
      .insert(sa)
      .values(
        [...latest.values()].map((read) => ({
          scanId,
          branch: read.branch,
          addressIndex: read.index,
          used: read.used,
          balanceSats: read.balanceSats,
          readAt: read.readAt,
        })),
      )
      .onConflictDoUpdate({
        target: [sa.scanId, sa.branch, sa.addressIndex],
        set: {
          used: sql`excluded.used`,
          balanceSats: sql`excluded.balance_sats`,
          readAt: sql`excluded.read_at`,
          updatedAt: new Date(),
        },
      })
  }

  /** Completed scans of the keys, with the number of used addresses. */
  async summaries(
    keyIds: readonly string[],
  ): Promise<Map<string, ScanSummary[]>> {
    const result = new Map<string, ScanSummary[]>()
    if (keyIds.length === 0) return result
    const rows = await this.db()
      .select({
        keyId: s.keyId,
        addressType: s.addressType,
        completedAt: s.completedAt,
        usedAddresses: count(sa.id),
      })
      .from(s)
      .leftJoin(sa, and(eq(sa.scanId, s.id), eq(sa.used, true)))
      .where(inArray(s.keyId, [...keyIds]))
      .groupBy(s.id)
    for (const row of rows) {
      if (!row.completedAt) continue
      const list = result.get(row.keyId) ?? []
      list.push({
        addressType: row.addressType,
        usedAddresses: Number(row.usedAddresses),
        completedAt: row.completedAt,
      })
      result.set(row.keyId, list)
    }
    return result
  }
}
