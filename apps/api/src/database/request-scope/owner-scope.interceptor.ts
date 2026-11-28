import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { from, lastValueFrom, type Observable } from 'rxjs'
import { DatabaseService } from '#/database/database.service'
import '#/auth/request-user'

const WITHOUT_OWNER_SCOPE = 'withoutOwnerScope'

/**
 * Identity routes (sign-in, sessions, passkeys, tokens, OAuth): they read
 * the identity tables only, outside the owner's transaction (ADR 0009 §1),
 * and some write on purpose before refusing (a passkey challenge used up).
 */
export const WithoutOwnerScope = () => SetMetadata(WITHOUT_OWNER_SCOPE, true)

/**
 * Every authenticated request runs in one transaction that reads and writes
 * as its user (ADR 0009, #557): `JwtGuard` has set `request.user`, and
 * `DatabaseService.asOwner` sets `app.user_id` for the transaction. A
 * failure rolls the whole request back.
 */
@Injectable()
export class OwnerScopeInterceptor implements NestInterceptor {
  constructor(
    private readonly database: DatabaseService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle()
    const owner = context.switchToHttp().getRequest<FastifyRequest>().user?.sub
    if (
      !owner ||
      // Specs that replace the database with a double of `db` only.
      !(this.database instanceof DatabaseService) ||
      this.reflector.getAllAndOverride<boolean>(WITHOUT_OWNER_SCOPE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return next.handle()
    }
    return from(
      this.database.asOwner(owner, () =>
        lastValueFrom(next.handle(), { defaultValue: undefined }),
      ),
    )
  }
}
