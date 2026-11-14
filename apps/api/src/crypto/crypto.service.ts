import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import {
  AccountsService,
  type AccountWithBalance,
} from '#/accounts/accounts.service'
import { DatabaseService } from '#/database/database.service'
import {
  accountsTable,
  balanceSnapshotsTable,
  cryptoHoldingsTable,
  type SelectAccount,
  type SelectCryptoHolding,
} from '#/database/schema'
import { parisToday } from '#/investments/days'
import { CryptoPricesService, type RefreshMode } from './crypto-prices.service'
import { formatDecimal, parseDecimal } from './decimal'
import type {
  AccountHoldingsDto,
  CryptoPriceDto,
  CryptoSummaryDto,
  HoldingDto,
  HoldingsTotalsDto,
  SaveHoldingDto,
  ValuationSnapshotDto,
} from './dto/crypto.dto'
import { valuateHoldings } from './valuation'

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

  async create(
    accountId: string,
    dto: SaveHoldingDto,
    now: Date = new Date(),
  ): Promise<HoldingDto> {
    const account = await this.writableCryptoAccount(accountId)
    const row = await this.unique(async () => {
      const [created] = await this.db
        .insert(h)
        .values({ accountId, ...this.values(dto) })
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
    const row = await this.unique(async () => {
      const [updated] = await this.db
        .update(h)
        .set({ ...this.values(dto), updatedAt: now })
        .where(and(eq(h.id, holdingId), eq(h.accountId, accountId)))
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
    const deleted = await this.db
      .delete(h)
      .where(and(eq(h.id, holdingId), eq(h.accountId, accountId)))
      .returning({ id: h.id })
    if (deleted.length === 0) throw new NotFoundException('Holding not found')
    await this.valuate([account], 'none', true, now)
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

  private async summarize(
    force: boolean,
    now: Date,
  ): Promise<CryptoSummaryDto> {
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
    const rows =
      accounts.length === 0
        ? []
        : await this.db
            .select()
            .from(h)
            .where(
              inArray(
                h.accountId,
                accounts.map((account) => account.id),
              ),
            )
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
        if (holdings.length > 0 && valuation.complete) {
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
      })
    }
    return results
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
