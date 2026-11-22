import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { OwedModule } from '#/owed/owed.module'
import { TransactionsModule } from '#/transactions/transactions.module'
import { IntegrityController } from './integrity.controller'
import { IntegrityService } from './integrity.service'

/** Data integrity checks (#427), a step of « Bilan du mois ». */
@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule, TransactionsModule, OwedModule],
  controllers: [IntegrityController],
  providers: [IntegrityService],
})
export class IntegrityModule {}
