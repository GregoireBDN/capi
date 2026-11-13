import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { RecurringModule } from '#/recurring/recurring.module'
import { SpendingController } from './spending.controller'
import { SpendingService } from './spending.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on;
  // RecurringModule the series whose costs are still expected this month.
  imports: [AuthModule, RecurringModule],
  controllers: [SpendingController],
  providers: [SpendingService],
})
export class SpendingModule {}
