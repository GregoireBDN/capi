import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import {
  PositionsController,
  SecuritiesController,
} from './positions.controller'
import { PositionsService } from './positions.service'

/** A PEA's lines, their prices and its computed value (ADR 0006, #413). */
@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule],
  exports: [PositionsService],
  controllers: [PositionsController, SecuritiesController],
  providers: [PositionsService],
})
export class PositionsModule {}
