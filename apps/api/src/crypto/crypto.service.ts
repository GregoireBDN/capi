import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { and, asc, eq, inArray, isNull, max } from 'drizzle-orm'
import {
  AccountsService,
  type AccountWithBalance,
} from '#/accounts/accounts.service'
import { DatabaseService } from '#/database/database.service'
import {
  accountsTable,
  balanceSnapshotsTable,
  cryptoHoldingsTable,
  cryptoImportsTable,
  type SelectAccount,
  type SelectCryptoHolding,
} from '#/database/schema'
import { parisToday } from '#/investments/days'
import { formatQuantity } from '#/imports/crypto/quantity'
import { toUnits } from './cost-basis'
import {
  CryptoCostBasisService,
  cryptoInvestedNow,
  type Executor,
  type LoadedCostBasis,
} from './cost-basis.service'
import { CryptoPricesService, type RefreshMode } from './crypto-prices.service'
import { divideHalfEven, formatDecimal, parseDecimal } from '#/common/decimal'
import type {
  AccountHoldingsDto,
  AssetCostDto,
  CryptoPortfolioDto,
  CryptoPriceDto,
  CryptoSettingsDto,
  CryptoSummaryDto,
  HoldingDto,
  HoldingsTotalsDto,
  RealisedGainsDto,
  SaveHoldingDto,
  ValuationSnapshotDto,
  WalletSyncStatusDto,
} from './dto/crypto.dto'
import { aggregatePortfolio, knownValue, sumDecimals } from './portfolio'
import { valuateHoldings } from './valuation'
import {
  type WalletSyncStatus,
  WalletSyncService,
} from './wallet-sync/wallet-sync.service'

const h = cryptoHoldingsTable
const s = balanceSnapshotsTable

type CryptoAccount = Pick<
  SelectAccount,
  'id' | 'name' | 'institution' | 'archivedAt' | 'cryptoSource'
>

/**
 * A live refresh (#381): `auto` does what is due (prices older than the TTL,
 * wallets not read within their interval), `force` everything (« Actualiser »).
 */
export type LiveRefreshMode = 'auto' | 'force'

function toHoldingDto(row: SelectCryptoHolding): HoldingDto {
  return {
    id: row.id,
    accountId: row.accountId,
    assetId: row.assetId,
    symbol: row.symbol,
    name: row.name,
    quantity: formatDecimal(parseDecimal(row.quantity)!),
    location: row.location,
    investedCents: row.investedCents,
    note: row.note,
    origin: row.origin,
  }
}

function syncStatusDto(
  status: WalletSyncStatus | undefined,
): WalletSyncStatusDto | null {
  if (!status) return null
  return {
    enabled: status.enabled,
    syncedAt: status.syncedAt?.toISOString() ?? null,
    failedAt: status.failedAt?.toISOString() ?? null,
    failedChains: status.failedChains.map((failure) => ({
      chain: failure.chain,
      reason: failure.reason,
      retryAt: failure.retryAt?.toISOString() ?? null,
    })),
    retryAt: status.retryAt?.toISOString() ?? null,
    syncing: status.syncing,
  }
}

export const WALLET_HOLDINGS_MESSAGE = 'Wallet holdings come from the chain'

/**
 * A wallet's holdings are read on chain (#269): no line is typed by hand
 * there, and the ones typed before can only be deleted.
 */
function assertNotWallet(account: { cryptoSource: string | null }): void {
  if (account.cryptoSource === 'wallet') {
    throw new BadRequestException(WALLET_HOLDINGS_MESSAGE)
  }
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

/**
 * Crypto holdings (quantity of an asset per wallet or exchange inside a
 * crypto account) and their valuation at the last known EUR prices.
 *
 * Valuing an account gives today's live value (holdings × the last known
 * prices) and stores nothing (#366): its stored values are the `computed`
 * points of the daily close (`CryptoDailyCloseService`), one per day, which
 * balances, performance and the net worth read through the usual snapshot
 * path.
 *
 * Reads (`holdings`, `portfolio`, `summary`) answer from the database only
 * (#381): stored holdings, last known prices (flagged stale after the TTL),
 * last sync times, and `refreshDue` when a live refresh would do something.
 * The network (prices, wallet chains) is only asked by the refreshes, which
 * the pages fire after their first render (`auto`) or on « Actualiser »
 * (`force`).
 */
@Injectable()
export class CryptoService {
  private readonly costBasis: CryptoCostBasisService

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(CryptoPricesService) private readonly prices: CryptoPricesService,
    @Inject(WalletSyncService) private readonly walletSync: WalletSyncService,
    @Optional()
    @Inject(CryptoCostBasisService)
    costBasis?: CryptoCostBasisService,
  ) {
    this.costBasis = costBasis ?? new CryptoCostBasisService(database)
  }

  private get db() {
    return this.database.db
  }

  async holdings(
    accountId: string,
    now: Date = new Date(),
  ): Promise<AccountHoldingsDto> {
    const account = await this.cryptoAccount(accountId)
    const [result] = await this.valuate([account], 'none', now)
    return result
  }

  /**
   * Today's live valuation of the open crypto accounts among `ids` (#366)
   * at the stored prices, without refreshing them: its `snapshot` is the
   * last point of an account's « Évolution » (null while a holding has no
   * price, or while it holds nothing worth anything and was never valued),
   * its totals the invested amount and gain of the replay (#373).
   */
  async live(
    ids: readonly string[],
    now: Date = new Date(),
  ): Promise<Map<string, AccountHoldingsDto>> {
    if (ids.length === 0) return new Map()
    const accounts = await this.db
      .select()
      .from(accountsTable)
      .where(
        and(
          inArray(accountsTable.id, [...ids]),
          isNull(accountsTable.archivedAt),
          eq(accountsTable.type, 'crypto'),
        ),
      )
    const results = await this.valuate(accounts, 'none', now)
    return new Map(results.map((result) => [result.accountId, result]))
  }

  /**
   * "Actualiser les cours" (`force`), or the live step a page fires after
   * showing the stored values (`auto`, #381: the wallet's sync and the
   * prices only when due), then today's live value.
   */
  async refresh(
    accountId: string,
    now: Date = new Date(),
    mode: LiveRefreshMode = 'force',
  ): Promise<AccountHoldingsDto> {
    const account = await this.writableCryptoAccount(accountId)
    const [result] = await this.valuate([account], mode, now)
    return result
  }

  /**
   * "Synchroniser" (wallet accounts): reads the wallet on chain now, then
   * values the account. A failed sync keeps the last synced holdings and is
   * reported in `sync.failedAt`, never as an error.
   */
  async sync(
    accountId: string,
    now: Date = new Date(),
  ): Promise<AccountHoldingsDto> {
    const account = await this.writableCryptoAccount(accountId)
    if (account.cryptoSource !== 'wallet') {
      throw new BadRequestException('Only wallet accounts are synced')
    }
    if (!this.walletSync.enabled) {
      throw new BadRequestException('Wallet sync is disabled on this server')
    }
    await this.walletSync.syncNow(account.id, now)
    // « Actualiser » (#269): fresh balances, then fresh prices.
    const [result] = await this.valuate([account], 'force', now)
    return result
  }

  /**
   * Personal access tokens (#104, MCP `sync_crypto_holdings`) may only add
   * or replace hand-entered lines of a `manual`-source account: exchange and
   * wallet accounts are fed by their imports and syncs, and imported or
   * synced lines are never theirs to change. Called by the controller for
   * token requests, before `create` / `update`.
   */
  async assertTokenMayWrite(
    accountId: string,
    holdingId?: string,
  ): Promise<void> {
    const account = await this.cryptoAccount(accountId)
    if (account.cryptoSource !== 'manual') {
      throw new ForbiddenException(
        'Personal access tokens can only change the holdings of manual crypto accounts',
      )
    }
    if (holdingId === undefined) return
    const [row] = await this.db
      .select({ origin: h.origin })
      .from(h)
      .where(and(eq(h.id, holdingId), eq(h.accountId, accountId)))
      .limit(1)
    if (row && row.origin !== 'manual') {
      throw new ForbiddenException(
        'Personal access tokens cannot change imported or synced holdings',
      )
    }
  }

  async create(
    accountId: string,
    dto: SaveHoldingDto,
    now: Date = new Date(),
  ): Promise<HoldingDto> {
    const account = await this.writableCryptoAccount(accountId)
    assertNotWallet(account)
    const row = await this.unique(() =>
      this.editLines(account, now, async (tx) => {
        const [created] = await tx
          .insert(h)
          .values({ accountId, ...this.values(dto), origin: 'manual' })
          .returning()
        return created
      }),
    )
    await this.valuate([account], 'auto', now)
    return toHoldingDto(row)
  }

  async update(
    accountId: string,
    holdingId: string,
    dto: SaveHoldingDto,
    now: Date = new Date(),
  ): Promise<HoldingDto> {
    const account = await this.writableCryptoAccount(accountId)
    assertNotWallet(account)
    await this.manualHolding(accountId, holdingId)
    const row = await this.unique(() =>
      this.editLines(account, now, async (tx) => {
        const [updated] = await tx
          .update(h)
          .set({ ...this.values(dto), updatedAt: now })
          .where(
            and(
              eq(h.id, holdingId),
              eq(h.accountId, accountId),
              eq(h.origin, 'manual'),
            ),
          )
          .returning()
        return updated
      }),
    )
    if (!row) throw new NotFoundException('Holding not found')
    await this.valuate([account], 'auto', now)
    return toHoldingDto(row)
  }

  async remove(
    accountId: string,
    holdingId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const account = await this.writableCryptoAccount(accountId)
    await this.manualHolding(accountId, holdingId)
    const deleted = await this.editLines(account, now, (tx) =>
      tx
        .delete(h)
        .where(
          and(
            eq(h.id, holdingId),
            eq(h.accountId, accountId),
            eq(h.origin, 'manual'),
          ),
        )
        .returning({ id: h.id }),
    )
    if (deleted.length === 0) throw new NotFoundException('Holding not found')
  }

  /**
   * Changes the lines typed by hand in one transaction; on a manual account
   * (#373), what rose or fell is then recorded as observed movements, an
   * arrival taking as its cost what the typed invested amounts of its asset
   * rose by (when every line of it has one), and the transfers are matched.
   */
  private async editLines<T>(
    account: Pick<SelectAccount, 'id' | 'cryptoSource'>,
    now: Date,
    write: (tx: Executor) => Promise<T>,
  ): Promise<T> {
    let observed = 0
    const result = await this.db.transaction(async (tx) => {
      if (account.cryptoSource !== 'manual') return write(tx)
      const before = await this.manualLines(tx, account.id)
      const written = await write(tx)
      const after = await this.manualLines(tx, account.id)
      const answers = new Map<string, number>()
      for (const [assetId, line] of after) {
        const was = before.get(assetId) ?? {
          units: 0n,
          invested: 0,
          symbol: line.symbol,
        }
        if (
          line.units > was.units &&
          line.invested !== null &&
          was.invested !== null &&
          line.invested >= was.invested
        ) {
          answers.set(assetId, line.invested - was.invested)
        }
      }
      observed = await this.costBasis.observe(
        tx,
        account.id,
        [...after].map(([assetId, line]) => ({
          assetId,
          symbol: line.symbol,
          quantity: formatQuantity(line.units),
        })),
        now,
        'manual_edit',
        answers,
      )
      return written
    })
    if (observed > 0) await this.costBasis.match()
    return result
  }

  /** A manual account's lines per asset: quantity and typed invested sum. */
  private async manualLines(executor: Executor, accountId: string) {
    const rows = await executor
      .select({
        assetId: h.assetId,
        symbol: h.symbol,
        quantity: h.quantity,
        investedCents: h.investedCents,
      })
      .from(h)
      .where(and(eq(h.accountId, accountId), eq(h.origin, 'manual')))
    const byAsset = new Map<
      string,
      { units: bigint; invested: number | null; symbol: string }
    >()
    for (const row of rows) {
      const known = byAsset.get(row.assetId) ?? {
        units: 0n,
        invested: 0,
        symbol: row.symbol,
      }
      known.units += toUnits(row.quantity)
      known.invested =
        known.invested === null || row.investedCents === null
          ? null
          : known.invested + row.investedCents
      byAsset.set(row.assetId, known)
    }
    return byAsset
  }

  settings(): CryptoSettingsDto {
    return {
      priceApiEnabled: this.prices.enabled,
      walletSyncEnabled: this.walletSync.enabled,
    }
  }

  /** Every non-archived crypto account, valued at the stored prices. */
  summary(now: Date = new Date()): Promise<CryptoSummaryDto> {
    return this.summarize('none', now)
  }

  /**
   * "Actualiser les cours" for every crypto account: one batched price
   * request, then today's live value of each account.
   */
  refreshAll(now: Date = new Date()): Promise<CryptoSummaryDto> {
    return this.summarize('force', now)
  }

  /**
   * The Crypto page (#295): every open crypto account's holdings summed per
   * asset, then the accounts with how fresh they are. From the database
   * only (#381): no price request, no chain read.
   */
  portfolio(now: Date = new Date()): Promise<CryptoPortfolioDto> {
    return this.buildPortfolio('none', now)
  }

  /**
   * The section's one « Actualiser » (#295, `force`): reads every wallet on
   * chain (when this server syncs wallets; each at most every 30 s), then
   * fresh prices for every account and today's live values. `auto` (#381) is
   * the live step the page fires after showing the stored values: the
   * wallets due a sync (waiting `BACKGROUND_SYNC_WAIT_MS` at most, the rest
   * going on in the background, `sync.syncing`) and the prices older than
   * the TTL.
   */
  async refreshPortfolio(
    now: Date = new Date(),
    mode: LiveRefreshMode = 'force',
  ): Promise<CryptoPortfolioDto> {
    if (mode === 'force' && this.walletSync.enabled) {
      const wallets = await this.db
        .select({ id: accountsTable.id })
        .from(accountsTable)
        .where(
          and(
            isNull(accountsTable.archivedAt),
            eq(accountsTable.type, 'crypto'),
            eq(accountsTable.cryptoSource, 'wallet'),
          ),
        )
      for (const wallet of wallets)
        await this.walletSync.syncNow(wallet.id, now)
    }
    return this.buildPortfolio(mode, now)
  }

  private async buildPortfolio(
    mode: RefreshMode,
    now: Date,
  ): Promise<CryptoPortfolioDto> {
    const { accounts, rows } = await this.valueOpenAccounts(mode, now)
    const { assets, totals } = aggregatePortfolio(
      rows.map((row, i) => ({
        accountId: row.accountId,
        name: accounts[i].name,
        lines: row.holdings,
        costs: new Map(row.costs.map((cost) => [cost.assetId, cost])),
        fiatCents: row.totals.fiatCents,
      })),
    )
    const realised = sumRealised(rows.map((row) => row.realised))
    const updated = await this.lastFed(accounts)
    let pricesAt: string | null = null
    for (const row of rows) {
      for (const holding of row.holdings) {
        const at = holding.priceFetchedAt
        if (at !== null && (pricesAt === null || at > pricesAt)) pricesAt = at
      }
    }
    return {
      assets,
      totals: { ...totals, realised },
      accounts: rows.map((row, i) => {
        const account = accounts[i]
        const source = account.cryptoSource
        return {
          accountId: row.accountId,
          name: account.name,
          institution: account.institution,
          source,
          provider: account.cryptoProvider,
          valueCents: row.totals.valueCents,
          holdingCount: row.holdings.length,
          missingPriceCount: row.totals.missingPriceCount,
          updatedAt:
            source === 'wallet'
              ? (row.sync?.syncedAt ?? null)
              : (updated.get(account.id)?.toISOString() ?? null),
          sync: row.sync,
        }
      }),
      priceApiEnabled: this.prices.enabled,
      walletSyncEnabled: this.walletSync.enabled,
      refreshFailed: rows.some((row) => row.refreshFailed),
      pricesAt,
      valued: rows.some((row) => row.snapshot !== null),
      refreshDue: rows.some((row) => row.refreshDue),
    }
  }

  /**
   * When each exchange's last export was committed and each manual
   * account's last line was edited (wallets: their sync, read elsewhere).
   */
  private async lastFed(
    accounts: readonly Pick<SelectAccount, 'id' | 'cryptoSource'>[],
  ): Promise<Map<string, Date>> {
    const result = new Map<string, Date>()
    const exchanges = accounts
      .filter((account) => account.cryptoSource === 'exchange')
      .map((account) => account.id)
    const others = accounts
      .filter((account) => account.cryptoSource !== 'exchange')
      .map((account) => account.id)
    if (exchanges.length > 0) {
      const rows = await this.db
        .select({
          accountId: cryptoImportsTable.accountId,
          at: max(cryptoImportsTable.committedAt),
        })
        .from(cryptoImportsTable)
        .where(inArray(cryptoImportsTable.accountId, exchanges))
        .groupBy(cryptoImportsTable.accountId)
      for (const row of rows) if (row.at) result.set(row.accountId, row.at)
    }
    if (others.length > 0) {
      const rows = await this.db
        .select({ accountId: h.accountId, at: max(h.updatedAt) })
        .from(h)
        .where(and(inArray(h.accountId, others), eq(h.origin, 'manual')))
        .groupBy(h.accountId)
      for (const row of rows) if (row.at) result.set(row.accountId, row.at)
    }
    return result
  }

  private async valueOpenAccounts(mode: RefreshMode, now: Date) {
    const accounts = await this.db
      .select()
      .from(accountsTable)
      .where(
        and(isNull(accountsTable.archivedAt), eq(accountsTable.type, 'crypto')),
      )
      .orderBy(
        asc(accountsTable.position),
        asc(accountsTable.createdAt),
        asc(accountsTable.id),
      )
    const rows = await this.valuate(accounts, mode, now)
    return { accounts, rows }
  }

  private async summarize(
    mode: RefreshMode,
    now: Date,
  ): Promise<CryptoSummaryDto> {
    const { accounts, rows } = await this.valueOpenAccounts(mode, now)

    let invested = 0
    let investedKnown = rows.length > 0
    const totals: HoldingsTotalsDto = {
      valueCents: 0,
      investedCents: null,
      gainCents: null,
      missingPriceCount: 0,
      staleCount: 0,
      withoutInvestedCount: 0,
      unknown: [],
      fiatCents: 0,
    }
    for (const row of rows) {
      totals.valueCents += row.totals.valueCents
      totals.missingPriceCount += row.totals.missingPriceCount
      totals.staleCount += row.totals.staleCount
      totals.withoutInvestedCount += row.totals.withoutInvestedCount
      totals.unknown.push(...row.totals.unknown)
      totals.fiatCents += row.totals.fiatCents
      if (row.totals.investedCents === null) investedKnown = false
      else invested += row.totals.investedCents
    }
    if (investedKnown) {
      totals.investedCents = invested
      if (totals.missingPriceCount === 0) {
        totals.gainCents = totals.valueCents - invested
      }
    }
    return {
      accounts: rows.map((row, i) => ({
        ...row,
        name: accounts[i].name,
        institution: accounts[i].institution,
      })),
      totals,
      priceApiEnabled: this.prices.enabled,
      refreshFailed: rows.some((row) => row.refreshFailed),
    }
  }

  /**
   * A manual price: today's live values use it at once, and the daily close
   * takes it as the day's price when the price API is off or lacks the
   * asset (#366).
   */
  setManualPrice(
    assetId: string,
    priceEur: string,
    now: Date = new Date(),
  ): Promise<CryptoPriceDto> {
    return this.prices.setManualPrice(assetId, priceEur, now)
  }

  /**
   * Values the accounts at the stored prices (refreshed per `mode`): today's
   * live value of each open account whose holdings all have a price, never
   * stored (#366). What each account invested is the replay's (#373): the
   * cost of the coins it holds whose cost is known, carried across the
   * transfers between the owner's accounts, plus the euros waiting on an
   * exchange (in its value too); coins of unknown cost are named and left
   * out of the gain.
   */
  private async valuate(
    accounts: CryptoAccount[],
    mode: RefreshMode,
    now: Date,
  ): Promise<AccountHoldingsDto[]> {
    const ids = accounts.map((account) => account.id)
    // A valuation that refreshes prices first reads the wallets due a sync;
    // one that outlives the wait fetches the prices of what it found.
    if (mode !== 'none') {
      await this.walletSync.syncDue(ids, now, (late) =>
        this.pricesAfterSync(late, now),
      )
    }
    const syncStatuses = await this.walletSync.statuses(ids, now)
    const rows =
      accounts.length === 0
        ? []
        : await this.db
            .select()
            .from(h)
            .where(inArray(h.accountId, ids))
            .orderBy(asc(h.symbol), asc(h.location), asc(h.createdAt))
    const { quotes, refreshFailed } = await this.prices.quotes(
      rows.map((row) => row.assetId),
      mode,
      now,
    )
    const today = parisToday(now)
    const basis = await this.costBasis.load()
    const valued = await this.valuedAccounts(ids)

    const results: AccountHoldingsDto[] = []
    for (const account of accounts) {
      const holdings = rows.filter((row) => row.accountId === account.id)
      const pools = new Map(
        (basis.pools.get(account.id) ?? []).map((pool) => [pool.assetId, pool]),
      )
      // Lines read from an export or a chain take their share of their
      // asset's cost; a line typed by hand keeps its own.
      const lineCosts = allocateCosts(holdings, pools)
      const lines = holdings.map((row) =>
        row.origin === 'manual'
          ? row
          : { ...row, investedCents: lineCosts.get(row.id) ?? null },
      )
      const valuation = valuateHoldings(lines, quotes, now, this.prices.ttlMs)
      const step = cryptoInvestedNow(basis, account.id, now)
      const fiatCents = step?.fiatCents ?? 0
      const costs = assetCosts(lines, valuation.holdings, pools)
      const unknown = costs
        .filter((cost) => toUnits(cost.unknownQuantity) > 0n)
        .map(({ assetId, symbol, unknownQuantity }) => ({
          assetId,
          symbol,
          quantity: unknownQuantity,
        }))
      const known = costs.filter(hasKnownCost)
      const investedCents =
        known.length === 0 && fiatCents === 0
          ? null
          : known.reduce((sum, cost) => sum + cost.costCents, 0) + fiatCents
      const totals: HoldingsTotalsDto = {
        valueCents: valuation.totals.valueCents + fiatCents,
        investedCents,
        gainCents:
          investedCents === null || !valuation.complete
            ? null
            : known.reduce((sum, cost) => sum + (cost.gainCents ?? 0), 0),
        missingPriceCount: valuation.totals.missingPriceCount,
        staleCount: valuation.totals.staleCount,
        withoutInvestedCount: unknown.length,
        unknown,
        fiatCents,
      }
      // A first value of 0 € (lines at 0, nothing synced yet) is no value:
      // the account stays "not valued yet" until it holds some (#207).
      const snapshot: ValuationSnapshotDto | null =
        account.archivedAt === null &&
        (holdings.length > 0 || fiatCents > 0) &&
        valuation.complete &&
        (totals.valueCents !== 0 || valued.has(account.id))
          ? {
              date: today,
              valueCents: totals.valueCents,
              contributionsCents: totals.investedCents,
            }
          : null
      results.push({
        accountId: account.id,
        holdings: lines.map((row, i) => {
          const value = valuation.holdings[i]
          return {
            ...toHoldingDto(row),
            priceEur: value.quote?.priceEur ?? null,
            priceSource: value.quote?.source ?? null,
            priceFetchedAt: value.quote?.fetchedAt.toISOString() ?? null,
            priceChange24hPercent: value.quote?.change24hPercent ?? null,
            priceStale: value.priceStale,
            valueCents: value.valueCents,
            gainCents: value.gainCents,
          }
        }),
        totals,
        complete: valuation.complete,
        snapshot,
        priceApiEnabled: this.prices.enabled,
        refreshFailed,
        sync: syncStatusDto(syncStatuses.get(account.id)),
        // What a live refresh would do now (#381), known without asking.
        refreshDue:
          account.archivedAt === null &&
          ((account.cryptoSource === 'wallet' &&
            this.walletSync.syncDueFor(account.id, now)) ||
            this.prices.refreshDue(
              holdings.map((row) => row.assetId),
              quotes,
              now,
            )),
        costs,
        realised: realisedGains(basis, account.id, today),
      })
    }
    return results
  }

  /** Prices of the assets a background sync found (the next load shows them). */
  private async pricesAfterSync(
    accountIds: string[],
    now: Date,
  ): Promise<void> {
    if (accountIds.length === 0) return
    const rows = await this.db
      .selectDistinct({ assetId: h.assetId })
      .from(h)
      .where(inArray(h.accountId, accountIds))
    await this.prices.quotes(
      rows.map((row) => row.assetId),
      'auto',
      now,
    )
  }

  /** The accounts among `ids` that already have a stored value. */
  private async valuedAccounts(ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await this.db
      .selectDistinct({ accountId: s.accountId })
      .from(s)
      .where(inArray(s.accountId, [...ids]))
    return new Set(rows.map((row) => row.accountId))
  }

  private values(dto: SaveHoldingDto) {
    return {
      assetId: dto.assetId,
      symbol: dto.symbol.trim().toUpperCase(),
      name: dto.name,
      quantity: dto.quantity,
      location: dto.location ?? '',
      investedCents: dto.investedCents ?? null,
      note: dto.note ?? null,
    }
  }

  /**
   * Only lines typed by hand can be changed by hand: imported or synced lines
   * are replaced by the next import or sync.
   */
  private async manualHolding(accountId: string, holdingId: string) {
    const [row] = await this.db
      .select({ origin: h.origin })
      .from(h)
      .where(and(eq(h.id, holdingId), eq(h.accountId, accountId)))
      .limit(1)
    if (!row) throw new NotFoundException('Holding not found')
    if (row.origin !== 'manual') {
      throw new BadRequestException('Imported or synced holdings are read-only')
    }
  }

  private async unique<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write()
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'This asset is already held at this location in the account',
        )
      }
      throw error
    }
  }

  private async cryptoAccount(accountId: string): Promise<AccountWithBalance> {
    const account = await this.accounts.findOne(accountId, this.db)
    if (account.type !== 'crypto') {
      throw new BadRequestException(
        'Holdings are only tracked on crypto accounts',
      )
    }
    return account
  }

  private async writableCryptoAccount(
    accountId: string,
  ): Promise<AccountWithBalance> {
    const account = await this.cryptoAccount(accountId)
    if (account.archivedAt) {
      throw new BadRequestException('Cannot change an archived account')
    }
    return account
  }
}

/** Whether some of an asset's coins have a known cost. */
export function hasKnownCost(
  cost: Pick<AssetCostDto, 'costCents' | 'quantity' | 'unknownQuantity'>,
): boolean {
  return (
    cost.costCents > 0 || toUnits(cost.unknownQuantity) < toUnits(cost.quantity)
  )
}

type PoolOf = ReadonlyMap<
  string,
  { costCents: number; unknownQuantity: string }
>

/**
 * Each line read from an export or a chain gets its asset's cost in
 * proportion to its quantity (the last one the remainder), when no coin of
 * the asset is of unknown cost; null otherwise. Lines typed by hand are left
 * out.
 */
function allocateCosts(
  holdings: readonly SelectCryptoHolding[],
  pools: PoolOf,
): Map<string, number | null> {
  const result = new Map<string, number | null>()
  const byAsset = new Map<string, SelectCryptoHolding[]>()
  for (const row of holdings) {
    if (row.origin === 'manual') continue
    byAsset.set(row.assetId, [...(byAsset.get(row.assetId) ?? []), row])
  }
  for (const [assetId, rows] of byAsset) {
    const pool = pools.get(assetId)
    if (!pool || toUnits(pool.unknownQuantity) > 0n) {
      for (const row of rows) result.set(row.id, null)
      continue
    }
    const units = rows.map((row) => toUnits(row.quantity))
    const total = units.reduce((sum, u) => sum + u, 0n)
    let left = BigInt(pool.costCents)
    rows.forEach((row, i) => {
      const share =
        i === rows.length - 1 || total === 0n
          ? left
          : divideHalfEven(BigInt(pool.costCents) * units[i], total)
      left -= share
      result.set(row.id, Number(share))
    })
  }
  return result
}

/**
 * The cost of each asset an account holds (#373, « Prix de revient »): the
 * replay's when it has one, else its lines' typed invested amounts, its
 * coins of unknown cost when a line has none. Largest value first.
 */
function assetCosts(
  lines: readonly SelectCryptoHolding[],
  values: readonly { valueCents: number | null }[],
  pools: PoolOf,
): AssetCostDto[] {
  const byAsset = new Map<
    string,
    { symbol: string; rows: SelectCryptoHolding[]; values: (number | null)[] }
  >()
  lines.forEach((row, i) => {
    const entry = byAsset.get(row.assetId) ?? {
      symbol: row.symbol,
      rows: [],
      values: [],
    }
    entry.rows.push(row)
    entry.values.push(values[i].valueCents)
    byAsset.set(row.assetId, entry)
  })
  const costs: AssetCostDto[] = []
  for (const [assetId, entry] of byAsset) {
    const quantity = sumDecimals(
      entry.rows.map((row) => formatDecimal(parseDecimal(row.quantity)!)),
    )
    const valueCents = entry.values.some((value) => value === null)
      ? null
      : entry.values.reduce<number>((sum, value) => sum + value!, 0)
    const pool = pools.get(assetId)
    let costCents: number
    let unknownQuantity: string
    if (pool) {
      costCents = pool.costCents
      const unknown = toUnits(pool.unknownQuantity)
      const held = toUnits(quantity)
      unknownQuantity = formatQuantity(unknown > held ? held : unknown)
    } else if (entry.rows.every((row) => row.investedCents !== null)) {
      costCents = entry.rows.reduce((sum, row) => sum + row.investedCents!, 0)
      unknownQuantity = '0'
    } else {
      costCents = 0
      unknownQuantity = quantity
    }
    const known = hasKnownCost({ costCents, quantity, unknownQuantity })
    costs.push({
      assetId,
      symbol: entry.symbol,
      quantity,
      costCents,
      unknownQuantity,
      valueCents,
      gainCents:
        valueCents === null || !known
          ? null
          : knownValue(valueCents, quantity, unknownQuantity) - costCents,
    })
  }
  return costs.sort(
    (a, b) =>
      (b.valueCents ?? -1) - (a.valueCents ?? -1) ||
      a.symbol.localeCompare(b.symbol),
  )
}

/** The account's realised gains (#373): this year (Europe/Paris) and in all. */
export function realisedGains(
  basis: Pick<LoadedCostBasis, 'gains'>,
  accountId: string | null,
  today: string,
): RealisedGainsDto {
  const year = today.slice(0, 4)
  const result: RealisedGainsDto = {
    yearCents: 0,
    totalCents: 0,
    count: 0,
    unknownCount: 0,
  }
  for (const gain of basis.gains) {
    if (accountId !== null && gain.accountId !== accountId) continue
    result.count++
    if (gain.gainCents === null) {
      result.unknownCount++
      continue
    }
    result.totalCents += gain.gainCents
    if (parisToday(new Date(gain.at)).startsWith(year)) {
      result.yearCents += gain.gainCents
    }
  }
  return result
}

function sumRealised(list: readonly RealisedGainsDto[]): RealisedGainsDto {
  return list.reduce(
    (sum, gains) => ({
      yearCents: sum.yearCents + gains.yearCents,
      totalCents: sum.totalCents + gains.totalCents,
      count: sum.count + gains.count,
      unknownCount: sum.unknownCount + gains.unknownCount,
    }),
    { yearCents: 0, totalCents: 0, count: 0, unknownCount: 0 },
  )
}
