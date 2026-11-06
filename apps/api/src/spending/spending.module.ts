import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { SpendingController } from './spending.controller'
import { SpendingService } from './spending.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule],
  controllers: [SpendingController],
  providers: [SpendingService],
})
export class SpendingModule {}
