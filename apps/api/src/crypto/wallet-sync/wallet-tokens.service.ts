import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { AccountsService } from '#/accounts/accounts.service'
import { DatabaseService } from '#/database/database.service'
import {
  cryptoWalletTokensTable,
  type SelectCryptoWalletToken,
} from '#/database/schema'
import { NATIVE_ASSET_IDS } from './chains'
import type { AddWalletTokenDto, WalletTokenDto } from './wallet-tokens.dto'
import { WalletSyncService } from './wallet-sync.service'

const t = cryptoWalletTokensTable

function toDto(row: SelectCryptoWalletToken): WalletTokenDto {
  return {
    id: row.id,
    accountId: row.accountId,
    assetId: row.assetId,
    symbol: row.symbol,
    name: row.name,
  }
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

/**
 * Tokens a wallet account reads on its EVM chains on top of the native coins
 * and the assets it already holds ("Ajouter un jeton"). Changing them makes
 * the next sync read the chains again at once.
 */
@Injectable()
export class WalletTokensService {
  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsService,
    private readonly walletSync: WalletSyncService,
  ) {}

  private get db() {
    return this.database.db
  }

  async list(accountId: string): Promise<WalletTokenDto[]> {
    await this.walletAccount(accountId)
    const rows = await this.db
      .select()
      .from(t)
      .where(eq(t.accountId, accountId))
      .orderBy(asc(t.symbol), asc(t.assetId))
    return rows.map(toDto)
  }

  async add(
    accountId: string,
    dto: AddWalletTokenDto,
  ): Promise<WalletTokenDto> {
    await this.walletAccount(accountId, true)
    if (NATIVE_ASSET_IDS.has(dto.assetId)) {
      throw new BadRequestException(
        'Native coins (BTC, ETH, BNB, POL) are always read',
      )
    }
    if ((await this.walletSync.isEvmToken(dto.assetId)) === false) {
      throw new BadRequestException(
        'This asset is not a token of a supported EVM chain',
      )
    }
    let row: SelectCryptoWalletToken
    try {
      ;[row] = await this.db
        .insert(t)
        .values({
          accountId,
          assetId: dto.assetId,
          symbol: dto.symbol,
          name: dto.name,
        })
        .returning()
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('This token is already read')
      }
      throw error
    }
    this.walletSync.invalidate(accountId)
    return toDto(row)
  }

  async remove(accountId: string, tokenId: string): Promise<void> {
    await this.walletAccount(accountId, true)
    const deleted = await this.db
      .delete(t)
      .where(and(eq(t.id, tokenId), eq(t.accountId, accountId)))
      .returning({ id: t.id })
    if (deleted.length === 0) throw new NotFoundException('Token not found')
    this.walletSync.invalidate(accountId)
  }

  private async walletAccount(accountId: string, writable = false) {
    const account = await this.accounts.findOne(accountId, this.db)
    if (account.type !== 'crypto' || account.cryptoSource !== 'wallet') {
      throw new BadRequestException(
        'Tokens are only read on wallet crypto accounts',
      )
    }
    if (writable && account.archivedAt) {
      throw new BadRequestException('Cannot change an archived account')
    }
    return account
  }
}
