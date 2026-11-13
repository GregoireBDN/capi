import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { BudgetsController } from './budgets.controller'
import { BudgetsService } from './budgets.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
