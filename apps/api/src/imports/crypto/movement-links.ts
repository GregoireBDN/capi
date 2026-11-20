import { and, eq, inArray, isNull, ne } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import {
  accountsTable,
  cryptoHoldingsTable,
  cryptoMovementsTable,
} from '#/database/schema'
import { FIAT_TICKERS } from './assets'
import type { AssetMapping } from './crypto-import.types'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

const m = cryptoMovementsTable
const CHUNK = 500

/** Movement kinds that leave or reach the exchange from another account. */
export const CRYPTO_TRANSFER_KINDS = ['withdrawal', 'deposit'] as const

/**
 * Names on the new withdrawals and deposits of an exchange account (#296)
 * the owner's other crypto account of their asset: the only open wallet or
 * manual crypto account holding it (e.g. the Ledger). Before that account's
 * first read the coins' cost follows this link alone; after it, the link
 * only narrows the matching of the two sides (#373). With none or several,
 * the movement stays unnamed. Only new movements are passed, so a link
 * removed by hand stays removed. Returns how many it named.
 */
export async function linkNewCryptoTransfers(
  executor: Executor,
  accountId: string,
  movementIds: readonly string[],
  mappings: ReadonlyMap<string, AssetMapping>,
): Promise<number> {
  if (movementIds.length === 0) return 0
  const movements: { id: string; asset: string }[] = []
  for (let start = 0; start < movementIds.length; start += CHUNK) {
    movements.push(
      ...(await executor
        .select({ id: m.id, asset: m.asset })
        .from(m)
        .where(
          and(
            inArray(m.id, movementIds.slice(start, start + CHUNK)),
            inArray(m.kind, [...CRYPTO_TRANSFER_KINDS]),
            isNull(m.counterpartAccountId),
          ),
        )),
    )
  }
  const assetIds = [
    ...new Set(
      movements
        .filter((movement) => !FIAT_TICKERS.has(movement.asset))
        .map((movement) => mappings.get(movement.asset)?.assetId)
        .filter((id): id is string => id !== undefined),
    ),
  ]
  if (assetIds.length === 0) return 0

  const holders = await executor
    .selectDistinct({
      accountId: cryptoHoldingsTable.accountId,
      assetId: cryptoHoldingsTable.assetId,
    })
    .from(cryptoHoldingsTable)
    .innerJoin(
      accountsTable,
      eq(accountsTable.id, cryptoHoldingsTable.accountId),
    )
    .where(
      and(
        inArray(cryptoHoldingsTable.assetId, assetIds),
        ne(cryptoHoldingsTable.accountId, accountId),
        isNull(accountsTable.archivedAt),
        inArray(accountsTable.cryptoSource, ['wallet', 'manual']),
      ),
    )
  const byAsset = new Map<string, Set<string>>()
  for (const holder of holders) {
    const set = byAsset.get(holder.assetId) ?? new Set<string>()
    set.add(holder.accountId)
    byAsset.set(holder.assetId, set)
  }

  let linked = 0
  for (const movement of movements) {
    const assetId = mappings.get(movement.asset)?.assetId
    const accounts = assetId ? byAsset.get(assetId) : undefined
    if (!accounts || accounts.size !== 1) continue
    await executor
      .update(m)
      .set({ counterpartAccountId: [...accounts][0], updatedAt: new Date() })
      .where(eq(m.id, movement.id))
    linked++
  }
  return linked
}
