import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'
import { loggerParams } from './config/logger'
import { THROTTLE_LIMITS, THROTTLE_TTL } from './throttle.config'
import { AllExceptionsFilter } from '#/common/filters/all-exceptions.filter'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { BudgetsModule } from '#/budgets/budgets.module'
import { CategoriesModule } from '#/categories/categories.module'
import { DashboardModule } from '#/dashboard/dashboard.module'
import { DatabaseModule } from '#/database/database.module'
import { EmailModule } from '#/email/email.module'
import { ForecastModule } from '#/forecast/forecast.module'
import { HealthModule } from '#/health/health.module'
import { ImportsModule } from '#/imports/imports.module'
import { InvestmentsModule } from '#/investments/investments.module'
import { RecurringModule } from '#/recurring/recurring.module'
import { SpendingModule } from '#/spending/spending.module'
import { TransactionsModule } from '#/transactions/transactions.module'
import { UserModule } from '#/user/user.module'

@Module({
  imports: [
    // Structured JSON logging with a per-request correlation id (see logger.ts).
    LoggerModule.forRoot(loggerParams),
    // Global rate limiting: 60 requests / minute per IP by default.
    // Sensitive auth routes tighten this with route-level @Throttle() overrides.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: THROTTLE_TTL, limit: THROTTLE_LIMITS.global },
      ],
    }),
    DatabaseModule,
    EmailModule,
    UserModule,
    AuthModule,
    HealthModule,
    CategoriesModule,
    AccountsModule,
    ImportsModule,
    TransactionsModule,
    BudgetsModule,
    DashboardModule,
    SpendingModule,
    InvestmentsModule,
    RecurringModule,
    ForecastModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Normalises every unhandled exception into a uniform error envelope.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
