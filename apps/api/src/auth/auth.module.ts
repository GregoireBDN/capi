import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AccessTokenAuditHook } from '#/auth/access-tokens/access-token-audit.hook'
import { AccessTokensController } from '#/auth/access-tokens/access-tokens.controller'
import { AccessTokensService } from '#/auth/access-tokens/access-tokens.service'
import { AuthController } from '#/auth/auth.controller'
import { AuthService } from '#/auth/auth.service'
import { JwtGuard } from '#/auth/guards/jwt.guard'
import { OAuthService } from '#/auth/oauth/oauth.service'
import { REMOTE_MCP_CONFIG } from '#/auth/oauth/remote-mcp.config'
import { PasskeysController } from '#/auth/passkeys/passkeys.controller'
import { PasskeysService } from '#/auth/passkeys/passkeys.service'
import { env } from '#/config/env'

@Module({
  imports: [
    JwtModule.register({
      secret: env.JWT_SECRET,
    }),
  ],
  controllers: [AuthController, AccessTokensController, PasskeysController],
  providers: [
    AuthService,
    JwtGuard,
    AccessTokensService,
    AccessTokenAuditHook,
    PasskeysService,
    // Remote MCP (#78): always provided so JwtGuard can refuse OAuth tokens
    // while it is off; its routes live in RemoteMcpModule.
    { provide: REMOTE_MCP_CONFIG, useValue: env.remoteMcp },
    OAuthService,
  ],
  // JwtGuard is instantiated in each consuming module: export what it injects.
  exports: [
    AuthService,
    JwtGuard,
    JwtModule,
    AccessTokensService,
    OAuthService,
  ],
})
export class AuthModule {}
