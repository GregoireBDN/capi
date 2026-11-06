import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { AccountSnapshotsController } from './account-snapshots.controller'
import { InvestmentsController } from './investments.controller'
import { InvestmentsService } from './investments.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule],
  controllers: [AccountSnapshotsController, InvestmentsController],
  providers: [InvestmentsService],
})
export class InvestmentsModule {}
