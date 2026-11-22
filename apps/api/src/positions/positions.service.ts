import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { AccountsService } from '#/accounts/accounts.service'
import { normalizeDecimal, valueInCents } from '#/common/decimal'
import { DatabaseService } from '#/database/database.service'
import * as schema from '#/database/schema'
import {
  balanceSnapshotsTable,
  POSITION_ACCOUNT_TYPES,
  positionLinesTable,
  positionStatementsTable,
  securitiesTable,
  securityPricesTable,
} from '#/database/schema'
import type {
  AccountType,
  PositionStatementSource,
} from '#/database/schema/domain-enums'
import { parisToday } from '#/investments/days'
import type {
  PositionLineDto,
  PositionsDto,
  PreviewLineDto,
  PutStatementDto,
  SecurityDto,
  SetCashDto,
  StatementLineInputDto,
  StatementPreviewDto,
  UpsertLineDto,
} from './dto/positions.dto'
import {
  accountsHolding,
  type Executor,
  loadPrices,
  loadSecurities,
  loadStatements,
  revalue,
  securityIdsOf,
  type StoredStatement,
} from './positions.repository'
import {
  lineCostCents,
  type PriceSeries,
  priceOn,
  priceReplaces,
  type Statement,
  statementOn,
  valueOn,
} from './valuation'

type Db = PostgresJsDatabase<typeof schema>

export const POSITIONS_ONLY_MESSAGE =
  'Only a PEA or a compte-titres holds security positions'

/** Whether an account of this type holds positions (ADR 0006). */
export function takesPositions(account: { type: AccountType }): boolean {
  return (POSITION_ACCOUNT_TYPES as readonly AccountType[]).includes(
    account.type,
  )
}

/** A line about to be written: its security resolved, decimals canonical. */
interface ResolvedLine {
  securityId: string
  quantity: string
  unitCostEur: string | null
  priceEur: string | null
}

/**
 * A PEA's lines (ADR 0006): dated statements of what it holds, the
 * securities' prices, and the account's value computed from them into
 * `balance_snapshots` in the same transaction as every write. Logs carry
 * counts only, never a quantity, a price, a value or a cost.
 */
@Injectable()
export class PositionsService {
  private readonly logger = new Logger(PositionsService.name)

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  /** The lines as of today, their prices, values and results. */
  async get(accountId: string, now: Date = new Date()): Promise<PositionsDto> {
    const account = await this.accounts.findOne(accountId, this.db)
    if (!takesPositions(account)) {
      throw new BadRequestException(POSITIONS_ONLY_MESSAGE)
    }
    return this.read(this.db, accountId, parisToday(now))
  }

  /** The securities the app knows, by name (names fill the line editor). */
  async securities(): Promise<SecurityDto[]> {
    const rows = await this.db
      .select({
        id: securitiesTable.id,
        isin: securitiesTable.isin,
        name: securitiesTable.name,
        ticker: securitiesTable.ticker,
      })
      .from(securitiesTable)
      .orderBy(asc(securitiesTable.name))
    return rows
  }

  /** What writing this statement would change. Saves nothing. */
  async preview(
    accountId: string,
    asOf: string,
    dto: PutStatementDto,
    now: Date = new Date(),
  ): Promise<StatementPreviewDto> {
    const today = parisToday(now)
    assertNotFuture(asOf, today)
    assertNoDuplicate(dto.lines)
    const account = await this.accounts.findOne(accountId, this.db)
    assertPositionAccount(account)

    const statements =
      (await loadStatements(this.db, [accountId])).get(accountId) ?? []
    const before = statementOn(statements, asOf)
    const isins = dto.lines.map((line) => line.isin)
    const known = await this.securitiesByIsin(this.db, isins)
    const beforeIds = before ? securityIdsOf([before]) : []
    const securities = await loadSecurities(this.db, [
      ...beforeIds,
      ...[...known.values()].map((security) => security.id),
    ])
    const prices = await loadPrices(this.db, [...securities.keys()])

    // The statement as it would be, prices of the day included.
    const after: Statement = {
      asOf,
      cashCents: dto.cashCents,
      lines: dto.lines.flatMap((line) => {
        const security = known.get(line.isin)
        return security
          ? [
              {
                securityId: security.id,
                quantity: normalizeDecimal(line.quantity),
                unitCostEur: decimalOrNull(line.unitCostEur),
              },
            ]
          : []
      }),
    }
    const pricesAfter = new Map(prices)
    const kept = new Set<string>()
    for (const line of dto.lines) {
      const security = known.get(line.isin)
      const price = decimalOrNull(line.priceEur)
      if (!security || price === null) continue
      const series = [...(pricesAfter.get(security.id) ?? [])]
      const existing = series.find((point) => point.day === asOf)
      if (existing && !priceReplaces('statement', existing.source)) {
        kept.add(line.isin)
        continue
      }
      const others = series.filter((point) => point.day !== asOf)
      others.push({ day: asOf, priceEur: price, source: 'statement' })
      others.sort((a, b) => (a.day < b.day ? -1 : 1))
      pricesAfter.set(security.id, others)
    }

    const lines: PreviewLineDto[] = []
    const beforeLines = new Map(
      (before?.lines ?? []).map((line) => [line.securityId, line]),
    )
    for (const input of dto.lines) {
      const security = known.get(input.isin)
      const old = security ? beforeLines.get(security.id) : undefined
      const quantity = normalizeDecimal(input.quantity)
      const unitCost = decimalOrNull(input.unitCostEur)
      const price = security
        ? priceOn(pricesAfter, security.id, asOf)
        : decimalOrNull(input.priceEur) && {
            priceEur: decimalOrNull(input.priceEur)!,
          }
      lines.push({
        isin: input.isin,
        name: input.name ?? security?.name ?? null,
        status: !old
          ? 'new'
          : old.quantity === quantity && old.unitCostEur === unitCost
            ? 'unchanged'
            : 'changed',
        quantityBefore: old?.quantity ?? null,
        quantityAfter: quantity,
        unitCostBefore: old?.unitCostEur ?? null,
        unitCostAfter: unitCost,
        priceEur: price ? price.priceEur : null,
        priceKept: kept.has(input.isin),
      })
    }
    const sent = new Set(
      [...known.values()]
        .filter((security) => isins.includes(security.isin))
        .map((security) => security.id),
    )
    for (const old of before?.lines ?? []) {
      if (sent.has(old.securityId)) continue
      const security = securities.get(old.securityId)
      lines.push({
        isin: security?.isin ?? '',
        name: security?.name ?? null,
        status: 'removed',
        quantityBefore: old.quantity,
        quantityAfter: null,
        unitCostBefore: old.unitCostEur,
        unitCostAfter: null,
        priceEur: null,
        priceKept: false,
      })
    }

    const unknown = dto.lines.filter((line) => !known.has(line.isin))
    // New securities are valued from the price sent with them.
    let valueAfterCents: number | null = null
    const afterValue = valueOn([after], pricesAfter, asOf)
    if (afterValue?.valueCents != null) {
      let cents = BigInt(afterValue.valueCents)
      let complete = true
      for (const line of unknown) {
        const price = decimalOrNull(line.priceEur)
        if (price === null) complete = false
        else cents += valueInCents(normalizeDecimal(line.quantity), price)
      }
      valueAfterCents = complete ? Number(cents) : null
    }

    const [stored] = await this.db
      .select({
        valueCents: balanceSnapshotsTable.valueCents,
        source: balanceSnapshotsTable.source,
      })
      .from(balanceSnapshotsTable)
      .where(
        and(
          eq(balanceSnapshotsTable.accountId, accountId),
          eq(balanceSnapshotsTable.date, asOf),
        ),
      )
    const sameDay = before?.asOf === asOf
    const pricesUnchanged = dto.lines.every((line) => {
      const security = known.get(line.isin)
      const price = decimalOrNull(line.priceEur)
      if (price === null) return true
      if (!security) return false
      const existing = prices
        .get(security.id)
        ?.find((point) => point.day === asOf)
      return kept.has(line.isin) || existing?.priceEur === price
    })
    return {
      asOf,
      comparedWith: before?.asOf ?? null,
      lines,
      cashBeforeCents: before?.cashCents ?? null,
      cashAfterCents: dto.cashCents,
      valueBeforeCents: stored?.valueCents ?? null,
      valueAfterCents,
      typedValueCents: stored?.source === 'typed' ? stored.valueCents : null,
      unknownWithoutName: unknown
        .filter((line) => line.name === undefined)
        .map((line) => line.isin),
      unchanged:
        sameDay &&
        before.cashCents === dto.cashCents &&
        lines.every((line) => line.status === 'unchanged') &&
        pricesUnchanged,
    }
  }

  /**
   * Writes a whole statement of `asOf` (the MCP's statement read by Claude,
   * or a statement typed in the app): its lines replace that day's, its
   * prices become that day's `statement` prices (never over a manual one),
   * and the account's values are computed again from that day.
   */
  async putStatement(
    accountId: string,
    asOf: string,
    dto: PutStatementDto,
    source: PositionStatementSource,
    now: Date = new Date(),
  ): Promise<PositionsDto> {
    const today = parisToday(now)
    assertNotFuture(asOf, today)
    assertNoDuplicate(dto.lines)
    return this.db.transaction(async (tx) => {
      await this.writableAccount(tx, accountId)
      const resolved = await this.resolveLines(tx, dto.lines)
      await this.writeStatement(
        tx,
        accountId,
        asOf,
        dto.cashCents,
        resolved,
        source,
      )
      await this.writeStatementPrices(tx, asOf, resolved)
      const written = await revalue(tx, accountId, asOf, today)
      this.logger.log(
        `Statement written: ${resolved.length} lines, ${written} values`,
      )
      return this.read(tx, accountId, today)
    })
  }

  /** Adds or changes one line as of today (a copy of the latest statement). */
  async upsertLine(
    accountId: string,
    isin: string,
    dto: UpsertLineDto,
    now: Date = new Date(),
  ): Promise<PositionsDto> {
    const today = parisToday(now)
    return this.editToday(accountId, today, async (tx, lines) => {
      const [resolved] = await this.resolveLines(tx, [
        {
          isin,
          name: dto.name,
          quantity: dto.quantity,
          unitCostEur: dto.unitCostEur,
        },
      ])
      const others = lines.filter(
        (line) => line.securityId !== resolved.securityId,
      )
      const old = lines.find((line) => line.securityId === resolved.securityId)
      return [
        ...others,
        {
          ...resolved,
          // An omitted PRU keeps the one known.
          unitCostEur:
            dto.unitCostEur === undefined
              ? (old?.unitCostEur ?? null)
              : resolved.unitCostEur,
        },
      ]
    })
  }

  /** Removes one line as of today (sold). */
  async removeLine(
    accountId: string,
    isin: string,
    now: Date = new Date(),
  ): Promise<PositionsDto> {
    const today = parisToday(now)
    return this.editToday(accountId, today, async (tx, lines) => {
      const [security] = await tx
        .select({ id: securitiesTable.id })
        .from(securitiesTable)
        .where(eq(securitiesTable.isin, isin))
      const left = lines.filter((line) => line.securityId !== security?.id)
      if (!security || left.length === lines.length) {
        throw new NotFoundException('No such line')
      }
      return left
    })
  }

  /** Sets the cash as of today. */
  async setCash(
    accountId: string,
    dto: SetCashDto,
    now: Date = new Date(),
  ): Promise<PositionsDto> {
    const today = parisToday(now)
    return this.editToday(
      accountId,
      today,
      async (_tx, lines) => lines,
      dto.cashCents,
    )
  }

  /** Deletes the statement of a day; values are computed again from it. */
  async removeStatement(
    accountId: string,
    asOf: string,
    now: Date = new Date(),
  ): Promise<PositionsDto> {
    const today = parisToday(now)
    return this.db.transaction(async (tx) => {
      await this.writableAccount(tx, accountId)
      const deleted = await tx
        .delete(positionStatementsTable)
        .where(
          and(
            eq(positionStatementsTable.accountId, accountId),
            eq(positionStatementsTable.asOf, asOf),
          ),
        )
        .returning({ id: positionStatementsTable.id })
      if (deleted.length === 0)
        throw new NotFoundException('No statement that day')
      await revalue(tx, accountId, asOf, today)
      return this.read(tx, accountId, today)
    })
  }

  /**
   * A manual price of a day for a known security; every account holding it
   * gets its values computed again from that day.
   */
  async setPrice(
    isin: string,
    day: string,
    priceEur: string,
    now: Date = new Date(),
  ): Promise<void> {
    const today = parisToday(now)
    assertNotFuture(day, today)
    await this.db.transaction(async (tx) => {
      const [security] = await tx
        .select({ id: securitiesTable.id })
        .from(securitiesTable)
        .where(eq(securitiesTable.isin, isin))
      if (!security) throw new NotFoundException('Unknown security')
      await tx
        .insert(securityPricesTable)
        .values({
          securityId: security.id,
          day,
          priceEur: normalizeDecimal(priceEur),
          source: 'manual',
        })
        .onConflictDoUpdate({
          target: [securityPricesTable.securityId, securityPricesTable.day],
          set: { priceEur: normalizeDecimal(priceEur), source: 'manual' },
        })
      for (const accountId of await accountsHolding(tx, security.id)) {
        await revalue(tx, accountId, day, today)
      }
    })
  }

  /* ------------------------------------------------------------------ */

  /**
   * Runs a hand edit on the lines as of today: today's statement if there is
   * one, else a copy of the latest one dated today (the past is never
   * rewritten by an edit).
   */
  private editToday(
    accountId: string,
    today: string,
    edit: (tx: Executor, lines: ResolvedLine[]) => Promise<ResolvedLine[]>,
    cashCents?: number,
  ): Promise<PositionsDto> {
    return this.db.transaction(async (tx) => {
      await this.writableAccount(tx, accountId)
      const statements =
        (await loadStatements(tx, [accountId])).get(accountId) ?? []
      const latest = statementOn(statements, today)
      const lines = await edit(
        tx,
        (latest?.lines ?? []).map((line) => ({ ...line, priceEur: null })),
      )
      const source = latest?.asOf === today ? latest.source : 'typed'
      await this.writeStatement(
        tx,
        accountId,
        today,
        cashCents ?? latest?.cashCents ?? 0,
        lines,
        source,
      )
      await revalue(tx, accountId, today, today)
      return this.read(tx, accountId, today)
    })
  }

  private async writableAccount(tx: Executor, accountId: string) {
    const account = await this.accounts.findOne(accountId, tx)
    if (account.archivedAt) {
      throw new BadRequestException('Cannot change an archived account')
    }
    assertPositionAccount(account)
    return account
  }

  private async securitiesByIsin(executor: Executor, isins: readonly string[]) {
    if (isins.length === 0) return new Map<string, schema.SelectSecurity>()
    const rows = await executor
      .select()
      .from(securitiesTable)
      .where(inArray(securitiesTable.isin, [...isins]))
    return new Map(rows.map((row) => [row.isin, row]))
  }

  /**
   * The lines' securities, created when unknown (a name is then required) and
   * renamed when a new name is sent.
   */
  private async resolveLines(
    tx: Executor,
    lines: readonly Pick<
      StatementLineInputDto,
      'isin' | 'name' | 'quantity' | 'unitCostEur' | 'priceEur'
    >[],
  ): Promise<ResolvedLine[]> {
    const known = await this.securitiesByIsin(
      tx,
      lines.map((line) => line.isin),
    )
    const resolved: ResolvedLine[] = []
    for (const line of lines) {
      let security = known.get(line.isin)
      if (!security) {
        if (!line.name) {
          throw new BadRequestException(
            `Unknown security ${line.isin}: its name is required`,
          )
        }
        ;[security] = await tx
          .insert(securitiesTable)
          .values({ isin: line.isin, name: line.name })
          .returning()
      } else if (line.name && line.name !== security.name) {
        await tx
          .update(securitiesTable)
          .set({ name: line.name })
          .where(eq(securitiesTable.id, security.id))
      }
      resolved.push({
        securityId: security.id,
        quantity: normalizeDecimal(line.quantity),
        unitCostEur: decimalOrNull(line.unitCostEur),
        priceEur: decimalOrNull(line.priceEur),
      })
    }
    return resolved
  }

  private async writeStatement(
    tx: Executor,
    accountId: string,
    asOf: string,
    cashCents: number,
    lines: readonly ResolvedLine[],
    source: PositionStatementSource,
  ) {
    const [statement] = await tx
      .insert(positionStatementsTable)
      .values({ accountId, asOf, cashCents, source })
      .onConflictDoUpdate({
        target: [
          positionStatementsTable.accountId,
          positionStatementsTable.asOf,
        ],
        set: { cashCents, source },
      })
      .returning({ id: positionStatementsTable.id })
    await tx
      .delete(positionLinesTable)
      .where(eq(positionLinesTable.statementId, statement.id))
    if (lines.length > 0) {
      await tx.insert(positionLinesTable).values(
        lines.map((line) => ({
          statementId: statement.id,
          securityId: line.securityId,
          quantity: line.quantity,
          unitCostEur: line.unitCostEur,
        })),
      )
    }
  }

  /** The statement's prices of its day, never over a manual one. */
  private async writeStatementPrices(
    tx: Executor,
    day: string,
    lines: readonly ResolvedLine[],
  ) {
    const priced = lines.filter((line) => line.priceEur !== null)
    if (priced.length === 0) return
    const p = securityPricesTable
    await tx
      .insert(p)
      .values(
        priced.map((line) => ({
          securityId: line.securityId,
          day,
          priceEur: line.priceEur!,
          source: 'statement' as const,
        })),
      )
      .onConflictDoUpdate({
        target: [p.securityId, p.day],
        set: { priceEur: sql`excluded.price_eur`, source: 'statement' },
        setWhere: sql`${p.source} <> 'manual'`,
      })
  }

  /** The positions DTO of the statement in force on `today`. */
  private async read(
    executor: Executor,
    accountId: string,
    today: string,
  ): Promise<PositionsDto> {
    const statements =
      (await loadStatements(executor, [accountId])).get(accountId) ?? []
    const current = statementOn(statements, today)
    const ids = current ? securityIdsOf([current]) : []
    const [securities, prices] = await Promise.all([
      loadSecurities(executor, ids),
      loadPrices(executor, ids),
    ])
    return toPositionsDto(
      accountId,
      statements,
      current,
      securities,
      prices,
      today,
    )
  }
}

/** Builds the DTO (exported for the specs). */
export function toPositionsDto(
  accountId: string,
  statements: readonly StoredStatement[],
  current: StoredStatement | null,
  securities: ReadonlyMap<string, schema.SelectSecurity>,
  prices: PriceSeries,
  today: string,
): PositionsDto {
  const lines: PositionLineDto[] = (current?.lines ?? []).map((line) => {
    const security = securities.get(line.securityId)!
    const price = priceOn(prices, line.securityId, today)
    const costCents = lineCostCents(line)
    const valueCents = price
      ? Number(valueInCents(line.quantity, price.priceEur))
      : null
    return {
      securityId: line.securityId,
      isin: security.isin,
      name: security.name,
      ticker: security.ticker,
      quantity: line.quantity,
      unitCostEur: line.unitCostEur,
      costCents,
      priceEur: price?.priceEur ?? null,
      priceDay: price?.day ?? null,
      priceSource: price?.source ?? null,
      valueCents,
      gainCents:
        valueCents !== null && costCents !== null
          ? valueCents - costCents
          : null,
      priceOlderThanStatement: price !== null && price.day < current!.asOf,
    }
  })
  // Largest first, like the crypto assets.
  lines.sort((a, b) => (b.valueCents ?? -1) - (a.valueCents ?? -1))
  const cashCents = current?.cashCents ?? 0
  const priced = lines.filter((line) => line.valueCents !== null)
  const pricedValueCents =
    cashCents + priced.reduce((sum, line) => sum + line.valueCents!, 0)
  const withCost = priced.filter((line) => line.costCents !== null)
  const costCents = withCost.reduce((sum, line) => sum + line.costCents!, 0)
  return {
    accountId,
    asOf: current?.asOf ?? null,
    cashCents,
    lines,
    totals: {
      valueCents: priced.length === lines.length ? pricedValueCents : null,
      pricedValueCents,
      costCents,
      gainCents:
        withCost.reduce((sum, line) => sum + line.valueCents!, 0) - costCents,
      withoutPriceCount: lines.length - priced.length,
      withoutCostCount: lines.filter((line) => line.costCents === null).length,
    },
    statements: [...statements].reverse().map((statement) => ({
      asOf: statement.asOf,
      source: statement.source,
      lineCount: statement.lines.length,
      cashCents: statement.cashCents,
    })),
  }
}

function decimalOrNull(text: string | null | undefined): string | null {
  return text === null || text === undefined ? null : normalizeDecimal(text)
}

function assertNotFuture(day: string, today: string) {
  if (day > today) throw new BadRequestException(`Date ${day} is in the future`)
}

function assertNoDuplicate(lines: readonly { isin: string }[]) {
  const isins = lines.map((line) => line.isin)
  const duplicate = isins.find((isin, i) => isins.indexOf(isin) !== i)
  if (duplicate !== undefined) {
    throw new BadRequestException(`Duplicate line ${duplicate}`)
  }
}

function assertPositionAccount(account: { type: AccountType }) {
  if (!takesPositions(account)) {
    throw new BadRequestException(POSITIONS_ONLY_MESSAGE)
  }
}
