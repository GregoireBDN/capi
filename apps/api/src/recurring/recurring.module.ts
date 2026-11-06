import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { RecurringController } from './recurring.controller'
import { RecurringService } from './recurring.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule],
  controllers: [RecurringController],
  providers: [RecurringService],
  // Imports run a detection after a commit or an undo.
  exports: [RecurringService],
})
export class RecurringModule {}
