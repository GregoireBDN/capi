import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, eq, inArray, or } from 'drizzle-orm'
import { DatabaseService } from '#/database/database.service'
import {
  accountsTable,
  cryptoMovementsTable,
  cryptoTransferLinksTable,
} from '#/database/schema'
import { CryptoCostBasisService, type Executor } from '../cost-basis.service'
import type {
  AnswerCryptoMovementDto,
  CryptoPendingDto,
} from './crypto-pending.dto'
import { canPick, pendingOf, pendingType } from './pending'

const m = cryptoMovementsTable
const l = cryptoTransferLinksTable

/**
 * « À préciser » (#373): the movements of a crypto account the replay could
 * not explain, and the owner's answers. Session only: answering stays in
 * the app. Every answer is a fact about one movement, so the replay follows
 * at once; none is logged.
 */
@Injectable()
export class CryptoPendingService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CryptoCostBasisService)
    private readonly costBasis: CryptoCostBasisService,
  ) {}

  private get db() {
    return this.database.db
  }

  async list(accountId: string): Promise<CryptoPendingDto> {
    await this.cryptoAccount(accountId)
    return this.read(accountId)
  }

  /** Answers one movement, then the account's list. */
  async answer(
    movementId: string,
    dto: AnswerCryptoMovementDto,
  ): Promise<CryptoPendingDto> {
    const accountId = await this.db.transaction(async (tx) => {
      const basis = await this.costBasis.load(tx)
      const movement = basis.movements.get(movementId)
      if (!movement) throw new NotFoundException('Crypto movement not found')
      const type = pendingType(movement)
      if (type === null) {
        throw new BadRequestException('This movement is not asked about')
      }
      const linked = new Set(basis.links.flatMap((k) => [k.outId, k.inId]))
      if (linked.has(movement.id)) {
        throw new ConflictException('Unlink this transfer first')
      }
      const now = new Date()
      const arrival = type !== 'departure'
      if (dto.answer === 'transfer') {
        const other =
          dto.counterpartMovementId === undefined
            ? undefined
            : basis.movements.get(dto.counterpartMovementId)
        if (!other) {
          throw new BadRequestException('counterpartMovementId is required')
        }
        if (type === 'opening') {
          // Coins sent before the first read: the withdrawal names the
          // account, which carries their cost (#296).
          if (
            other.kind !== 'withdrawal' ||
            other.assetId !== movement.assetId ||
            other.at >= movement.at ||
            other.counterpartAccountId !== null ||
            linked.has(other.id)
          ) {
            throw new BadRequestException('Not a withdrawal before this read')
          }
          await tx
            .update(m)
            .set({
              counterpartAccountId: movement.accountId,
              autoMatch: false,
              updatedAt: now,
            })
            .where(eq(m.id, other.id))
        } else {
          if (!canPick(movement, other, linked)) {
            throw new BadRequestException(
              'These two movements are not one transfer',
            )
          }
          await this.clearAnswer(tx, movement.id, now)
          const [outId, inId] =
            type === 'departure'
              ? [movement.id, other.id]
              : [other.id, movement.id]
          await this.costBasis.writeLink(tx, outId, inId, 'manual')
          await tx
            .update(m)
            .set({ autoMatch: false, updatedAt: now })
            .where(inArray(m.id, [outId, inId]))
        }
      } else if (dto.answer === 'disposed') {
        if (arrival) throw new BadRequestException('Coins that arrived')
        await this.resolve(tx, movement.id, 'disposed', null, now)
      } else {
        if (!arrival) throw new BadRequestException('Coins that left')
        if (dto.answer === 'bought' && dto.costCents === undefined) {
          throw new BadRequestException('costCents is required')
        }
        await this.resolve(
          tx,
          movement.id,
          dto.answer,
          dto.answer === 'gift' ? 0 : dto.costCents!,
          now,
        )
      }
      return movement.accountId
    })
    return this.read(accountId)
  }

  /** Takes an answer back: the movement is asked again. */
  async clear(movementId: string): Promise<CryptoPendingDto> {
    const accountId = await this.db.transaction(async (tx) => {
      const [movement] = await tx
        .select({ accountId: m.accountId })
        .from(m)
        .where(eq(m.id, movementId))
      if (!movement) throw new NotFoundException('Crypto movement not found')
      await this.clearAnswer(tx, movementId, new Date())
      return movement.accountId
    })
    return this.read(accountId)
  }

  /**
   * Unlinks a transfer: both sides are asked again and the matching leaves
   * them alone, so a link removed by hand stays removed.
   */
  async unlink(movementId: string): Promise<CryptoPendingDto> {
    const accountId = await this.db.transaction(async (tx) => {
      const [movement] = await tx
        .select({ accountId: m.accountId })
        .from(m)
        .where(eq(m.id, movementId))
      if (!movement) throw new NotFoundException('Crypto movement not found')
      const [link] = await tx
        .delete(l)
        .where(
          or(eq(l.outMovementId, movementId), eq(l.inMovementId, movementId)),
        )
        .returning()
      if (!link) throw new NotFoundException('This movement is not linked')
      await tx
        .update(m)
        .set({
          counterpartAccountId: null,
          autoMatch: false,
          updatedAt: new Date(),
        })
        .where(inArray(m.id, [link.outMovementId, link.inMovementId]))
      return movement.accountId
    })
    return this.read(accountId)
  }

  private async resolve(
    tx: Executor,
    id: string,
    resolution: 'bought' | 'gift' | 'disposed',
    costCents: number | null,
    now: Date,
  ) {
    await tx
      .update(m)
      .set({ resolution, costCents, autoMatch: false, updatedAt: now })
      .where(eq(m.id, id))
  }

  private async clearAnswer(tx: Executor, id: string, now: Date) {
    await tx
      .update(m)
      .set({
        resolution: null,
        costCents: null,
        autoMatch: false,
        updatedAt: now,
      })
      .where(eq(m.id, id))
  }

  private async read(accountId: string): Promise<CryptoPendingDto> {
    const basis = await this.costBasis.load()
    const { items, answered } = pendingOf(basis, accountId)
    const iso = (at: number) => new Date(at).toISOString()
    return {
      accountId,
      items: items.map((item) => ({
        ...item,
        from: iso(item.from),
        at: iso(item.at),
        candidates: item.candidates.map((candidate) => ({
          ...candidate,
          at: iso(candidate.at),
        })),
      })),
      answered: answered
        .sort((a, b) => b.at - a.at)
        .map(({ linkedMovementId: _linked, ...item }) => ({
          ...item,
          at: iso(item.at),
        })),
    }
  }

  private async cryptoAccount(accountId: string) {
    const [account] = await this.db
      .select({ type: accountsTable.type })
      .from(accountsTable)
      .where(and(eq(accountsTable.id, accountId)))
    if (!account) throw new NotFoundException('Account not found')
    if (account.type !== 'crypto') {
      throw new BadRequestException(
        'Only crypto accounts have coins to answer for',
      )
    }
  }
}
