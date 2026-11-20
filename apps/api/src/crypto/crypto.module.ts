import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { env } from '#/config/env'
import { CoinGeckoPriceProvider } from './coingecko.provider'
import { CryptoPricesService } from './crypto-prices.service'
import {
  AccountHoldingsController,
  CryptoController,
} from './crypto.controller'
import { CryptoCostBasisService } from './cost-basis.service'
import { CryptoService } from './crypto.service'
import { CryptoDailyCloseService } from './daily-close/crypto-daily-close.service'
import { CryptoPriceHistoryService } from './daily-close/crypto-price-history.service'
import { CryptoPendingController } from './pending/crypto-pending.controller'
import { CryptoPendingService } from './pending/crypto-pending.service'
import { CRYPTO_PRICE_OPTIONS, type CryptoPriceOptions } from './price-provider'
import { WalletKeysController } from './wallet-keys/wallet-keys.controller'
import { WalletKeysService } from './wallet-keys/wallet-keys.service'
import { EsploraProvider } from './wallet-sync/esplora.provider'
import { EvmRpcProvider } from './wallet-sync/evm-rpc.provider'
import {
  WALLET_SYNC_OPTIONS,
  type WalletSyncOptions,
  WalletSyncService,
} from './wallet-sync/wallet-sync.service'
import { WalletTokensController } from './wallet-sync/wallet-tokens.controller'
import { WalletTokensService } from './wallet-sync/wallet-tokens.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule],
  controllers: [
    AccountHoldingsController,
    CryptoController,
    CryptoPendingController,
    WalletKeysController,
    WalletTokensController,
  ],
  providers: [
    {
      provide: CRYPTO_PRICE_OPTIONS,
      useFactory: (): CryptoPriceOptions => ({
        provider: env.PRICE_API_ENABLED
          ? new CoinGeckoPriceProvider({ baseUrl: env.PRICE_API_URL })
          : null,
        ttlMs: env.PRICE_CACHE_TTL_SECONDS * 1000,
        // The key-less API answers a few calls a minute (#366).
        historyIntervalMs: 2_000,
      }),
    },
    {
      provide: WALLET_SYNC_OPTIONS,
      // Off (the default): no provider at all, so nothing is ever sent.
      useFactory: (): WalletSyncOptions => {
        const timeoutMs = env.WALLET_SYNC_TIMEOUT_MS
        const enabled = env.WALLET_SYNC_ENABLED
        return {
          bitcoin: enabled
            ? new EsploraProvider({
                baseUrl: env.ESPLORA_URL,
                timeoutMs,
                minIntervalMs: env.ESPLORA_MIN_INTERVAL_MS,
              })
            : null,
          evm: enabled
            ? new EvmRpcProvider({ urls: env.evmRpcUrls, timeoutMs })
            : null,
          tokens:
            enabled && env.PRICE_API_ENABLED
              ? new CoinGeckoPriceProvider({ baseUrl: env.PRICE_API_URL })
              : null,
          intervalMs: env.WALLET_SYNC_INTERVAL_SECONDS * 1000,
        }
      },
    },
    CryptoPricesService,
    CryptoCostBasisService,
    CryptoPendingService,
    CryptoService,
    CryptoPriceHistoryService,
    CryptoDailyCloseService,
    WalletKeysService,
    WalletSyncService,
    WalletTokensService,
  ],
  exports: [
    CryptoService,
    CryptoPricesService,
    CryptoDailyCloseService,
    CryptoCostBasisService,
  ],
})
export class CryptoModule {}
