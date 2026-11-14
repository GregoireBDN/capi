import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { AccountsService } from '#/accounts/accounts.service'
import { DatabaseService } from '#/database/database.service'
import { cryptoWalletKeysTable } from '#/database/schema'
import type { WalletKeyDto, WalletKeyInputDto } from './wallet-keys.dto'
import {
  insertWalletKeys,
  prepareWalletKeys,
  toWalletKeyDto,
} from './wallet-keys.repository'

const k = cryptoWalletKeysTable

/**
 * Public keys of wallet crypto accounts. A wallet account keeps at least one
 * key. Keys are never logged and, in this version, never sent anywhere: the
 * chain sync that reads them comes with #129.
 */
@Injectable()
export class WalletKeysService {
  constructor(
    private readonly database: DatabaseService,
    private readonly accounts: AccountsService,
  ) {}

  private get db() {
    return this.database.db
  }

  async list(accountId: string): Promise<WalletKeyDto[]> {
    await this.walletAccount(accountId)
    const rows = await this.db
      .select()
      .from(k)
      .where(eq(k.accountId, accountId))
      .orderBy(asc(k.createdAt), asc(k.family), asc(k.publicKey))
    return rows.map(toWalletKeyDto)
  }

  async add(accountId: string, dto: WalletKeyInputDto): Promise<WalletKeyDto> {
    await this.walletAccount(accountId, true)
    const [row] = await insertWalletKeys(
      this.db,
      accountId,
      prepareWalletKeys([dto]),
    )
    return toWalletKeyDto(row)
  }

  async remove(accountId: string, keyId: string): Promise<void> {
    await this.walletAccount(accountId, true)
    await this.db.transaction(async (tx) => {
      const keys = await tx
        .select({ id: k.id })
        .from(k)
        .where(eq(k.accountId, accountId))
        .for('update')
      if (!keys.some((key) => key.id === keyId)) {
        throw new NotFoundException('Wallet key not found')
      }
      if (keys.length === 1) {
        throw new BadRequestException(
          'A wallet account keeps at least one public key',
        )
      }
      await tx.delete(k).where(and(eq(k.id, keyId), eq(k.accountId, accountId)))
    })
  }

  private async walletAccount(accountId: string, writable = false) {
    const account = await this.accounts.findOne(accountId, this.db)
    if (account.type !== 'crypto' || account.cryptoSource !== 'wallet') {
      throw new BadRequestException(
        'Public keys are only kept on wallet crypto accounts',
      )
    }
    if (writable && account.archivedAt) {
      throw new BadRequestException('Cannot change an archived account')
    }
    return account
  }
}
