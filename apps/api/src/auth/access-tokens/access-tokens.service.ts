import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { and, count, desc, eq, gt, isNull, lt, or } from 'drizzle-orm'
import * as crypto from 'node:crypto'
import {
  ACCESS_TOKEN_AUDIT_PRUNE_INTERVAL_MS,
  ACCESS_TOKEN_AUDIT_RETENTION_DAYS,
  ACCESS_TOKEN_DISPLAY_LENGTH,
  ACCESS_TOKEN_ERRORS,
  ACCESS_TOKEN_PATTERN,
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_RANDOM_BYTES,
  LAST_USED_RESOLUTION_MS,
  MAX_ACTIVE_ACCESS_TOKENS,
} from '#/auth/access-tokens/access-tokens.constants'
import {
  type AccessTokenScope,
  accessTokenAuditTable,
  type PersonalAccessToken,
  personalAccessTokensTable,
} from '#/auth/access-tokens/access-tokens.schema'
import type {
  AccessTokenAuditEntryDto,
  AccessTokenDto,
  CreateAccessTokenDto,
  CreatedAccessTokenDto,
  UpdateAccessTokenDto,
} from '#/auth/access-tokens/dto/access-token.dto'
import { DatabaseService } from '#/database/database.service'

const DAY_MS = 24 * 60 * 60 * 1000

export const hashAccessToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex')

export interface AuthenticatedAccessToken {
  id: string
  userId: string
  scope: AccessTokenScope
}

export interface AccessTokenUse {
  tokenId: string
  method: string
  route: string
  statusCode: number
}

@Injectable()
export class AccessTokensService {
  private readonly logger = new Logger(AccessTokensService.name)
  private lastPruneAt = 0

  constructor(private readonly database: DatabaseService) {}

  private get db() {
    return this.database.db
  }

  /** A token is active until revoked or past its expiry. */
  private static activeCondition(now: Date) {
    return and(
      isNull(personalAccessTokensTable.revokedAt),
      or(
        isNull(personalAccessTokensTable.expiresAt),
        gt(personalAccessTokensTable.expiresAt, now),
      ),
    )
  }

  private static toDto(row: PersonalAccessToken, now: Date): AccessTokenDto {
    return {
      id: row.id,
      name: row.name,
      tokenPrefix: row.tokenPrefix,
      scope: row.scope,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      expired: row.expiresAt !== null && row.expiresAt <= now,
    }
  }

  async create(
    userId: string,
    input: CreateAccessTokenDto,
    now = new Date(),
  ): Promise<CreatedAccessTokenDto> {
    const [{ active }] = await this.db
      .select({ active: count() })
      .from(personalAccessTokensTable)
      .where(
        and(
          eq(personalAccessTokensTable.userId, userId),
          AccessTokensService.activeCondition(now),
        ),
      )
    if (active >= MAX_ACTIVE_ACCESS_TOKENS) {
      throw new BadRequestException(ACCESS_TOKEN_ERRORS.TOO_MANY)
    }

    const token =
      ACCESS_TOKEN_PREFIX +
      crypto.randomBytes(ACCESS_TOKEN_RANDOM_BYTES).toString('base64url')
    const [row] = await this.db
      .insert(personalAccessTokensTable)
      .values({
        userId,
        name: input.name.trim(),
        tokenHash: hashAccessToken(token),
        tokenPrefix: token.slice(0, ACCESS_TOKEN_DISPLAY_LENGTH),
        scope: input.scope,
        expiresAt: input.expiresInDays
          ? new Date(now.getTime() + input.expiresInDays * DAY_MS)
          : null,
        createdAt: now,
      })
      .returning()
    return { ...AccessTokensService.toDto(row, now), token }
  }

  /** Tokens not revoked, newest first; expired ones are kept so the owner sees why a script stopped. */
  async list(userId: string, now = new Date()): Promise<AccessTokenDto[]> {
    const rows = await this.db
      .select()
      .from(personalAccessTokensTable)
      .where(
        and(
          eq(personalAccessTokensTable.userId, userId),
          isNull(personalAccessTokensTable.revokedAt),
        ),
      )
      .orderBy(desc(personalAccessTokensTable.createdAt))
    return rows.map((row) => AccessTokensService.toDto(row, now))
  }

  /** Renames a token that is not revoked (an expired one too). */
  async rename(
    userId: string,
    id: string,
    input: UpdateAccessTokenDto,
    now = new Date(),
  ): Promise<AccessTokenDto> {
    const name = input.name.trim()
    if (name === '') throw new BadRequestException('Name is required')
    const [row] = await this.db
      .update(personalAccessTokensTable)
      .set({ name })
      .where(
        and(
          eq(personalAccessTokensTable.id, id),
          eq(personalAccessTokensTable.userId, userId),
          isNull(personalAccessTokensTable.revokedAt),
        ),
      )
      .returning()
    if (!row) throw new NotFoundException(ACCESS_TOKEN_ERRORS.NOT_FOUND)
    return AccessTokensService.toDto(row, now)
  }

  async revoke(userId: string, id: string, now = new Date()): Promise<void> {
    const [row] = await this.db
      .update(personalAccessTokensTable)
      .set({ revokedAt: now })
      .where(
        and(
          eq(personalAccessTokensTable.id, id),
          eq(personalAccessTokensTable.userId, userId),
          isNull(personalAccessTokensTable.revokedAt),
        ),
      )
      .returning({ id: personalAccessTokensTable.id })
    if (!row) throw new NotFoundException(ACCESS_TOKEN_ERRORS.NOT_FOUND)
  }

  /**
   * Resolves a presented token, or null when it is malformed, unknown, revoked
   * or expired. Records the last use (at most once per `LAST_USED_RESOLUTION_MS`).
   */
  async authenticate(
    token: string,
    now = new Date(),
  ): Promise<AuthenticatedAccessToken | null> {
    if (!ACCESS_TOKEN_PATTERN.test(token)) return null
    const [row] = await this.db
      .select({
        id: personalAccessTokensTable.id,
        userId: personalAccessTokensTable.userId,
        scope: personalAccessTokensTable.scope,
      })
      .from(personalAccessTokensTable)
      .where(
        and(
          eq(personalAccessTokensTable.tokenHash, hashAccessToken(token)),
          AccessTokensService.activeCondition(now),
        ),
      )
      .limit(1)
    if (!row) return null

    await this.db
      .update(personalAccessTokensTable)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(personalAccessTokensTable.id, row.id),
          or(
            isNull(personalAccessTokensTable.lastUsedAt),
            lt(
              personalAccessTokensTable.lastUsedAt,
              new Date(now.getTime() - LAST_USED_RESOLUTION_MS),
            ),
          ),
        ),
      )
    return row
  }

  /** Appends an audit row; prunes rows past the retention period now and then. */
  async recordUse(use: AccessTokenUse, now = new Date()): Promise<void> {
    await this.db
      .insert(accessTokenAuditTable)
      .values({ ...use, createdAt: now })
    if (
      now.getTime() - this.lastPruneAt >=
      ACCESS_TOKEN_AUDIT_PRUNE_INTERVAL_MS
    ) {
      this.lastPruneAt = now.getTime()
      const cutoff = new Date(
        now.getTime() - ACCESS_TOKEN_AUDIT_RETENTION_DAYS * DAY_MS,
      )
      await this.db
        .delete(accessTokenAuditTable)
        .where(lt(accessTokenAuditTable.createdAt, cutoff))
        .catch((error: unknown) => {
          this.logger.warn(
            `Pruning the access token audit failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          )
        })
    }
  }

  /** Latest calls made with the owner's tokens (revoked ones included), newest first. */
  async audit(
    userId: string,
    limit: number,
    tokenId?: string,
  ): Promise<AccessTokenAuditEntryDto[]> {
    const rows = await this.db
      .select({
        id: accessTokenAuditTable.id,
        tokenId: accessTokenAuditTable.tokenId,
        tokenName: personalAccessTokensTable.name,
        method: accessTokenAuditTable.method,
        route: accessTokenAuditTable.route,
        statusCode: accessTokenAuditTable.statusCode,
        createdAt: accessTokenAuditTable.createdAt,
      })
      .from(accessTokenAuditTable)
      .innerJoin(
        personalAccessTokensTable,
        eq(personalAccessTokensTable.id, accessTokenAuditTable.tokenId),
      )
      .where(
        and(
          eq(personalAccessTokensTable.userId, userId),
          tokenId === undefined
            ? undefined
            : eq(accessTokenAuditTable.tokenId, tokenId),
        ),
      )
      .orderBy(
        desc(accessTokenAuditTable.createdAt),
        desc(accessTokenAuditTable.id),
      )
      .limit(limit)
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }))
  }
}
