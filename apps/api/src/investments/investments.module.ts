import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { AccountSnapshotsController } from './account-snapshots.controller'
import {
  CryptoMovementsController,
  InvestmentsController,
} from './investments.controller'
import { InvestmentsService } from './investments.service'
import { MovementsService } from './movements.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule],
  exports: [InvestmentsService],
  controllers: [
    AccountSnapshotsController,
    InvestmentsController,
    CryptoMovementsController,
  ],
  providers: [InvestmentsService, MovementsService],
})
export class InvestmentsModule {}
