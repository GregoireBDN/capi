import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { CryptoModule } from '#/crypto/crypto.module'
import {
  AccountCryptoImportsController,
  CryptoImportsController,
} from './crypto-imports.controller'
import { CryptoImportsService } from './crypto-imports.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule, CryptoModule],
  controllers: [AccountCryptoImportsController, CryptoImportsController],
  providers: [CryptoImportsService],
})
export class CryptoImportsModule {}
