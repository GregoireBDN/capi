import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { BudgetsModule } from '#/budgets/budgets.module'
import { TransactionsModule } from '#/transactions/transactions.module'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'
import { DashboardLayoutController } from './layout/dashboard-layout.controller'
import { DashboardLayoutService } from './layout/dashboard-layout.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule, TransactionsModule, BudgetsModule],
  // The layout's controller first: `dashboard/layout` before any `dashboard/:x`.
  controllers: [DashboardLayoutController, DashboardController],
  providers: [DashboardService, DashboardLayoutService],
  // The month-end review (#75) builds on the month review.
  exports: [DashboardService],
})
export class DashboardModule {}
