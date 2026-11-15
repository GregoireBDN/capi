import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { LoggerModule } from 'nestjs-pino'
import { loggerParams } from './config/logger'
import { THROTTLE_LIMITS, THROTTLE_TTL } from './throttle.config'
import { AllExceptionsFilter } from '#/common/filters/all-exceptions.filter'
import { AccountsModule } from '#/accounts/accounts.module'
import { accessTokenThrottler } from '#/auth/access-tokens/access-token.throttler'
import { AuthModule } from '#/auth/auth.module'
import { RemoteMcpModule } from '#/auth/oauth/remote-mcp.module'
import { env } from '#/config/env'
import { BudgetsModule } from '#/budgets/budgets.module'
import { CategoriesModule } from '#/categories/categories.module'
import { CryptoModule } from '#/crypto/crypto.module'
import { CryptoImportsModule } from '#/imports/crypto/crypto-imports.module'
import { DashboardModule } from '#/dashboard/dashboard.module'
import { DatabaseModule } from '#/database/database.module'
import { EmailModule } from '#/email/email.module'
import { ForecastModule } from '#/forecast/forecast.module'
import { HealthModule } from '#/health/health.module'
import { ImportsModule } from '#/imports/imports.module'
import { MonthCloseModule } from '#/month-close/month-close.module'
import { InvestmentsModule } from '#/investments/investments.module'
import { RecurringModule } from '#/recurring/recurring.module'
import { SavingsModule } from '#/savings/savings.module'
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
        // Personal access tokens get their own bucket on top of the IP one.
        accessTokenThrottler,
      ],
    }),
    DatabaseModule,
    EmailModule,
    UserModule,
    AuthModule,
    // Remote MCP access (#78): no route at all unless REMOTE_MCP_ENABLED=true.
    RemoteMcpModule.register(env.remoteMcp.enabled),
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
    CryptoModule,
    CryptoImportsModule,
    ForecastModule,
    SavingsModule,
    MonthCloseModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Normalises every unhandled exception into a uniform error envelope.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
