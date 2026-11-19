import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  NotFoundException,
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
 * Valuing an account upserts its balance snapshot for today (Europe/Paris), so
 * account balances, performance and the dashboard net worth pick the value up
 * through the usual snapshot path. An account is valued again automatically
 * when it is read and its last valuation is older than the price TTL, after
 * every change to its holdings, and on demand.
 */
@Injectable()
export class CryptoService {
  /** Last valuation per account (epoch ms), for the automatic one. */
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
    const [result] = await this.valuate(
      [account],
      due ? 'auto' : 'none',
      due,
      now,
    )
    return result
  }

  /** "Actualiser les cours": fresh prices, then today's snapshot. */
  async refresh(
    accountId: string,
    now: Date = new Date(),
  ): Promise<AccountHoldingsDto> {
    const account = await this.writableCryptoAccount(accountId)
    const [result] = await this.valuate([account], 'force', true, now)
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
    const [result] = await this.valuate([account], 'force', true, now)
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
    await this.valuate([account], 'auto', true, now)
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
    await this.valuate([account], 'auto', true, now)
    return toHoldingDto(row)
  }

  async remove(
    accountId: string,
    holdingId: string,
    now: Date = new Date(),
  ): Promise<void> {
    const account = await this.writableCryptoAccount(accountId)
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
    await this.valuate([account], 'none', true, now)
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
   * request, then today's snapshot of each account.
   */
  refreshAll(now: Date = new Date()): Promise<CryptoSummaryDto> {
    return this.summarize(true, now)
  }

  /** The open crypto accounts, valued with one batched price fetch. */
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
   * prices for every account and today's values.
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
    const { assets, totals } = aggregatePortfolio(
      rows.map((row, i) => ({
        accountId: row.accountId,
        name: accounts[i].name,
        lines: row.holdings,
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
    const rows = await this.valuate(accounts, mode, due, now)
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

  /** Manual price, then the accounts holding the asset are valued again. */
  async setManualPrice(
    assetId: string,
    priceEur: string,
    now: Date = new Date(),
  ): Promise<CryptoPriceDto> {
    const price = await this.prices.setManualPrice(assetId, priceEur, now)
    const holders = await this.db
      .selectDistinct({
        id: accountsTable.id,
        name: accountsTable.name,
        institution: accountsTable.institution,
        archivedAt: accountsTable.archivedAt,
      })
      .from(h)
      .innerJoin(accountsTable, eq(accountsTable.id, h.accountId))
      .where(and(eq(h.assetId, assetId), isNull(accountsTable.archivedAt)))
    if (holders.length > 0) await this.valuate(holders, 'none', true, now)
    return price
  }

  /**
   * Values the accounts at the stored prices (refreshed per `mode`) and, when
   * `write`, upserts today's snapshot of each writable account whose holdings
   * all have a price. Contributions are the sum of the invested amounts when
   * every holding has one, and unknown (null) otherwise.
   */
  private async valuate(
    accounts: CryptoAccount[],
    mode: RefreshMode,
    write: boolean,
    now: Date,
  ): Promise<AccountHoldingsDto[]> {
    const ids = accounts.map((account) => account.id)
    // A valuation that refreshes prices first reads the wallets due a sync;
    // one that outlives the wait is valued again once done.
    if (mode !== 'none') {
      await this.walletSync.syncDue(ids, now, (late) =>
        this.valueAfterSync(late, now),
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

    const results: AccountHoldingsDto[] = []
    for (const account of accounts) {
      const holdings = rows.filter((row) => row.accountId === account.id)
      const valuation = valuateHoldings(
        holdings,
        quotes,
        now,
        this.prices.ttlMs,
      )
      let snapshot: ValuationSnapshotDto | null = null
      if (write && account.archivedAt === null) {
        this.valuedAt.set(account.id, now.getTime())
        // A first value of 0 € (lines at 0, nothing synced yet) records
        // nothing: the account stays "not valued yet" until it holds some.
        const firstZero = async () =>
          valuation.totals.valueCents === 0 &&
          !(await this.hasSnapshot(account.id))
        if (holdings.length > 0 && valuation.complete && !(await firstZero())) {
          snapshot = await this.writeSnapshot(
            account.id,
            today,
            valuation.totals.valueCents,
            valuation.totals.investedCents,
            now,
          )
        }
      }
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
        totals: valuation.totals,
        complete: valuation.complete,
        snapshot,
        priceApiEnabled: this.prices.enabled,
        refreshFailed,
        sync: syncStatusDto(syncStatuses.get(account.id)),
      })
    }
    return results
  }

  /** Values wallets whose background sync ended after their valuation. */
  private async valueAfterSync(accountIds: string[], now: Date): Promise<void> {
    for (const id of accountIds) {
      const account = await this.cryptoAccount(id)
      // `auto`: prices of assets the sync just found are fetched too (the
      // wallet itself was just tried, so it is not synced again).
      if (account.archivedAt === null) {
        await this.valuate([account], 'auto', true, now)
      }
    }
  }

  private async hasSnapshot(accountId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: s.id })
      .from(s)
      .where(eq(s.accountId, accountId))
      .limit(1)
    return row !== undefined
  }

  private async writeSnapshot(
    accountId: string,
    date: string,
    valueCents: number,
    investedCents: number | null,
    now: Date,
  ): Promise<ValuationSnapshotDto> {
    const [row] = await this.db
      .insert(s)
      .values({
        accountId,
        date,
        valueCents,
        contributionsCents: investedCents,
      })
      .onConflictDoUpdate({
        target: [s.accountId, s.date],
        set: {
          valueCents,
          // Unknown when a holding has no invested amount: an older total
          // would leave out the assets added since.
          contributionsCents: investedCents,
          updatedAt: now,
        },
      })
      .returning({
        date: s.date,
        valueCents: s.valueCents,
        contributionsCents: s.contributionsCents,
      })
    return row
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
