import { type DynamicModule, Module } from '@nestjs/common'
import { AuthModule } from '#/auth/auth.module'
import { OAuthAuditHook } from './oauth-audit.hook'
import {
  OAuthConsentController,
  OAuthController,
  OAuthTokenInfoController,
} from './oauth.controller'

/**
 * Remote MCP access (#78, ADR 0003). `register(false)` (the default,
 * `REMOTE_MCP_ENABLED` unset) mounts nothing: no `/api/oauth` route exists,
 * and `JwtGuard` refuses OAuth tokens since `OAuthService` knows it is off.
 */
@Module({})
export class RemoteMcpModule {
  static register(enabled: boolean): DynamicModule {
    if (!enabled) return { module: RemoteMcpModule }
    return {
      module: RemoteMcpModule,
      imports: [AuthModule],
      controllers: [
        OAuthController,
        OAuthConsentController,
        OAuthTokenInfoController,
      ],
      providers: [OAuthAuditHook],
    }
  }
}
