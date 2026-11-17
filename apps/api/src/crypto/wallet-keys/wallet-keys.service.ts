import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { AccountsService } from '#/accounts/accounts.service'
import { DatabaseService } from '#/database/database.service'
import { cryptoWalletKeysTable } from '#/database/schema'
import { WalletSyncService } from '../wallet-sync/wallet-sync.service'
import type {
  UpdateWalletKeyDto,
  WalletKeyDto,
  WalletKeyInputDto,
} from './wallet-keys.dto'
import {
  extendedKeyAddressTypes,
  insertWalletKeys,
  prepareWalletKeys,
  toWalletKeyDto,
  walletKeyFormat,
} from './wallet-keys.repository'

const k = cryptoWalletKeysTable

/**
 * Public keys of wallet crypto accounts. A wallet account keeps at least one
 * key. Keys are never logged; the wallet sync (when enabled) sends the
 * addresses they stand for to the chain endpoints only.
 */
@Injectable()
export class WalletKeysService {
  // Explicit tokens: the sync is typed as a narrow interface (specs pass a
  // stub), and esbuild-based runners drop the reflected types next to it.
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(WalletSyncService)
    private readonly walletSync: Pick<WalletSyncService, 'invalidate'>,
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
    this.walletSync.invalidate(accountId)
    return toWalletKeyDto(row)
  }

  /**
   * Sets the address type of an `xpub` (or asks to detect it on the next
   * sync). A `ypub` / `zpub` or an address keeps its own type.
   */
  async update(
    accountId: string,
    keyId: string,
    dto: UpdateWalletKeyDto,
  ): Promise<WalletKeyDto> {
    await this.walletAccount(accountId, true)
    const [key] = await this.db
      .select()
      .from(k)
      .where(and(eq(k.id, keyId), eq(k.accountId, accountId)))
    if (!key) throw new NotFoundException('Wallet key not found')
    const format = walletKeyFormat(key)
    if (format !== 'xpub') {
      throw new BadRequestException(
        'Only the address type of an xpub can be changed',
      )
    }
    const [row] = await this.db
      .update(k)
      .set({
        ...extendedKeyAddressTypes(format, dto.addressType),
        updatedAt: new Date(),
      })
      .where(eq(k.id, keyId))
      .returning()
    this.walletSync.invalidate(accountId)
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
    this.walletSync.invalidate(accountId)
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
