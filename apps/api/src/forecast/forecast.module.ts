import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { RecurringModule } from '#/recurring/recurring.module'
import { ForecastController } from './forecast.controller'
import { ForecastService } from './forecast.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule, RecurringModule],
  controllers: [ForecastController],
  providers: [ForecastService],
})
export class ForecastModule {}
