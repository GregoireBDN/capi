import { Module } from '@nestjs/common'
import { AccountsModule } from '#/accounts/accounts.module'
import { AuthModule } from '#/auth/auth.module'
import { EnvelopesController } from './envelopes.controller'
import { EnvelopesService } from './envelopes.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule, AccountsModule],
  controllers: [EnvelopesController],
  providers: [EnvelopesService],
  exports: [EnvelopesService],
})
export class EnvelopesModule {}
