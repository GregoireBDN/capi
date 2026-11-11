import { Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { ProfileController } from '#/user/profile.controller'
import { UserService } from '#/user/user.service'

@Module({
  // AuthModule provides JwtGuard and the JwtService it depends on.
  imports: [AuthModule],
  controllers: [ProfileController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
