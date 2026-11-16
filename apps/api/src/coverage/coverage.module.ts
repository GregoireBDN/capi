import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { CoverageController } from './coverage.controller'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule],
  controllers: [CoverageController],
})
export class CoverageModule {}
