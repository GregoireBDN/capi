import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { ManualExpensesService } from './manual-expenses.service'
import { TransactionsController } from './transactions.controller'
import { TransactionsService } from './transactions.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, ManualExpensesService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
