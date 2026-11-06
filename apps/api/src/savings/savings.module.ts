import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { InvestmentsModule } from '#/investments/investments.module'
import { SavingsController } from './savings.controller'
import { SavingsService } from './savings.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule, InvestmentsModule],
  controllers: [SavingsController],
  providers: [SavingsService],
})
export class SavingsModule {}
