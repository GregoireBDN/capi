import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { AccountActivityService } from './account-activity.service'
import { AccountsController } from './accounts.controller'
import { AccountsService } from './accounts.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule],
  controllers: [AccountsController],
  providers: [AccountsService, AccountActivityService],
  exports: [AccountsService],
})
export class AccountsModule {}
