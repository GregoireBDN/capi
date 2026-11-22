import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, desc, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { AccountsService } from '#/accounts/accounts.service'
import { DatabaseService } from '#/database/database.service'
import type * as schema from '#/database/schema'
import { dividendsTable, securitiesTable } from '#/database/schema'
import { oneYearBefore, parisToday } from '#/investments/days'
import type {
  DividendDto,
  DividendsDto,
  SaveDividendDto,
} from './dto/dividends.dto'

type Db = PostgresJsDatabase<typeof schema>
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
type Executor = Db | Tx

export const DIVIDENDS_ONLY_MESSAGE = 'Only a compte-titres records dividends'

/**
 * A compte-titres' dividends (#414): typed by the owner, shown on its page
 * as information. They change neither its value (the cash they brought is in
 * its statements) nor what was invested, and no tax is computed. Never
 * logged: they are amounts.
 */
@Injectable()
export class DividendsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
  ) {}

  private get db(): Db {
    return this.database.db
  }

  async list(accountId: string, now: Date = new Date()): Promise<DividendsDto> {
    const account = await this.accounts.findOne(accountId, this.db)
    if (account.type !== 'securities') {
      throw new BadRequestException(DIVIDENDS_ONLY_MESSAGE)
    }
    return this.read(this.db, accountId, parisToday(now))
  }

  create(
    accountId: string,
    dto: SaveDividendDto,
    now: Date = new Date(),
  ): Promise<DividendsDto> {
    return this.db.transaction(async (tx) => {
      const today = await this.writable(tx, accountId, dto, now)
      await tx.insert(dividendsTable).values({
        accountId,
        paidOn: dto.paidOn,
        amountCents: dto.amountCents,
        securityId: await securityId(tx, dto.isin),
      })
      return this.read(tx, accountId, today)
    })
  }

  update(
    accountId: string,
    dividendId: string,
    dto: SaveDividendDto,
    now: Date = new Date(),
  ): Promise<DividendsDto> {
    return this.db.transaction(async (tx) => {
      const today = await this.writable(tx, accountId, dto, now)
      const [updated] = await tx
        .update(dividendsTable)
        .set({
          paidOn: dto.paidOn,
          amountCents: dto.amountCents,
          securityId: await securityId(tx, dto.isin),
        })
        .where(
          and(
            eq(dividendsTable.id, dividendId),
            eq(dividendsTable.accountId, accountId),
          ),
        )
        .returning({ id: dividendsTable.id })
      if (!updated) throw new NotFoundException('Dividend not found')
      return this.read(tx, accountId, today)
    })
  }

  remove(
    accountId: string,
    dividendId: string,
    now: Date = new Date(),
  ): Promise<DividendsDto> {
    return this.db.transaction(async (tx) => {
      await this.writableAccount(tx, accountId)
      const [removed] = await tx
        .delete(dividendsTable)
        .where(
          and(
            eq(dividendsTable.id, dividendId),
            eq(dividendsTable.accountId, accountId),
          ),
        )
        .returning({ id: dividendsTable.id })
      if (!removed) throw new NotFoundException('Dividend not found')
      return this.read(tx, accountId, parisToday(now))
    })
  }

  /** Checks the account and the day; returns today in Paris. */
  private async writable(
    tx: Executor,
    accountId: string,
    dto: SaveDividendDto,
    now: Date,
  ): Promise<string> {
    await this.writableAccount(tx, accountId)
    const today = parisToday(now)
    if (dto.paidOn > today) {
      throw new BadRequestException(`Date ${dto.paidOn} is in the future`)
    }
    return today
  }

  private async writableAccount(tx: Executor, accountId: string) {
    const account = await this.accounts.findOne(accountId, tx)
    if (account.type !== 'securities') {
      throw new BadRequestException(DIVIDENDS_ONLY_MESSAGE)
    }
    if (account.archivedAt) {
      throw new BadRequestException('Cannot change an archived account')
    }
  }

  private async read(
    executor: Executor,
    accountId: string,
    today: string,
  ): Promise<DividendsDto> {
    const rows = await executor
      .select({
        id: dividendsTable.id,
        paidOn: dividendsTable.paidOn,
        amountCents: dividendsTable.amountCents,
        isin: securitiesTable.isin,
        securityName: securitiesTable.name,
      })
      .from(dividendsTable)
      .leftJoin(
        securitiesTable,
        eq(securitiesTable.id, dividendsTable.securityId),
      )
      .where(eq(dividendsTable.accountId, accountId))
      .orderBy(desc(dividendsTable.paidOn), desc(dividendsTable.createdAt))
    const dividends: DividendDto[] = rows
    const yearAgo = oneYearBefore(today)
    return {
      accountId,
      totalCents: sum(dividends),
      last12MonthsCents: sum(dividends.filter((d) => d.paidOn > yearAgo)),
      dividends,
    }
  }
}

function sum(dividends: readonly { amountCents: number }[]): number {
  return dividends.reduce((total, d) => total + d.amountCents, 0)
}

/** The security of an ISIN the app knows; null when none is said. */
async function securityId(
  executor: Executor,
  isin: string | null | undefined,
): Promise<string | null> {
  if (isin === null || isin === undefined) return null
  const [security] = await executor
    .select({ id: securitiesTable.id })
    .from(securitiesTable)
    .where(eq(securitiesTable.isin, isin))
    .limit(1)
  if (!security) throw new BadRequestException(`Unknown security ${isin}`)
  return security.id
}
