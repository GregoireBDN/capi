import { inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '#/database/schema'
import { cryptoAssetAliasesTable } from '#/database/schema'
import { FIAT_TICKERS, knownAsset } from './assets'
import type { AssetMapping } from './crypto-import.types'

type Db = PostgresJsDatabase<typeof schema>
type Executor = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Price ids of exchange tickers: the built-in table (renames followed),
 * then the aliases saved by the imports. Fiat and unknown tickers are left
 * out.
 */
export async function loadAssetMappings(
  executor: Executor,
  tickers: Iterable<string>,
): Promise<Map<string, AssetMapping>> {
  const mappings = new Map<string, AssetMapping>()
  const rest: string[] = []
  for (const ticker of new Set(tickers)) {
    if (FIAT_TICKERS.has(ticker)) continue
    const known = knownAsset(ticker)
    if (known) mappings.set(ticker, known)
    else rest.push(ticker)
  }
  if (rest.length > 0) {
    const rows = await executor
      .select()
      .from(cryptoAssetAliasesTable)
      .where(inArray(cryptoAssetAliasesTable.ticker, rest))
    for (const row of rows) {
      mappings.set(row.ticker, {
        ticker: row.ticker,
        assetId: row.assetId,
        symbol: row.symbol,
        name: row.name,
      })
    }
  }
  return mappings
}
