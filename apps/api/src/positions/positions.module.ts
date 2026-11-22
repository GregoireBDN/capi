import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { DividendsController } from './dividends.controller'
import { DividendsService } from './dividends.service'
import {
  PositionsController,
  SecuritiesController,
} from './positions.controller'
import { PositionsService } from './positions.service'

/**
 * A PEA's or a compte-titres' lines, their prices and its computed value (ADR
 * 0006, #413, #414), and a compte-titres' dividends (#414).
 */
@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule],
  exports: [PositionsService],
  controllers: [PositionsController, SecuritiesController, DividendsController],
  providers: [PositionsService, DividendsService],
})
export class PositionsModule {}
