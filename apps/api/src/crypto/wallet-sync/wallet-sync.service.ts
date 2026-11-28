import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm'
import { DatabaseService } from '#/database/database.service'
import {
  accountsTable,
  cryptoHoldingsTable,
  cryptoWalletKeysTable,
  cryptoWalletTokensTable,
  type SelectCryptoWalletKey,
} from '#/database/schema'
import {
  type BitcoinAddressType,
  type CryptoChain,
  DERIVABLE_ADDRESS_TYPES,
  type DerivableAddressType,
} from '#/database/schema/domain-enums'
import { CryptoCostBasisService } from '../cost-basis.service'
import { fitsNumeric, formatDecimal, rescale } from '#/common/decimal'
import { checkPublicKey } from '../wallet-keys/public-key'
import { effectiveAddressTypes } from '../wallet-keys/wallet-keys.repository'
import { BitcoinAddressDeriver } from './bitcoin-derivation'
import {
  type AddressRead,
  BitcoinScanStore,
  pendingIndices,
  readInPass,
  type ScanBranch,
  type ScanState,
  type ScanSummary,
  scanTotal,
  stateKey,
} from './bitcoin-scan'
import {
  type BitcoinAddressState,
  type BitcoinChainProvider,
  ChainProviderError,
  type EvmChain,
  type EvmChainProvider,
  type EvmTokenInfo,
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
  /** Injected in tests; a timer otherwise. */
  sleep?: (ms: number) => Promise<void>
  /** Page loads wait this long for a sync (`BACKGROUND_SYNC_WAIT_MS`). */
  backgroundWaitMs?: number
}

export const DEFAULT_GAP_LIMIT = 20
/** "Synchroniser" asks the chains again at most this often per wallet. */
export const FORCE_SYNC_MIN_INTERVAL_MS = 30_000
/** Token deployments are looked up again after this long. */
const TOKEN_CACHE_TTL_MS = 24 * 60 * 60_000
/**
 * A rate limit asking to wait at most this long pauses the Bitcoin scan and
 * resumes it, once per sync (#268); without `Retry-After`, the pause is
 * `DEFAULT_RATE_LIMIT_PAUSE_MS`. A second one, or a longer wait, fails the
 * chain and starts the backoff.
 */
export const MAX_INLINE_WAIT_MS = 60_000
const DEFAULT_RATE_LIMIT_PAUSE_MS = 10_000
/** An unfinished Bitcoin pass older than this starts over. */
export const PASS_MAX_AGE_MS = 6 * 60 * 60_000
/**
 * Page loads wait at most this long for the syncs they start; a longer one
 * (a Bitcoin scan paced at one request per second) goes on in the
 * background and its lines show on the next load.
 */
export const BACKGROUND_SYNC_WAIT_MS = 5_000
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
  /** A sync of this account is running (in the background, #381). */
  syncing: boolean
}

interface Line {
  asset: ChainAsset
  chain: CryptoChain
  /** Smallest units (satoshis, wei, token units). */
  units: bigint
  decimals: number
}

/**
 * Who asked: a page load (valuation) spares the Bitcoin endpoint, the owner
 * pressing "Synchroniser" does not.
 */
type SyncMode = 'background' | 'foreground'

/** State of the Bitcoin read of one sync. */
interface BitcoinRead {
  /** Scans completed after this are not read again (null: all are). */
  freshSince: Date | null
  /** The one inline wait of the sync was spent. */
  waited: boolean
  /** Time spent waiting inline (the backoff starts after it). */
  waitedMs: number
  /** Addresses read (logged as a count). */
  addresses: number
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
 * Privacy: the endpoints receive public addresses (the single addresses
 * saved, and those derived locally from the extended keys: when the owner
 * asks to detect an xpub's type, the first receive address of each type) and
 * token contracts, nothing else. Logs carry the chain id, the failure reason
 * and line counts only: never a key, an address, a URL or a quantity.
 */
@Injectable()
export class WalletSyncService {
  private readonly logger = new Logger(WalletSyncService.name)
  private readonly deriver = new BitcoinAddressDeriver()
  private readonly scans = new BitcoinScanStore(() => this.database.db)
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
  private readonly costBasis: CryptoCostBasisService

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(WALLET_SYNC_OPTIONS) private readonly options: WalletSyncOptions,
    @Optional()
    @Inject(CryptoCostBasisService)
    costBasis?: CryptoCostBasisService,
  ) {
    this.costBasis = costBasis ?? new CryptoCostBasisService(database)
  }

  /** Whether this server reads `chain` at all (its endpoint configured). */
  private reads(chain: CryptoChain): boolean {
    return chain === 'bitcoin'
      ? this.options.bitcoin !== null
      : (this.options.evm?.chains.includes(chain) ?? false)
  }

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
   * whose last attempt is older than the interval. Syncs that outlive
   * `BACKGROUND_SYNC_WAIT_MS` go on in the background and call `onLate` with
   * their accounts once done, so their new lines get valued (#269).
   */
  async syncDue(
    accountIds: readonly string[],
    now: Date,
    onLate?: (accountIds: string[]) => Promise<void>,
  ): Promise<void> {
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
    const due = wallets.filter(({ id }) => this.syncDueFor(id, now))
    if (due.length === 0) return
    const work = (async () => {
      for (const { id } of due) await this.run(id, now, 'background')
    })()
    const finished = await waitAtMost(
      work,
      this.options.backgroundWaitMs ?? BACKGROUND_SYNC_WAIT_MS,
    )
    if (!finished && onLate) {
      void work
        .then(() =>
          this.database.outsideRequest(() => onLate(due.map(({ id }) => id))),
        )
        .catch((error: unknown) => {
          const name = error instanceof Error ? error.name : 'unknown'
          this.logger.error(
            `Valuation after a background sync failed (${name})`,
          )
        })
    }
  }

  /**
   * Whether `syncDue` would read this wallet account (#381): sync on, no
   * sync running, the last attempt older than the interval. Memory only.
   */
  syncDueFor(accountId: string, now: Date): boolean {
    if (!this.enabled || this.inFlight.has(accountId)) return false
    const last = this.attempts.get(accountId)
    return last === undefined || now.getTime() - last >= this.options.intervalMs
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
    await this.run(accountId, now, 'foreground')
  }

  /** Last complete Bitcoin scans of the keys (what each address type found). */
  scanSummaries(
    keyIds: readonly string[],
  ): Promise<Map<string, ScanSummary[]>> {
    return this.scans.summaries(keyIds)
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
            syncing: this.inFlight.has(row.id),
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
   * What a token contract says of itself on a chain (#269): `disabled` when
   * the server does not read that chain, `unavailable` when its endpoint
   * fails or is backing off, null when no token is deployed there.
   */
  async tokenInfo(
    chain: EvmChain,
    contract: string,
  ): Promise<EvmTokenInfo | null | 'disabled' | 'unavailable'> {
    const evm = this.options.evm
    if (!evm || !evm.chains.includes(chain)) return 'disabled'
    if (this.backoff.until(chain, Date.now()) !== null) return 'unavailable'
    try {
      return await evm.tokenInfo(chain, contract)
    } catch (error) {
      if (
        error instanceof ChainProviderError &&
        error.reason === 'rate_limited'
      ) {
        this.backoff.rateLimited(chain, Date.now(), error.retryAfterMs)
      }
      this.logger.warn(
        `Token lookup failed on ${chain} (${failureReason(error)})`,
      )
      return 'unavailable'
    }
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

  /**
   * One sync per account at a time; a concurrent caller waits for it. Never
   * rejects: a background sync may outlive the request that started it.
   */
  private run(accountId: string, now: Date, mode: SyncMode): Promise<void> {
    const running = this.inFlight.get(accountId)
    if (running) return running
    this.attempts.set(accountId, now.getTime())
    // Outside the request's transaction, as its user (#559): it may outlive
    // the request, and its progress is kept even when it fails (#557).
    const run = this.database
      .outsideRequest(() => this.sync(accountId, now, mode))
      .catch((error: unknown) => {
        // The error class only: a database error carries bound values.
        const name = error instanceof Error ? error.name : 'unknown'
        this.logger.error(`Wallet sync failed (${name})`)
      })
      .finally(() => this.inFlight.delete(accountId))
    this.inFlight.set(accountId, run)
    return run
  }

  private async sync(
    accountId: string,
    now: Date,
    mode: SyncMode,
  ): Promise<void> {
    const keys = await this.db
      .select()
      .from(k)
      .where(eq(k.accountId, accountId))
    const { lines, read, failed } = await this.readChains(
      accountId,
      keys,
      now,
      mode,
    )
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
    // Only a read of every chain of every key says what rose or fell (#373):
    // a failed or partial read records no movement.
    const complete =
      failed.size === 0 &&
      keys.length > 0 &&
      keys.every((key) =>
        key.chains.every((chain) => read.has(chain) || !this.reads(chain)),
      )
    let observed = 0
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
      if (complete) {
        observed = await this.costBasis.observe(
          tx,
          accountId,
          rows.map((row) => ({
            assetId: row.asset.id,
            symbol: row.asset.symbol,
            quantity: row.quantity,
          })),
          now,
          'wallet_sync',
        )
      }
    })
    if (observed > 0) await this.costBasis.match()
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
    mode: SyncMode,
  ): Promise<ChainsRead> {
    const result: ChainsRead = { lines: [], read: new Set(), failed: new Map() }
    const bitcoin = this.options.bitcoin
    const bitcoinKeys = keys.filter(
      (key) => key.family === 'bitcoin' && key.chains.includes('bitcoin'),
    )
    if (bitcoin && bitcoinKeys.length > 0) {
      const ctx: BitcoinRead = {
        freshSince: this.freshSince(accountId, now, mode),
        waited: false,
        waitedMs: 0,
        addresses: 0,
      }
      await this.readChain(
        result,
        'bitcoin',
        now,
        async () => {
          const lines: Line[] = []
          try {
            for (const key of bitcoinKeys) {
              lines.push({
                asset: BITCOIN_ASSET,
                chain: 'bitcoin',
                units: await this.readBitcoinKey(bitcoin, key, now, ctx),
                decimals: BITCOIN_DECIMALS,
              })
            }
          } catch (error) {
            if (ctx.addresses > 0) {
              this.logger.log(
                `Wallet sync kept ${ctx.addresses} Bitcoin address(es) read before failing; the next attempt resumes there`,
              )
            }
            throw error
          }
          return lines
        },
        () => ctx.waitedMs,
      )
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
    /** Time the read spent waiting inline, before the backoff starts. */
    waitedMs: () => number = () => 0,
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
      const from = at + waitedMs()
      const retryAt =
        error instanceof ChainProviderError && reason === 'rate_limited'
          ? this.backoff.rateLimited(chain, from, error.retryAfterMs)
          : null
      this.chainFailed(result, chain, reason, retryAt && retryAt - from)
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
   * Scans completed since this are reused as they are: on page loads, those
   * under `intervalMs` old; on "Synchroniser", only while resuming a Bitcoin
   * read that failed (a healthy one reads every key again).
   */
  private freshSince(
    accountId: string,
    now: Date,
    mode: SyncMode,
  ): Date | null {
    const since = new Date(now.getTime() - this.options.intervalMs)
    if (mode === 'background') return since
    return this.failures.get(accountId)?.has('bitcoin') ? since : null
  }

  /**
   * Confirmed balance of a Bitcoin key: a single address is a scan of one
   * address; an extended key is scanned in each of its address types
   * (detected first when the owner asked for it).
   */
  private async readBitcoinKey(
    provider: BitcoinChainProvider,
    key: SelectCryptoWalletKey,
    now: Date,
    ctx: BitcoinRead,
  ): Promise<bigint> {
    const check = checkPublicKey(key.publicKey)
    if (!check.ok || check.family !== 'bitcoin') {
      throw new ChainProviderError('malformed')
    }
    if (check.format === 'address') {
      return this.scan(provider, key, check.addressType, now, ctx, () => [
        check.publicKey,
      ])
    }
    const types =
      effectiveAddressTypes(key) ??
      (await this.detectAddressTypes(provider, key, now, ctx))
    let total = 0n
    for (const type of types) {
      if (type === 'taproot') continue
      total += await this.scan(provider, key, type, now, ctx)
    }
    return total
  }

  /**
   * Address types of an `xpub` whose owner asked to detect them: the types
   * whose first receive address has history, stored on the key. None yet (an
   * unused account): nothing is stored, the next sync tries again. The
   * addresses read count as the start of each type's scan.
   */
  private async detectAddressTypes(
    provider: BitcoinChainProvider,
    key: SelectCryptoWalletKey,
    now: Date,
    ctx: BitcoinRead,
  ): Promise<DerivableAddressType[]> {
    const addresses = DERIVABLE_ADDRESS_TYPES.map(
      (type) => this.deriver.derive(key.publicKey, type, 0, 0, 1)[0],
    )
    let states: BitcoinAddressState[]
    for (;;) {
      try {
        states = await provider.addressStates(addresses)
        break
      } catch (error) {
        await this.waitInline(error, ctx)
      }
    }
    if (states.length !== addresses.length) {
      throw new ChainProviderError('malformed')
    }
    ctx.addresses += addresses.length
    for (const [i, type] of DERIVABLE_ADDRESS_TYPES.entries()) {
      const scan = await this.scans.load(key.id, type)
      const passStart = this.passStart(scan, now)
      if (passStart !== scan.passStartedAt) {
        await this.scans.startPass(scan.id, passStart)
      }
      await this.scans.save(scan.id, [
        { branch: 0, index: 0, ...states[i], readAt: now },
      ])
    }
    const used = DERIVABLE_ADDRESS_TYPES.filter((_, i) => states[i].used)
    if (used.length > 0) {
      await this.db
        .update(k)
        .set({
          addressTypes: used,
          detectAddressTypes: false,
          updatedAt: new Date(),
        })
        .where(eq(k.id, key.id))
    }
    return used
  }

  /** Start of the pass to continue, or `now` for a new one. */
  private passStart(scan: ScanState, now: Date): Date {
    const started = scan.passStartedAt
    if (
      started === null ||
      started.getTime() > now.getTime() ||
      now.getTime() - started.getTime() > PASS_MAX_AGE_MS
    ) {
      return now
    }
    return started
  }

  /**
   * Balance of a key in one address type (#268), from its stored scan: a
   * fresh complete scan is reused as it is; otherwise the pass (resumed, or
   * new) reads, on each branch, the used addresses and the gap window after
   * the last used one, skipping what it already read. Every address read is
   * stored, also when the pass is cut short, so the next attempt resumes. A
   * single address (`single`) is a pass over that one address.
   */
  private async scan(
    provider: BitcoinChainProvider,
    key: SelectCryptoWalletKey,
    type: BitcoinAddressType,
    now: Date,
    ctx: BitcoinRead,
    single?: () => string[],
  ): Promise<bigint> {
    const scan = await this.scans.load(key.id, type)
    if (
      ctx.freshSince !== null &&
      scan.passStartedAt === null &&
      scan.completedAt !== null &&
      scan.completedAt.getTime() >= ctx.freshSince.getTime()
    ) {
      return scanTotal(scan)
    }
    const passStart = this.passStart(scan, now)
    if (passStart !== scan.passStartedAt) {
      await this.scans.startPass(scan.id, passStart)
    }
    const reads = new Map<string, AddressRead>()
    const record = (
      branch: ScanBranch,
      index: number,
      state: BitcoinAddressState,
    ) => {
      const at = stateKey(branch, index)
      const read = { branch, index, ...state, readAt: now }
      if (!reads.has(at)) ctx.addresses++
      scan.states.set(at, read)
      reads.set(at, read)
    }
    try {
      for (const branch of single ? ([0] as const) : ([0, 1] as const)) {
        for (;;) {
          const todo = single
            ? readInPass(scan.states.get(stateKey(0, 0)), passStart)
              ? []
              : [0]
            : pendingIndices(scan.states, branch, passStart, this.gapLimit)
          if (todo.length === 0) break
          const addresses = single
            ? single()
            : this.addressesAt(key.publicKey, type, branch, todo)
          try {
            const states = await provider.addressStates(addresses, (i, state) =>
              record(branch, todo[i], state),
            )
            if (states.length !== addresses.length) {
              throw new ChainProviderError('malformed')
            }
            states.forEach((state, i) => record(branch, todo[i], state))
          } catch (error) {
            await this.waitInline(error, ctx)
          }
        }
      }
    } finally {
      await this.scans.save(scan.id, [...reads.values()])
    }
    await this.scans.complete(scan.id, now)
    return scanTotal(scan)
  }

  /** Derived addresses of a branch at the given indices (sorted). */
  private addressesAt(
    extendedKey: string,
    type: DerivableAddressType | BitcoinAddressType,
    branch: ScanBranch,
    indices: readonly number[],
  ): string[] {
    if (type === 'taproot') throw new ChainProviderError('malformed')
    const all = this.deriver.derive(
      extendedKey,
      type,
      branch,
      0,
      indices[indices.length - 1] + 1,
    )
    return indices.map((index) => all[index])
  }

  /**
   * After a failed read: waits out a rate limit once per sync when it asks
   * for at most `MAX_INLINE_WAIT_MS` (the scan then resumes), else rethrows.
   */
  private async waitInline(error: unknown, ctx: BitcoinRead): Promise<void> {
    if (
      ctx.waited ||
      !(error instanceof ChainProviderError) ||
      error.reason !== 'rate_limited'
    ) {
      throw error
    }
    const wait = error.retryAfterMs ?? DEFAULT_RATE_LIMIT_PAUSE_MS
    if (wait > MAX_INLINE_WAIT_MS) throw error
    ctx.waited = true
    this.logger.log(
      `Wallet sync paused on bitcoin: rate limited, resuming in ${seconds(wait)} s`,
    )
    await (this.options.sleep ?? sleep)(wait)
    ctx.waitedMs += wait
  }

  /**
   * Tokens to read: those added with "Ajouter un jeton" (#269: manual lines
   * no longer make the sync read their asset), with their deployments per
   * chain: stored for a token added by its contract, looked up from the
   * price provider for one found by name.
   */
  private async trackedTokens(accountId: string): Promise<
    {
      asset: ChainAsset
      deployments: Partial<Record<EvmChain, TokenDeployment>>
    }[]
  > {
    const added = await this.db
      .select()
      .from(cryptoWalletTokensTable)
      .where(eq(cryptoWalletTokensTable.accountId, accountId))
    const result = []
    const seen = new Set<string>()
    for (const token of added) {
      if (NATIVE_ASSET_IDS.has(token.assetId) || seen.has(token.assetId)) {
        continue
      }
      seen.add(token.assetId)
      const asset = {
        id: token.assetId,
        symbol: token.symbol,
        name: token.name,
      }
      if (token.chain && token.chain !== 'bitcoin' && token.contract) {
        result.push({
          asset,
          deployments: {
            [token.chain]: {
              address: token.contract,
              decimals: token.decimals ?? 0,
            },
          },
        })
        continue
      }
      const deployments = await this.tokenDeployments(token.assetId)
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Waits for `work`, or `ms` at most (the work goes on either way); whether
 * it finished in time.
 */
async function waitAtMost(work: Promise<void>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const finished = await Promise.race([
    work.then(() => true),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), ms)
    }),
  ])
  clearTimeout(timer)
  return finished
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
