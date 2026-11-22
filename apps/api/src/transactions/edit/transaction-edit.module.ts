import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { TransactionEditController } from './transaction-edit.controller'
import { TransactionEditService } from './transaction-edit.service'

/**
 * The transaction editor's save (#435): its own module, since it goes
 * through the transactions, money owed and recurring services, which depend
 * on one another in that order.
 */
@Module({
  imports: [AuthModule],
  controllers: [TransactionEditController],
  providers: [TransactionEditService],
})
export class TransactionEditModule {}
