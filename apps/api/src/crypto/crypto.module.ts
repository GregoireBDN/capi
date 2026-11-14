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
import { CryptoService } from './crypto.service'
import { CRYPTO_PRICE_OPTIONS, type CryptoPriceOptions } from './price-provider'
import { WalletKeysController } from './wallet-keys/wallet-keys.controller'
import { WalletKeysService } from './wallet-keys/wallet-keys.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule],
  controllers: [
    AccountHoldingsController,
    CryptoController,
    WalletKeysController,
  ],
  providers: [
    {
      provide: CRYPTO_PRICE_OPTIONS,
      useFactory: (): CryptoPriceOptions => ({
        provider: env.PRICE_API_ENABLED
          ? new CoinGeckoPriceProvider({ baseUrl: env.PRICE_API_URL })
          : null,
        ttlMs: env.PRICE_CACHE_TTL_SECONDS * 1000,
      }),
    },
    CryptoPricesService,
    CryptoService,
    WalletKeysService,
  ],
})
export class CryptoModule {}
