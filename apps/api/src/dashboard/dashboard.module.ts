import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { BudgetsModule } from '#/budgets/budgets.module'
import { TransactionsModule } from '#/transactions/transactions.module'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule, TransactionsModule, BudgetsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
