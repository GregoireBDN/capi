import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, inArray, isNull, lt, notInArray, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { createHash } from 'node:crypto'
import { AccountsService } from '#/accounts/accounts.service'
import { CryptoPricesService } from '#/crypto/crypto-prices.service'
import { CryptoService } from '#/crypto/crypto.service'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  accountsTable,
  cryptoAssetAliasesTable,
  cryptoHoldingsTable,
  cryptoImportsTable,
  cryptoMovementsTable,
  type SelectCryptoImport,
} from '#/database/schema'
import type { CryptoImportFormat } from '#/database/schema/domain-enums'
import { FIAT_TICKERS, knownAsset } from './assets'
import {
  type AssetMapping,
  CRYPTO_PREVIEW_VERSION,
  type CryptoImportPreviewData,
  type CryptoPreviewRow,
  type UnknownOperation,
} from './crypto-import.types'
import { computeMovementHashes } from './dedupe'
import type {
  CommitCryptoImportDto,
  CryptoImportDto,
  DeleteCryptoImportResultDto,
} from './dto/crypto-import.dto'
import { computeHoldings, type HoldingMovement } from './holdings'
import {
  parseCryptoExport,
  UnsupportedCryptoExportError,
} from './parsers/detect'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

const m = cryptoMovementsTable
const ci = cryptoImportsTable
const aliases = cryptoAssetAliasesTable
const h = cryptoHoldingsTable

/** Pending previews older than this are discarded when the next one is made. */
export const PENDING_CRYPTO_PREVIEW_TTL_MS = 24 * 60 * 60 * 1000
/** Unknown tickers looked up with the asset search per preview, at most. */
export const MAX_ASSET_SEARCHES = 10
const CHUNK_SIZE = 500
const FILE_NAME_MAX = 255

/** Which formats each exchange account accepts. */
const FORMATS_BY_PROVIDER: Record<string, readonly CryptoImportFormat[]> = {
  binance: ['binance_csv'],
  coinbase: ['coinbase_csv'],
  other: ['binance_csv', 'coinbase_csv'],
}
const FORMAT_LABELS: Record<CryptoImportFormat, string> = {
  binance_csv: 'Binance',
  coinbase_csv: 'Coinbase',
}

export interface CryptoPreviewInput {
  accountId: string
  fileName: string
  buffer: Buffer
}

/**
 * Exchange exports (#128): upload → preview (nothing written but the pending
 * import) → commit (movements written, the account's imported holdings
 * recomputed, then valued) → optional undo.
 *
 * Holdings with origin `import` are replaced by every commit or undo; lines
 * typed by hand (`manual`) or synced are never touched. Never logs
 * quantities, values, labels or anything from the file.
 */
@Injectable()
export class CryptoImportsService {
  private readonly logger = new Logger(CryptoImportsService.name)

  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsService,
    private readonly prices: CryptoPricesService,
    private readonly crypto: CryptoService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  async preview(
    input: CryptoPreviewInput,
    now: Date = new Date(),
  ): Promise<CryptoImportDto> {
    const account = await this.exchangeAccount(input.accountId)
    let parsed
    try {
      parsed = parseCryptoExport(input.buffer)
    } catch (error) {
      if (error instanceof UnsupportedCryptoExportError) {
        throw new BadRequestException(
          'Not a Binance or Coinbase transactions export',
        )
      }
      throw error
    }
    const accepted = FORMATS_BY_PROVIDER[account.cryptoProvider ?? 'other']
    if (!accepted.includes(parsed.format)) {
      throw new BadRequestException(
        `This is a ${FORMAT_LABELS[parsed.format]} export; the account is not`,
      )
    }

    const hashes = computeMovementHashes(parsed.format, parsed.movements)
    const stored = await this.storedHashes(account.id, hashes)
    const rows: CryptoPreviewRow[] = parsed.movements.map((movement, i) => ({
      ...movement,
      index: i,
      dedupeHash: hashes[i],
      status: stored.has(hashes[i]) ? 'duplicate' : 'new',
    }))

    const existing = await this.loadMovements(this.db, account.id)
    const tickers = new Set(
      [...rows, ...existing]
        .map((row) => row.asset)
        .filter((ticker) => !FIAT_TICKERS.has(ticker)),
    )
    const mappings = await this.resolveTickers([...tickers])
    const resolver = resolverOf(mappings)
    const holdings = computeHoldings(
      [...existing, ...rows.filter((row) => row.status === 'new')],
      resolver,
    )
    const preview: CryptoImportPreviewData = {
      version: CRYPTO_PREVIEW_VERSION,
      issues: parsed.issues,
      rows,
      mappings: [...mappings.values()],
      unmappedTickers: [...tickers].filter((t) => !mappings.has(t)).sort(),
      unknownOperations: unknownOperations(rows),
      holdings,
    }
    const times = rows.map((row) => row.occurredAt).sort()
    const newCount = rows.filter((row) => row.status === 'new').length

    const created = await this.db.transaction(async (tx) => {
      await tx
        .delete(ci)
        .where(
          and(
            isNull(ci.committedAt),
            lt(ci.createdAt, new Date(now.getTime() - PENDING_CRYPTO_PREVIEW_TTL_MS)),
          ),
        )
      const [row] = await tx
        .insert(ci)
        .values({
          accountId: account.id,
          format: parsed.format,
          fileName: cleanFileName(input.fileName),
          fileHash: createHash('sha256').update(input.buffer).digest('hex'),
          periodStart: times.length > 0 ? new Date(times[0]) : null,
          periodEnd: times.length > 0 ? new Date(times.at(-1)!) : null,
          rowCount: rows.length,
          newCount,
          duplicateCount: rows.length - newCount,
          issueCount: parsed.issues.length,
          preview,
        })
        .returning()
      return row
    })
    return toDto(created)
  }

  async findOne(id: string): Promise<CryptoImportDto> {
    const [record] = await this.db.select().from(ci).where(eq(ci.id, id))
    if (!record) throw new NotFoundException('Import not found')
    return toDto(record)
  }

  /**
   * Writes the new movements in one database transaction (movements stored
   * by another import since the preview count as duplicates), saves the
   * price ids found or chosen for unknown tickers, recomputes the account's
   * imported holdings, then values the account.
   */
  async commit(
    id: string,
    dto: CommitCryptoImportDto,
    now: Date = new Date(),
  ): Promise<CryptoImportDto> {
    const record = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(ci)
        .where(eq(ci.id, id))
        .for('update')
      if (!current) throw new NotFoundException('Import not found')
      if (current.committedAt) {
        throw new ConflictException('This import was already committed')
      }
      const preview = current.preview
      if (preview.version !== CRYPTO_PREVIEW_VERSION) {
        throw new ConflictException(
          'This preview is outdated: upload the file again',
        )
      }
      await this.exchangeAccount(current.accountId, tx)

      const choices = dto.assets ?? []
      for (const choice of choices) {
        if (!preview.unmappedTickers.includes(choice.ticker)) {
          throw new BadRequestException(
            `Ticker ${choice.ticker} needs no price id`,
          )
        }
      }
      await this.saveAliases(tx, [
        ...preview.mappings.filter((mapping) => !knownAsset(mapping.ticker)),
        ...choices.map((choice) => ({
          ...choice,
          symbol: choice.symbol.trim().toUpperCase(),
        })),
      ])

      const fresh = preview.rows.filter((row) => row.status === 'new')
      let inserted = 0
      for (let i = 0; i < fresh.length; i += CHUNK_SIZE) {
        const written = await tx
          .insert(m)
          .values(
            fresh.slice(i, i + CHUNK_SIZE).map((row) => ({
              accountId: current.accountId,
              importId: current.id,
              occurredAt: new Date(row.occurredAt),
              wallet: row.wallet,
              operation: row.operation,
              kind: row.kind,
              asset: row.asset,
              quantity: row.quantity,
              eurCents: row.eurCents,
              sourceRef: row.sourceRef,
              dedupeHash: row.dedupeHash,
            })),
          )
          .onConflictDoNothing({ target: [m.accountId, m.dedupeHash] })
          .returning({ id: m.id })
        inserted += written.length
      }

      const { holdings, unmapped } = await this.recomputeHoldings(
        tx,
        current.accountId,
        now,
      )
      await tx
        .update(accountsTable)
        .set({ cryptoSyncedAt: now, updatedAt: now })
        .where(eq(accountsTable.id, current.accountId))
      const [updated] = await tx
        .update(ci)
        .set({
          committedAt: now,
          insertedCount: inserted,
          duplicateCount: current.rowCount - inserted,
          preview: {
            ...preview,
            rows: [],
            holdings,
            unmappedTickers: unmapped,
          },
          updatedAt: now,
        })
        .where(eq(ci.id, id))
        .returning()
      return updated
    })
    await this.valuate(record.accountId, now)
    return toDto(record)
  }

  /**
   * Discards a pending import, or undoes a committed one: its movements are
   * deleted and the imported holdings recomputed.
   */
  async remove(
    id: string,
    now: Date = new Date(),
  ): Promise<DeleteCryptoImportResultDto> {
    const result = await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({
          id: ci.id,
          accountId: ci.accountId,
          committedAt: ci.committedAt,
        })
        .from(ci)
        .where(eq(ci.id, id))
        .for('update')
      if (!current) throw new NotFoundException('Import not found')
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(m)
        .where(eq(m.importId, id))
      await tx.delete(ci).where(eq(ci.id, id))
      if (current.committedAt) {
        await this.recomputeHoldings(tx, current.accountId, now)
      }
      return { accountId: current.accountId, committed: !!current.committedAt, count }
    })
    if (result.committed) await this.valuate(result.accountId, now)
    return { deletedMovements: result.count }
  }

  /**
   * Replaces the account's `import` holdings with the sum of its movements.
   * Negative and unmapped assets get no holding; manual and synced lines are
   * left alone.
   */
  private async recomputeHoldings(tx: Tx, accountId: string, now: Date) {
    const movements = await this.loadMovements(tx, accountId)
    const tickers = [
      ...new Set(movements.map((row) => row.asset)),
    ].filter((ticker) => !FIAT_TICKERS.has(ticker))
    const mappings = await this.knownMappings(tx, tickers)
    const holdings = computeHoldings(movements, resolverOf(mappings))
    const kept = holdings.filter((holding) => holding.status === 'ok')

    await tx
      .delete(h)
      .where(
        and(
          eq(h.accountId, accountId),
          eq(h.origin, 'import'),
          kept.length > 0
            ? notInArray(
                h.assetId,
                kept.map((holding) => holding.assetId!),
              )
            : undefined,
        ),
      )
    for (const holding of kept) {
      await tx
        .insert(h)
        .values({
          accountId,
          assetId: holding.assetId!,
          symbol: holding.symbol,
          name: holding.name ?? holding.symbol,
          quantity: holding.quantity,
          location: '',
          investedCents: holding.investedCents,
          origin: 'import',
        })
        .onConflictDoUpdate({
          target: [h.accountId, h.assetId, h.location, h.origin],
          set: {
            symbol: holding.symbol,
            name: holding.name ?? holding.symbol,
            quantity: holding.quantity,
            investedCents: holding.investedCents,
            updatedAt: now,
          },
        })
    }
    return {
      holdings,
      unmapped: tickers.filter((ticker) => !mappings.has(ticker)).sort(),
    }
  }

  /** Values the account at today's prices; a failure never fails the import. */
  private async valuate(accountId: string, now: Date) {
    try {
      await this.crypto.refresh(accountId, now)
    } catch (error) {
      this.logger.warn(
        `Valuation after an import failed (${(error as Error).name})`,
      )
    }
  }

  private async loadMovements(
    executor: Executor,
    accountId: string,
  ): Promise<HoldingMovement[]> {
    const rows = await executor
      .select({
        occurredAt: m.occurredAt,
        kind: m.kind,
        asset: m.asset,
        quantity: m.quantity,
        eurCents: m.eurCents,
      })
      .from(m)
      .where(eq(m.accountId, accountId))
      .orderBy(asc(m.occurredAt), asc(m.createdAt), asc(m.dedupeHash))
    return rows.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString().replace('.000Z', 'Z'),
    }))
  }

  private async storedHashes(
    accountId: string,
    hashes: string[],
  ): Promise<Set<string>> {
    const stored = new Set<string>()
    for (let i = 0; i < hashes.length; i += CHUNK_SIZE) {
      const rows = await this.db
        .select({ hash: m.dedupeHash })
        .from(m)
        .where(
          and(
            eq(m.accountId, accountId),
            inArray(m.dedupeHash, hashes.slice(i, i + CHUNK_SIZE)),
          ),
        )
      for (const row of rows) stored.add(row.hash)
    }
    return stored
  }

  /** Built-in table, then saved aliases. */
  private async knownMappings(
    executor: Executor,
    tickers: string[],
  ): Promise<Map<string, AssetMapping>> {
    const mappings = new Map<string, AssetMapping>()
    const rest: string[] = []
    for (const ticker of tickers) {
      const known = knownAsset(ticker)
      if (known) mappings.set(ticker, known)
      else rest.push(ticker)
    }
    if (rest.length > 0) {
      const rows = await executor
        .select()
        .from(aliases)
        .where(inArray(aliases.ticker, rest))
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

  /**
   * Built-in table, saved aliases, then the asset search for the remaining
   * tickers (at most `MAX_ASSET_SEARCHES`; only the ticker is sent): the
   * best-ranked asset whose symbol is exactly the ticker.
   */
  private async resolveTickers(
    tickers: string[],
  ): Promise<Map<string, AssetMapping>> {
    const mappings = await this.knownMappings(this.db, tickers)
    const missing = tickers
      .filter((ticker) => !mappings.has(ticker))
      .sort()
      .slice(0, MAX_ASSET_SEARCHES)
    for (const ticker of missing) {
      const results = await this.prices.search(ticker)
      const best = results
        .filter((asset) => asset.symbol.toUpperCase() === ticker)
        .sort(
          (a, b) =>
            (a.rank ?? Number.MAX_SAFE_INTEGER) -
            (b.rank ?? Number.MAX_SAFE_INTEGER),
        )[0]
      if (best) {
        mappings.set(ticker, {
          ticker,
          assetId: best.id,
          symbol: best.symbol.toUpperCase().slice(0, 20),
          name: best.name.slice(0, 100),
        })
      }
    }
    return mappings
  }

  private async saveAliases(tx: Tx, mappings: AssetMapping[]) {
    for (const mapping of mappings) {
      await tx
        .insert(aliases)
        .values(mapping)
        .onConflictDoUpdate({
          target: aliases.ticker,
          set: {
            assetId: mapping.assetId,
            symbol: mapping.symbol,
            name: mapping.name,
            updatedAt: new Date(),
          },
        })
    }
  }

  private async exchangeAccount(accountId: string, executor?: Executor) {
    const account = await this.accounts.findOne(accountId, executor ?? this.db)
    if (account.type !== 'crypto' || account.cryptoSource !== 'exchange') {
      throw new BadRequestException(
        'Exports can only be imported into an exchange crypto account',
      )
    }
    if (account.archivedAt) {
      throw new BadRequestException('Cannot change an archived account')
    }
    return account
  }
}

function resolverOf(mappings: Map<string, AssetMapping>) {
  return (ticker: string) => mappings.get(ticker) ?? null
}

function unknownOperations(rows: CryptoPreviewRow[]): UnknownOperation[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.known) counts.set(row.operation, (counts.get(row.operation) ?? 0) + 1)
  }
  return [...counts]
    .map(([operation, count]) => ({ operation, count }))
    .sort((a, b) => b.count - a.count || a.operation.localeCompare(b.operation))
}

function cleanFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop()?.trim() ?? ''
  return (base === '' ? 'export.csv' : base).slice(0, FILE_NAME_MAX)
}

function toDto(record: SelectCryptoImport): CryptoImportDto {
  const preview = record.preview
  return {
    id: record.id,
    accountId: record.accountId,
    format: record.format,
    fileName: record.fileName,
    status: record.committedAt ? 'committed' : 'pending',
    createdAt: record.createdAt.toISOString(),
    committedAt: record.committedAt?.toISOString() ?? null,
    periodStart: record.periodStart?.toISOString() ?? null,
    periodEnd: record.periodEnd?.toISOString() ?? null,
    counts: {
      rows: record.rowCount,
      new: record.newCount,
      duplicates: record.duplicateCount,
      issues: record.issueCount,
      inserted: record.insertedCount,
    },
    issues: preview.issues,
    unknownOperations: preview.unknownOperations,
    unmappedTickers: preview.unmappedTickers,
    holdings: preview.holdings,
    rows: preview.rows.map((row) => ({
      index: row.index,
      lineNumber: row.lineNumber,
      occurredAt: row.occurredAt,
      wallet: row.wallet,
      operation: row.operation,
      kind: row.kind,
      known: row.known,
      asset: row.asset,
      quantity: row.quantity,
      eurCents: row.eurCents,
      status: row.status,
    })),
  }
}
