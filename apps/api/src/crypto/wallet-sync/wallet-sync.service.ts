import { Inject, Injectable, Logger } from '@nestjs/common'
import { and, eq, inArray, isNull, ne, notInArray } from 'drizzle-orm'
import { DatabaseService } from '#/database/database.service'
import {
  accountsTable,
  cryptoHoldingsTable,
  cryptoWalletKeysTable,
  cryptoWalletTokensTable,
  type SelectCryptoWalletKey,
} from '#/database/schema'
import type { CryptoChain } from '#/database/schema/domain-enums'
import { fitsNumeric, formatDecimal, rescale } from '../decimal'
import {
  BitcoinAddressDeriver,
  MAX_ADDRESSES_PER_BRANCH,
} from './bitcoin-derivation'
import {
  type BitcoinChainProvider,
  ChainProviderError,
  type EvmChain,
  type EvmChainProvider,
  type TokenContractProvider,
  type TokenDeployment,
} from './chain-provider'
import {
  BITCOIN_ASSET,
  BITCOIN_DECIMALS,
  CHAIN_LABELS,
  type ChainAsset,
  EVM_CHAINS,
  EVM_NATIVE_DECIMALS,
  NATIVE_ASSET_IDS,
} from './chains'
import { ProviderBackoff } from './provider-backoff'

/** Nest token of the `WalletSyncOptions` object. */
export const WALLET_SYNC_OPTIONS = Symbol('WALLET_SYNC_OPTIONS')

export interface WalletSyncOptions {
  /**
   * Chain endpoints; both null when `WALLET_SYNC_ENABLED` is off, so nothing
   * is ever sent anywhere.
   */
  bitcoin: BitcoinChainProvider | null
  evm: EvmChainProvider | null
  /** Token contracts lookup (the price provider); null when prices are off. */
  tokens: TokenContractProvider | null
  /** A wallet is synced again automatically at most this often. */
  intervalMs: number
  /** Consecutive unused addresses that end a Bitcoin branch scan (BIP44). */
  gapLimit?: number
}

export const DEFAULT_GAP_LIMIT = 20
/** "Synchroniser" asks the chains again at most this often per wallet. */
export const FORCE_SYNC_MIN_INTERVAL_MS = 30_000
/** Token deployments are looked up again after this long. */
const TOKEN_CACHE_TTL_MS = 24 * 60 * 60_000
const QUANTITY_SCALE = 18
const QUANTITY_INTEGER_DIGITS = 20

const h = cryptoHoldingsTable
const k = cryptoWalletKeysTable
const a = accountsTable

export type SyncFailure = ChainProviderError['reason'] | 'tokens' | 'unexpected'

/** A chain the latest sync could not read (its last lines are kept). */
export interface ChainFailure {
  chain: CryptoChain
  reason: SyncFailure
  /** End of the chain endpoint's rate-limit backoff, if one is running. */
  retryAt: Date | null
}

export interface WalletSyncStatus {
  enabled: boolean
  syncedAt: Date | null
  failedAt: Date | null
  /**
   * Chains the latest sync since the server started could not read (empty
   * when unknown, e.g. after a restart).
   */
  failedChains: ChainFailure[]
  /** When every failed chain may be asked again (latest backoff end). */
  retryAt: Date | null
}

interface Line {
  asset: ChainAsset
  chain: CryptoChain
  /** Smallest units (satoshis, wei, token units). */
  units: bigint
  decimals: number
}

/** What one sync read: lines of the chains read, failures of the others. */
interface ChainsRead {
  lines: Line[]
  read: Set<CryptoChain>
  failed: Map<CryptoChain, SyncFailure>
}

/**
 * Self-custody wallet sync: reads the balances of a wallet account's public
 * keys on their chains and replaces the account's `sync` holding lines (one
 * per asset and chain, the chain label as location). Manual lines are never
 * touched. Each chain is read on its own: a chain that fails keeps its last
 * synced lines while the others are replaced, and the failure is recorded so
 * they show as stale; it never fails the request.
 *
 * Rate limits (HTTP 429) start a backoff per endpoint (`ProviderBackoff`:
 * `Retry-After`, else exponential, capped), during which that chain is not
 * asked at all, whether the sync comes from a page load or "Synchroniser".
 *
 * Privacy: the endpoints receive public addresses (derived locally from the
 * extended keys) and token contracts, nothing else. Logs carry the chain id,
 * the failure reason and line counts only: never a key, an address, a URL or
 * a quantity.
 */
@Injectable()
export class WalletSyncService {
  private readonly logger = new Logger(WalletSyncService.name)
  private readonly deriver = new BitcoinAddressDeriver()
  /** Last attempt per account (epoch ms), successful or not. */
  private readonly attempts = new Map<string, number>()
  private readonly inFlight = new Map<string, Promise<void>>()
  /** Rate-limit backoff per chain endpoint (Esplora, each EVM RPC). */
  private readonly backoff = new ProviderBackoff<CryptoChain>()
  /** Chains the latest sync of each account could not read. */
  private readonly failures = new Map<string, Map<CryptoChain, SyncFailure>>()
  private readonly deployments = new Map<
    string,
    { at: number; byChain: Partial<Record<EvmChain, TokenDeployment>> }
  >()

  // Explicit tokens: esbuild-based runners (tsx, used by the spec generator)
  // drop the reflected type of a parameter next to a decorated one.
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(WALLET_SYNC_OPTIONS) private readonly options: WalletSyncOptions,
  ) {}

  get enabled(): boolean {
    return this.options.bitcoin !== null || this.options.evm !== null
  }

  private get db() {
    return this.database.db
  }

  private get gapLimit(): number {
    return this.options.gapLimit ?? DEFAULT_GAP_LIMIT
  }

  /**
   * Before a valuation: syncs the open wallet accounts among `accountIds`
   * whose last attempt is older than the interval.
   */
  async syncDue(accountIds: readonly string[], now: Date): Promise<void> {
    if (!this.enabled || accountIds.length === 0) return
    const wallets = await this.db
      .select({ id: a.id })
      .from(a)
      .where(
        and(
          inArray(a.id, [...accountIds]),
          eq(a.cryptoSource, 'wallet'),
          isNull(a.archivedAt),
        ),
      )
    const at = now.getTime()
    const due = wallets.filter(({ id }) => {
      const last = this.attempts.get(id)
      return last === undefined || at - last >= this.options.intervalMs
    })
    for (const { id } of due) await this.run(id, now)
  }

  /**
   * "Synchroniser": syncs the wallet now, unless it was tried less than
   * `FORCE_SYNC_MIN_INTERVAL_MS` ago (the stored result is kept then).
   */
  async syncNow(accountId: string, now: Date): Promise<void> {
    if (!this.enabled) return
    const last = this.attempts.get(accountId)
    if (
      !this.inFlight.has(accountId) &&
      last !== undefined &&
      now.getTime() - last < FORCE_SYNC_MIN_INTERVAL_MS
    ) {
      return
    }
    await this.run(accountId, now)
  }

  /** Sync state of the wallet accounts among `accountIds`. */
  async statuses(
    accountIds: readonly string[],
    now: Date = new Date(),
  ): Promise<Map<string, WalletSyncStatus>> {
    if (accountIds.length === 0) return new Map()
    const rows = await this.db
      .select({
        id: a.id,
        syncedAt: a.cryptoSyncedAt,
        failedAt: a.cryptoSyncFailedAt,
      })
      .from(a)
      .where(and(inArray(a.id, [...accountIds]), eq(a.cryptoSource, 'wallet')))
    return new Map(
      rows.map((row) => {
        const failedChains = this.failedChains(row.id, now)
        const retryAt = failedChains.reduce<Date | null>(
          (latest, failure) =>
            failure.retryAt && (!latest || failure.retryAt > latest)
              ? failure.retryAt
              : latest,
          null,
        )
        return [
          row.id,
          {
            enabled: this.enabled,
            syncedAt: row.syncedAt,
            failedAt: row.failedAt,
            // In memory only, and stale once a sync read every chain.
            failedChains: row.failedAt ? failedChains : [],
            retryAt: row.failedAt ? retryAt : null,
          },
        ]
      }),
    )
  }

  private failedChains(accountId: string, now: Date): ChainFailure[] {
    const failed = this.failures.get(accountId)
    if (!failed) return []
    return [...failed].map(([chain, reason]) => {
      const until = this.backoff.until(chain, now.getTime())
      return { chain, reason, retryAt: until === null ? null : new Date(until) }
    })
  }

  /**
   * After the keys or tokens of a wallet change: its next sync (automatic
   * or "Synchroniser") reads the chains again at once.
   */
  invalidate(accountId: string): void {
    this.attempts.delete(accountId)
  }

  /**
   * Whether an asset is a token deployed on a supported EVM chain; null when
   * it cannot be told (sync or prices disabled, lookup failed).
   */
  async isEvmToken(assetId: string): Promise<boolean | null> {
    try {
      const deployments = await this.tokenDeployments(assetId)
      return deployments === null ? null : Object.keys(deployments).length > 0
    } catch {
      return null
    }
  }

  /** One sync per account at a time; a concurrent caller waits for it. */
  private run(accountId: string, now: Date): Promise<void> {
    const running = this.inFlight.get(accountId)
    if (running) return running
    this.attempts.set(accountId, now.getTime())
    const run = this.sync(accountId, now).finally(() =>
      this.inFlight.delete(accountId),
    )
    this.inFlight.set(accountId, run)
    return run
  }

  private async sync(accountId: string, now: Date): Promise<void> {
    const keys = await this.db
      .select()
      .from(k)
      .where(eq(k.accountId, accountId))
    const { lines, read, failed } = await this.readChains(accountId, keys, now)
    this.failures.set(accountId, failed)
    if (failed.size > 0 && read.size === 0) {
      await this.db
        .update(a)
        .set({ cryptoSyncFailedAt: now, updatedAt: now })
        .where(eq(a.id, accountId))
      return
    }
    const rows = mergeLines(lines)
    // Lines of the chains that failed stay as last synced.
    const kept = [...failed.keys()].map((chain) => CHAIN_LABELS[chain])
    await this.db.transaction(async (tx) => {
      await tx
        .delete(h)
        .where(
          and(
            eq(h.accountId, accountId),
            eq(h.origin, 'sync'),
            kept.length > 0 ? notInArray(h.location, kept) : undefined,
          ),
        )
      if (rows.length > 0) {
        await tx.insert(h).values(
          rows.map((row) => ({
            accountId,
            assetId: row.asset.id,
            symbol: row.asset.symbol,
            name: row.asset.name,
            quantity: row.quantity,
            location: CHAIN_LABELS[row.chain],
            origin: 'sync' as const,
          })),
        )
      }
      await tx
        .update(a)
        .set({
          cryptoSyncedAt: now,
          cryptoSyncFailedAt: failed.size > 0 ? now : null,
          updatedAt: now,
        })
        .where(eq(a.id, accountId))
    })
    this.logger.log(
      `Wallet synced: ${rows.length} holding line(s)` +
        (failed.size > 0
          ? `, ${failed.size} chain(s) kept from the last sync`
          : ''),
    )
  }

  /**
   * Balances of every key on every chain, chain by chain: a chain whose
   * endpoint fails (or is backing off after a rate limit) is reported in
   * `failed` and the others are still read.
   */
  private async readChains(
    accountId: string,
    keys: SelectCryptoWalletKey[],
    now: Date,
  ): Promise<ChainsRead> {
    const result: ChainsRead = { lines: [], read: new Set(), failed: new Map() }
    const bitcoin = this.options.bitcoin
    const bitcoinKeys = keys.filter(
      (key) => key.family === 'bitcoin' && key.chains.includes('bitcoin'),
    )
    if (bitcoin && bitcoinKeys.length > 0) {
      await this.readChain(result, 'bitcoin', now, async () => {
        const lines: Line[] = []
        for (const key of bitcoinKeys) {
          lines.push({
            asset: BITCOIN_ASSET,
            chain: 'bitcoin',
            units: await this.scanBitcoin(bitcoin, key.publicKey),
            decimals: BITCOIN_DECIMALS,
          })
        }
        return lines
      })
    }

    const evm = this.options.evm
    const evmKeys = keys.filter((key) => key.family === 'evm')
    const evmChains = [
      ...new Set(
        evmKeys.flatMap((key) =>
          key.chains.filter(
            (chain): chain is EvmChain =>
              chain !== 'bitcoin' && (evm?.chains.includes(chain) ?? false),
          ),
        ),
      ),
    ]
    if (!evm || evmChains.length === 0) return result
    let tokens: Awaited<ReturnType<WalletSyncService['trackedTokens']>>
    try {
      tokens = await this.trackedTokens(accountId)
    } catch (error) {
      // Which chains the tokens are on is unknown: none is replaced.
      const reason = failureReason(error)
      for (const chain of evmChains) this.chainFailed(result, chain, reason)
      return result
    }
    for (const chain of evmChains) {
      const onChain = tokens.flatMap((token) => {
        const deployment = token.deployments[chain]
        return deployment ? [{ asset: token.asset, deployment }] : []
      })
      await this.readChain(result, chain, now, async () => {
        const lines: Line[] = []
        for (const key of evmKeys) {
          if (!key.chains.includes(chain)) continue
          const balances = await evm.balances(
            chain,
            key.publicKey,
            onChain.map((token) => ({ address: token.deployment.address })),
          )
          lines.push({
            asset: EVM_CHAINS[chain].native,
            chain,
            units: balances.native,
            decimals: EVM_NATIVE_DECIMALS,
          })
          onChain.forEach((token, i) =>
            lines.push({
              asset: token.asset,
              chain,
              units: balances.tokens[i],
              decimals: token.deployment.decimals,
            }),
          )
        }
        return lines
      })
    }
    return result
  }

  /**
   * Reads one chain unless its endpoint is backing off; a rate limit starts
   * (or lengthens) the backoff, a successful read ends it.
   */
  private async readChain(
    result: ChainsRead,
    chain: CryptoChain,
    now: Date,
    read: () => Promise<Line[]>,
  ): Promise<void> {
    const at = now.getTime()
    const until = this.backoff.until(chain, at)
    if (until !== null) {
      this.logger.log(
        `Wallet sync skipped ${chain}: rate limited, next attempt in ${seconds(until - at)} s`,
      )
      result.failed.set(chain, 'rate_limited')
      return
    }
    try {
      result.lines.push(...(await read()))
      result.read.add(chain)
      this.backoff.succeeded(chain)
    } catch (error) {
      const reason = failureReason(error)
      const retryAt =
        error instanceof ChainProviderError && reason === 'rate_limited'
          ? this.backoff.rateLimited(chain, at, error.retryAfterMs)
          : null
      this.chainFailed(result, chain, reason, retryAt && retryAt - at)
    }
  }

  private chainFailed(
    result: ChainsRead,
    chain: CryptoChain,
    reason: SyncFailure,
    backoffMs: number | null = null,
  ): void {
    result.failed.set(chain, reason)
    this.logger.warn(
      `Wallet sync failed on ${chain} (${reason})` +
        (backoffMs === null
          ? ''
          : `, next attempt in ${seconds(backoffMs)} s`) +
        '; keeping its last synced holdings',
    )
  }

  /**
   * Sum of the confirmed balances of a key's receive and change addresses,
   * each branch scanned until `gapLimit` consecutive unused addresses.
   */
  private async scanBitcoin(
    provider: BitcoinChainProvider,
    extendedKey: string,
  ): Promise<bigint> {
    let total = 0n
    for (const branch of [0, 1] as const) {
      let start = 0
      let lastUsed = -1
      // Strict gap limit: ask exactly the addresses needed to see
      // `gapLimit` unused ones in a row after the last used one.
      while (start - lastUsed - 1 < this.gapLimit) {
        const count = Math.min(
          this.gapLimit - (start - lastUsed - 1),
          MAX_ADDRESSES_PER_BRANCH - start,
        )
        if (count <= 0) break
        const addresses = this.deriver.derive(extendedKey, branch, start, count)
        const states = await provider.addressStates(addresses)
        if (states.length !== addresses.length) {
          throw new ChainProviderError('malformed')
        }
        states.forEach((state, i) => {
          total += state.balanceSats
          if (state.used) lastUsed = start + i
        })
        start += count
      }
    }
    return total
  }

  /**
   * Tokens to read: those added with "Ajouter un jeton" and the other assets
   * the account holds (manual lines), with their deployments per chain.
   */
  private async trackedTokens(accountId: string): Promise<
    {
      asset: ChainAsset
      deployments: Partial<Record<EvmChain, TokenDeployment>>
    }[]
  > {
    const [added, held] = await Promise.all([
      this.db
        .select({
          id: cryptoWalletTokensTable.assetId,
          symbol: cryptoWalletTokensTable.symbol,
          name: cryptoWalletTokensTable.name,
        })
        .from(cryptoWalletTokensTable)
        .where(eq(cryptoWalletTokensTable.accountId, accountId)),
      this.db
        .selectDistinct({ id: h.assetId, symbol: h.symbol, name: h.name })
        .from(h)
        .where(and(eq(h.accountId, accountId), ne(h.origin, 'sync'))),
    ])
    const assets = new Map<string, ChainAsset>()
    for (const asset of [...added, ...held]) {
      if (!NATIVE_ASSET_IDS.has(asset.id) && !assets.has(asset.id)) {
        assets.set(asset.id, asset)
      }
    }
    const result = []
    for (const asset of assets.values()) {
      const deployments = await this.tokenDeployments(asset.id)
      if (deployments) result.push({ asset, deployments })
    }
    return result
  }

  /** Cached lookup; null when no lookup is possible (prices disabled). */
  private async tokenDeployments(
    assetId: string,
  ): Promise<Partial<Record<EvmChain, TokenDeployment>> | null> {
    const cached = this.deployments.get(assetId)
    const provider = this.options.tokens
    if (cached && (!provider || Date.now() - cached.at < TOKEN_CACHE_TTL_MS)) {
      return cached.byChain
    }
    if (!provider) return null
    let byChain: Partial<Record<EvmChain, TokenDeployment>>
    try {
      byChain = await provider.tokenDeployments(assetId)
    } catch {
      throw new TokenLookupError()
    }
    this.deployments.set(assetId, { at: Date.now(), byChain })
    return byChain
  }
}

class TokenLookupError extends Error {
  constructor() {
    super('Token lookup failed')
    this.name = 'TokenLookupError'
  }
}

function seconds(ms: number): number {
  return Math.ceil(ms / 1000)
}

function failureReason(error: unknown): SyncFailure {
  if (error instanceof ChainProviderError) return error.reason
  if (error instanceof TokenLookupError) return 'tokens'
  return 'unexpected'
}

/**
 * One line per asset and chain (balances of several keys summed), as exact
 * decimals rounded half to even to the column's 18 places. Empty balances and
 * absurd ones (spam tokens beyond the column's range) are left out.
 */
export function mergeLines(
  lines: readonly Line[],
): { asset: ChainAsset; chain: CryptoChain; quantity: string }[] {
  const merged = new Map<string, Line>()
  for (const line of lines) {
    const key = `${line.chain}|${line.asset.id}`
    const known = merged.get(key)
    if (known && known.decimals === line.decimals) {
      known.units += line.units
    } else if (!known) {
      merged.set(key, { ...line })
    }
  }
  const out = []
  for (const line of merged.values()) {
    if (line.units <= 0n) continue
    const quantity = formatDecimal(
      rescale({ digits: line.units, scale: line.decimals }, QUANTITY_SCALE),
    )
    if (quantity === '0') continue
    if (!fitsNumeric(quantity, QUANTITY_INTEGER_DIGITS, QUANTITY_SCALE))
      continue
    out.push({ asset: line.asset, chain: line.chain, quantity })
  }
  return out
}
