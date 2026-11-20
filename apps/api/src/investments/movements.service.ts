import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  ne,
  notInArray,
  or,
  type SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Carried } from '#/crypto/cost-basis'
import { CryptoCostBasisService } from '#/crypto/cost-basis.service'
import { DatabaseService } from '#/database/database.service'
import {
  accountsTable,
  cryptoMovementsTable,
  INVESTMENT_ACCOUNT_TYPES,
  transactionsTable,
} from '#/database/schema'
import type { AccountType } from '#/database/schema/domain-enums'
import { FIAT_TICKERS } from '#/imports/crypto/assets'
import { CRYPTO_TRANSFER_KINDS } from '#/imports/crypto/movement-links'
import { addDays } from '#/imports/dedupe/calendar-date'
import { parisToday } from './days'
import type {
  InvestmentMovementDto,
  InvestmentMovementsDto,
  MovementAccountDto,
} from './dto/movements.dto'

/** Most movements one listing returns. */
export const MOVEMENTS_MAX = 500

const own = alias(accountsTable, 'own_account')
const other = alias(accountsTable, 'other_account')
const cm = cryptoMovementsTable
const t = transactionsTable

/** Start of the Paris day `date`, as an instant (UTC+1 or +2, so before). */
function parisDayStart(date: string): Date {
  return new Date(`${addDays(date, -1)}T21:00:00Z`)
}

function account(
  id: string | null,
  name: string | null,
  type: AccountType | null,
): MovementAccountDto | null {
  return id === null ? null : { id, name: name!, type: type! }
}

/** A withdrawal's cost: null when none of its coins had a known cost. */
function costOf(carried: Carried | undefined): number | null {
  if (!carried || carried.unknownQuantity >= carried.quantity) return null
  return Number(carried.costCents)
}

/** Positive exact decimal text of a signed quantity. */
function magnitude(quantity: string): string {
  return quantity.startsWith('-') ? quantity.slice(1) : quantity
}

/**
 * The movements of money towards the investments (#296), as one list: bank
 * transfers linked to an investment account (checking → PEA, checking →
 * exchange) and coins moved between an exchange and the owner's other
 * crypto accounts (exchange → Ledger), with what they cost.
 */
@Injectable()
export class MovementsService {
  private readonly costBasis: CryptoCostBasisService

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional()
    @Inject(CryptoCostBasisService)
    costBasis?: CryptoCostBasisService,
  ) {
    this.costBasis = costBasis ?? new CryptoCostBasisService(database)
  }

  private get db() {
    return this.database.db
  }

  async list(
    from: string,
    to: string,
    accountId?: string,
  ): Promise<InvestmentMovementsDto> {
    const bankWhere: (SQL | undefined)[] = [
      eq(t.kind, 'transfer'),
      gte(t.bookingDate, from),
      lte(t.bookingDate, to),
      accountId === undefined
        ? inArray(other.type, [...INVESTMENT_ACCOUNT_TYPES])
        : eq(t.counterpartAccountId, accountId),
    ]
    const bank = await this.db
      .select({
        id: t.id,
        date: t.bookingDate,
        amountCents: t.amountCents,
        ownId: own.id,
        ownName: own.name,
        ownType: own.type,
        otherId: other.id,
        otherName: other.name,
        otherType: other.type,
      })
      .from(t)
      .innerJoin(own, eq(own.id, t.accountId))
      .innerJoin(other, eq(other.id, t.counterpartAccountId))
      .where(and(...bankWhere))
      .orderBy(desc(t.bookingDate), desc(t.id))
      .limit(MOVEMENTS_MAX)

    const crypto = await this.db
      .select({
        id: cm.id,
        occurredAt: cm.occurredAt,
        kind: cm.kind,
        asset: cm.asset,
        quantity: cm.quantity,
        ownId: own.id,
        ownName: own.name,
        ownType: own.type,
        otherId: other.id,
        otherName: other.name,
        otherType: other.type,
      })
      .from(cm)
      .innerJoin(own, eq(own.id, cm.accountId))
      .leftJoin(other, eq(other.id, cm.counterpartAccountId))
      .where(
        and(
          inArray(cm.kind, [...CRYPTO_TRANSFER_KINDS]),
          notInArray(cm.asset, [...FIAT_TICKERS]),
          gte(cm.occurredAt, parisDayStart(from)),
          lt(cm.occurredAt, parisDayStart(addDays(to, 1))),
          accountId === undefined
            ? undefined
            : or(
                eq(cm.accountId, accountId),
                eq(cm.counterpartAccountId, accountId),
              ),
        ),
      )
      .orderBy(desc(cm.occurredAt), desc(cm.id))
      .limit(MOVEMENTS_MAX)
    // What each withdrawal took out, from the replay (#373): unknown when
    // none of its coins had a known cost.
    const costs =
      crypto.length > 0 ? (await this.costBasis.load()).movementCosts : null

    const items: InvestmentMovementDto[] = [
      ...bank.map((row): InvestmentMovementDto => {
        const ownAccount = account(row.ownId, row.ownName, row.ownType)
        const otherAccount = account(row.otherId, row.otherName, row.otherType)
        const out = row.amountCents < 0
        return {
          id: row.id,
          source: 'bank',
          date: row.date,
          from: out ? ownAccount : otherAccount,
          to: out ? otherAccount : ownAccount,
          amountCents: Math.abs(row.amountCents),
          asset: null,
          quantity: null,
          cryptoKind: null,
          linkable: false,
        }
      }),
      ...crypto.map((row): InvestmentMovementDto => {
        const exchange = account(row.ownId, row.ownName, row.ownType)
        const otherAccount = account(row.otherId, row.otherName, row.otherType)
        const withdrawal = row.kind === 'withdrawal'
        return {
          id: row.id,
          source: 'crypto',
          date: parisToday(row.occurredAt),
          from: withdrawal ? exchange : otherAccount,
          to: withdrawal ? otherAccount : exchange,
          amountCents: withdrawal ? costOf(costs?.get(row.id)) : null,
          asset: row.asset,
          quantity: magnitude(row.quantity),
          cryptoKind: withdrawal ? 'withdrawal' : 'deposit',
          linkable: true,
        }
      }),
    ]
      // The instants were bounded loosely around the Paris days.
      .filter((item) => item.date >= from && item.date <= to)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, MOVEMENTS_MAX)
    return { from, to, items }
  }

  /**
   * Sets the other crypto account of an exchange withdrawal or deposit
   * (#296): the Ledger it went to. A wallet's contributions are the cost of
   * the coins withdrawn to it.
   */
  async linkCrypto(
    id: string,
    counterpartAccountId: string | null,
  ): Promise<InvestmentMovementDto> {
    const [movement] = await this.db
      .select({ accountId: cm.accountId, kind: cm.kind, asset: cm.asset })
      .from(cm)
      .where(eq(cm.id, id))
    if (!movement) throw new NotFoundException('Crypto movement not found')
    if (
      !(CRYPTO_TRANSFER_KINDS as readonly string[]).includes(movement.kind) ||
      FIAT_TICKERS.has(movement.asset)
    ) {
      throw new BadRequestException(
        'Only a withdrawal or deposit of coins can be linked to another account',
      )
    }
    if (counterpartAccountId !== null) {
      const [target] = await this.db
        .select({ type: accountsTable.type })
        .from(accountsTable)
        .where(
          and(
            eq(accountsTable.id, counterpartAccountId),
            ne(accountsTable.id, movement.accountId),
          ),
        )
      if (!target || target.type !== 'crypto') {
        throw new BadRequestException(
          'counterpartAccountId must be another crypto account',
        )
      }
    }
    await this.db
      .update(cm)
      .set({ counterpartAccountId, updatedAt: new Date() })
      .where(eq(cm.id, id))
    const today = parisToday()
    const listed = await this.list('1970-01-01', today, movement.accountId)
    const updated = listed.items.find((item) => item.id === id)
    if (!updated) throw new NotFoundException('Crypto movement not found')
    return updated
  }
}
