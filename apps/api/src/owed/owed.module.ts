import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { RecurringModule } from '#/recurring/recurring.module'
import { TransactionsModule } from '#/transactions/transactions.module'
import {
  ContactsController,
  OwedController,
  OwedLinksController,
  ReceivablesController,
} from './owed.controller'
import { OwedService } from './owed.service'

/** Money owed between the owner and the people around him (#359). */
@Module({
  imports: [AuthModule, TransactionsModule, RecurringModule],
  controllers: [
    ContactsController,
    OwedController,
    ReceivablesController,
    OwedLinksController,
  ],
  providers: [OwedService],
  exports: [OwedService],
})
export class OwedModule {}
