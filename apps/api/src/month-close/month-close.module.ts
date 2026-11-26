import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { BudgetsModule } from '#/budgets/budgets.module'
import { DashboardModule } from '#/dashboard/dashboard.module'
import { EnvelopesModule } from '#/envelopes/envelopes.module'
import { RecurringModule } from '#/recurring/recurring.module'
import { SavingsModule } from '#/savings/savings.module'
import { MonthCloseController } from './month-close.controller'
import { MonthCloseService } from './month-close.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [
    AuthModule,
    AccountsModule,
    DashboardModule,
    BudgetsModule,
    RecurringModule,
    SavingsModule,
    EnvelopesModule,
  ],
  controllers: [MonthCloseController],
  providers: [MonthCloseService],
})
export class MonthCloseModule {}
