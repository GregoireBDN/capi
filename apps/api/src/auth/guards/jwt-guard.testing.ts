import type { Provider } from '@nestjs/common'
import { AccessTokensService } from '#/auth/access-tokens/access-tokens.service'
import { JwtGuard } from '#/auth/guards/jwt.guard'

/**
 * For HTTP specs that sign their own session cookie: `JwtGuard` plus an access
 * token service that knows no token (every bearer token is rejected).
 */
export const JWT_GUARD_TEST_PROVIDERS: Provider[] = [
  JwtGuard,
  {
    provide: AccessTokensService,
    useValue: { authenticate: () => Promise.resolve(null) },
  },
]
