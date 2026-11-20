import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, inArray, isNull, max, ne } from 'drizzle-orm'
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
import { loadReceivedCoinFlows } from '#/investments/crypto-flows'
import { parisToday } from '#/investments/days'
import { investedAt, investedBaseOf } from '#/investments/performance'
import { CryptoPricesService, type RefreshMode } from './crypto-prices.service'
import { formatDecimal, parseDecimal } from './decimal'
import type {
  AccountHoldingsDto,
  CryptoPortfolioDto,
  CryptoPriceDto,
  CryptoSettingsDto,
  CryptoSummaryDto,
  HoldingDto,
  HoldingsTotalsDto,
  SaveHoldingDto,
  ValuationSnapshotDto,
  WalletSyncStatusDto,
} from './dto/crypto.dto'
import { aggregatePortfolio } from './portfolio'
import { valuateHoldings } from './valuation'
import {
  type WalletSyncStatus,
  WalletSyncService,
} from './wallet-sync/wallet-sync.service'

const h = cryptoHoldingsTable
const s = balanceSnapshotsTable

type CryptoAccount = Pick<
  SelectAccount,
  'id' | 'name' | 'institution' | 'archivedAt'
>

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
 * path. Prices are refreshed when an account is read and its last
 * valuation is older than the price TTL, and on demand.
 */
@Injectable()
export class CryptoService {
  /** Last price refresh per account (epoch ms), for the automatic one. */
  private readonly valuedAt = new Map<string, number>()

  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsService,
    private readonly prices: CryptoPricesService,
    private readonly walletSync: WalletSyncService,
  ) {}

  private get db() {
    return this.database.db
  }

  async holdings(
    accountId: string,
    now: Date = new Date(),
  ): Promise<AccountHoldingsDto> {
    const account = await this.cryptoAccount(accountId)
    const due =
      account.archivedAt === null && this.valuationDue(account.id, now)
    const [result] = await this.valuate([account], due ? 'auto' : 'none', now)
    return result
  }

  /**
   * Today's live value of a crypto account (#366) at the stored prices, for
   * the last point of its « Évolution »: null while a holding has no price,
   * or while it holds nothing worth anything and was never valued.
   */
  async liveValue(
    accountId: string,
    now: Date = new Date(),
  ): Promise<ValuationSnapshotDto | null> {
    const account = await this.cryptoAccount(accountId)
    if (account.archivedAt !== null) return null
    const [result] = await this.valuate([account], 'none', now)
    return result.snapshot
  }

  /** "Actualiser les cours": fresh prices, then today's live value. */
  async refresh(
    accountId: string,
    now: Date = new Date(),
  ): Promise<AccountHoldingsDto> {
    const account = await this.writableCryptoAccount(accountId)
    const [result] = await this.valuate([account], 'force', now)
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
    const row = await this.unique(async () => {
      const [created] = await this.db
        .insert(h)
        .values({ accountId, ...this.values(dto), origin: 'manual' })
        .returning()
      return created
    })
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
    const row = await this.unique(async () => {
      const [updated] = await this.db
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
    })
    if (!row) throw new NotFoundException('Holding not found')
    await this.valuate([account], 'auto', now)
    return toHoldingDto(row)
  }

  async remove(accountId: string, holdingId: string): Promise<void> {
    await this.writableCryptoAccount(accountId)
    await this.manualHolding(accountId, holdingId)
    const deleted = await this.db
      .delete(h)
      .where(
        and(
          eq(h.id, holdingId),
          eq(h.accountId, accountId),
          eq(h.origin, 'manual'),
        ),
      )
      .returning({ id: h.id })
    if (deleted.length === 0) throw new NotFoundException('Holding not found')
  }

  settings(): CryptoSettingsDto {
    return {
      priceApiEnabled: this.prices.enabled,
      walletSyncEnabled: this.walletSync.enabled,
    }
  }

  /** Every non-archived crypto account, valued with one batched price fetch. */
  summary(now: Date = new Date()): Promise<CryptoSummaryDto> {
    return this.summarize(false, now)
  }

  /**
   * "Actualiser les cours" for every crypto account: one batched price
   * request, then today's live value of each account.
   */
  refreshAll(now: Date = new Date()): Promise<CryptoSummaryDto> {
    return this.summarize(true, now)
  }

  /**
   * The Crypto page (#295): every open crypto account's holdings summed per
   * asset, then the accounts with how fresh they are. Valued like `summary`.
   */
  portfolio(now: Date = new Date()): Promise<CryptoPortfolioDto> {
    return this.buildPortfolio(false, now)
  }

  /**
   * The section's one « Actualiser » (#295): reads every wallet on chain
   * (when this server syncs wallets; each at most every 30 s), then fresh
   * prices for every account and today's live values.
   */
  async refreshPortfolio(now: Date = new Date()): Promise<CryptoPortfolioDto> {
    if (this.walletSync.enabled) {
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
    return this.buildPortfolio(true, now)
  }

  private async buildPortfolio(
    force: boolean,
    now: Date,
  ): Promise<CryptoPortfolioDto> {
    const { accounts, rows } = await this.valueOpenAccounts(force, now)
    const invested = await this.accountInvested(
      accounts.map((account) => account.id),
      parisToday(now),
    )
    const { assets, totals } = aggregatePortfolio(
      rows.map((row, i) => ({
        accountId: row.accountId,
        name: accounts[i].name,
        lines: row.holdings,
        investedCents: invested.get(row.accountId) ?? null,
      })),
    )
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
      totals,
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

  private async valueOpenAccounts(force: boolean, now: Date) {
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
    const due =
      force || accounts.some((account) => this.valuationDue(account.id, now))
    const mode: RefreshMode = force ? 'force' : due ? 'auto' : 'none'
    const rows = await this.valuate(accounts, mode, now)
    return { accounts, rows }
  }

  private async summarize(
    force: boolean,
    now: Date,
  ): Promise<CryptoSummaryDto> {
    const { accounts, rows } = await this.valueOpenAccounts(force, now)

    let invested = 0
    let investedKnown = rows.length > 0
    const totals: HoldingsTotalsDto = {
      valueCents: 0,
      investedCents: null,
      gainCents: null,
      missingPriceCount: 0,
      staleCount: 0,
      withoutInvestedCount: 0,
    }
    for (const row of rows) {
      totals.valueCents += row.totals.valueCents
      totals.missingPriceCount += row.totals.missingPriceCount
      totals.staleCount += row.totals.staleCount
      totals.withoutInvestedCount += row.totals.withoutInvestedCount
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
   * stored (#366). Contributions are the sum of the invested amounts when
   * every holding has one, and unknown (null) otherwise.
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
      for (const id of ids) this.valuedAt.set(id, now.getTime())
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
    const accountInvested = await this.accountInvested(ids, today)
    const valued = await this.valuedAccounts(ids)

    const results: AccountHoldingsDto[] = []
    for (const account of accounts) {
      const holdings = rows.filter((row) => row.accountId === account.id)
      const valuation = valuateHoldings(
        holdings,
        quotes,
        now,
        this.prices.ttlMs,
      )
      // An account whose cost is known as a whole (#358) shows it rather
      // than its lines' invested amounts.
      const invested = accountInvested.get(account.id)
      const totals =
        invested === undefined
          ? valuation.totals
          : {
              ...valuation.totals,
              investedCents: invested,
              gainCents: valuation.complete
                ? valuation.totals.valueCents - invested
                : null,
              withoutInvestedCount: 0,
            }
      // A first value of 0 € (lines at 0, nothing synced yet) is no value:
      // the account stays "not valued yet" until it holds some (#207).
      const snapshot: ValuationSnapshotDto | null =
        account.archivedAt === null &&
        holdings.length > 0 &&
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
        holdings: holdings.map((row, i) => {
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
      })
    }
    return results
  }

  /**
   * What the wallet and manual accounts among `ids` had invested by `today`
   * (#358): their invested base plus the cost of the coins linked to them
   * since, or the coins linked to them without a base. Their totals and
   * snapshots show it; missing, the holdings' invested amounts count
   * (exchanges, accounts with neither).
   */
  private async accountInvested(
    ids: readonly string[],
    today: string,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>()
    if (ids.length === 0) return result
    const accounts = await this.db
      .select({
        id: accountsTable.id,
        investedBaseCents: accountsTable.investedBaseCents,
        investedBaseOn: accountsTable.investedBaseOn,
      })
      .from(accountsTable)
      .where(
        and(
          inArray(accountsTable.id, [...ids]),
          ne(accountsTable.cryptoSource, 'exchange'),
        ),
      )
    const flows = await loadReceivedCoinFlows(
      this.db,
      accounts.map((account) => account.id),
    )
    for (const account of accounts) {
      const invested = investedAt(
        investedBaseOf(account),
        flows.get(account.id) ?? [],
        today,
      )
      if (invested) result.set(account.id, invested.investedCents)
    }
    return result
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

  private valuationDue(accountId: string, now: Date): boolean {
    const last = this.valuedAt.get(accountId)
    return last === undefined || now.getTime() - last > this.prices.ttlMs
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
