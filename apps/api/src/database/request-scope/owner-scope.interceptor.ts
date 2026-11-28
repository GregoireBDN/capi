import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import { from, lastValueFrom, type Observable } from 'rxjs'
import { DatabaseService } from '#/database/database.service'
import { ownedTableOf } from './owned-params'
import '#/auth/request-user'

export const WITHOUT_OWNER_SCOPE = 'withoutOwnerScope'

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
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const owner = request.user?.sub
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
      this.database.asOwner(owner, async () => {
        await this.assertOwnsPathRows(request, owner)
        return lastValueFrom(next.handle(), { defaultValue: undefined })
      }),
    )
  }

  /**
   * The second lock (ADR 0009, #558): every row a path names is the
   * caller's, checked on `user_id` against the signed-in user, not on the
   * policies, so a route answers 404 for someone else's id even if row-level
   * security were off. An id that is not a UUID is left to the route's pipe.
   */
  private async assertOwnsPathRows(request: FastifyRequest, owner: string) {
    const route = request.routeOptions?.url ?? ''
    const params = (request.params ?? {}) as Record<string, string>
    for (const [name, value] of Object.entries(params)) {
      if (!UUID.test(value)) continue
      const table = ownedTableOf(route, name)
      if (!table) continue
      const [row] = await this.database.db
        .select({ found: sql<number>`1` })
        .from(table)
        .where(and(eq(table.id, value), eq(table.userId, owner)))
        .limit(1)
      if (!row) throw new NotFoundException()
    }
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
