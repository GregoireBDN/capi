import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { AccountsService } from '#/accounts/accounts.service'
import { DatabaseService } from '#/database/database.service'
import {
  cryptoWalletTokensTable,
  type SelectCryptoWalletToken,
} from '#/database/schema'
import { contractAssetId, isContractAssetId } from '../contract-assets'
import { checkPublicKey } from '../wallet-keys/public-key'
import type { EvmChain } from './chain-provider'
import { EVM_CHAINS, NATIVE_ASSET_IDS } from './chains'
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
    chain: row.chain,
    contract: row.contract,
    priced: !isContractAssetId(row.assetId),
  }
}

/**
 * Tokens a wallet account reads on its EVM chains on top of the native coins
 * ("Ajouter un jeton"): found by name (price provider id) or by contract
 * address on one chain (#269). Changing them makes the next sync read the
 * chains again at once.
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
    if (dto.contract !== undefined) {
      return this.addContract(accountId, dto.chain!, dto.contract)
    }
    if (!dto.assetId || !dto.symbol || !dto.name) {
      throw new BadRequestException('assetId, symbol and name are required')
    }
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
    const [row] = await this.db
      .insert(t)
      .values({
        accountId,
        assetId: dto.assetId,
        symbol: dto.symbol,
        name: dto.name,
      })
      .onConflictDoNothing({ target: [t.accountId, t.assetId] })
      .returning()
    if (!row) throw new ConflictException('This token is already read')
    this.walletSync.invalidate(accountId)
    return toDto(row)
  }

  /**
   * A token by its contract: `decimals()`, `symbol()` and `name()` are read
   * on that chain (only the contract address is sent), and it is stored with
   * them, without a price id.
   */
  private async addContract(
    accountId: string,
    chain: EvmChain,
    input: string,
  ): Promise<WalletTokenDto> {
    const check = checkPublicKey(input)
    if (!check.ok || check.family !== 'evm') {
      throw new BadRequestException(
        check.ok || check.error !== 'checksum'
          ? 'Not a contract address (0x followed by 40 hexadecimal digits)'
          : 'The contract address checksum is wrong: check it for a typo.',
      )
    }
    const contract = check.publicKey
    const info = await this.walletSync.tokenInfo(chain, contract)
    if (info === 'disabled') {
      throw new BadRequestException('Wallet sync is disabled on this server')
    }
    if (info === 'unavailable') {
      throw new ServiceUnavailableException(
        'The chain could not be read; try again later',
      )
    }
    if (info === null) {
      throw new BadRequestException(
        'No token contract at this address on this chain',
      )
    }
    const symbol = info.symbol || 'ERC-20'
    const [row] = await this.db
      .insert(t)
      .values({
        accountId,
        assetId: contractAssetId(EVM_CHAINS[chain].chainId, contract),
        symbol,
        name: info.name || symbol,
        chain,
        contract,
        decimals: info.decimals,
      })
      .onConflictDoNothing({ target: [t.accountId, t.assetId] })
      .returning()
    if (!row) throw new ConflictException('This token is already read')
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
