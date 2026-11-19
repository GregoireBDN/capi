import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import * as crypto from 'node:crypto'
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { refreshTokensTable } from '#/auth/auth.schema'
import { SESSION_MAX_LIFETIME_MS } from '#/auth/auth.constants'
import { DatabaseService } from '#/database/database.service'
import type { SessionDto } from './session.dto'

/** How long a session ended by reuse detection stays in the list (#292). */
export const REUSE_LISTED_FOR_MS = 30 * 24 * 60 * 60 * 1000

const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex')

/**
 * The owner's sessions (refresh-token families, ASVS 3.3.4, #217). A session is
 * active while it holds an unrevoked, unexpired refresh token within its
 * absolute lifetime. Ending one revokes its family: that device is signed out
 * at its next refresh (its access JWT lasts at most 15 minutes, as after a
 * logout).
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name)

  constructor(private readonly db: DatabaseService) {}

  async list(
    userId: string,
    currentRefreshToken: string | undefined,
    now = new Date(),
  ): Promise<SessionDto[]> {
    const live = await this.db.db
      .select({
        familyId: refreshTokensTable.familyId,
        tokenHash: refreshTokensTable.tokenHash,
        createdAt: refreshTokensTable.createdAt,
        expiresAt: refreshTokensTable.expiresAt,
        authenticatedAt: refreshTokensTable.authenticatedAt,
        signInMethod: refreshTokensTable.signInMethod,
        device: refreshTokensTable.device,
      })
      .from(refreshTokensTable)
      .where(
        and(
          eq(refreshTokensTable.userId, userId),
          isNull(refreshTokensTable.revokedAt),
          gt(refreshTokensTable.expiresAt, now),
        ),
      )
      .orderBy(desc(refreshTokensTable.createdAt))
    const sessions: SessionDto[] = []
    if (live.length > 0) {
      sessions.push(...(await this.active(live, currentRefreshToken, now)))
    }
    sessions.push(...(await this.endedForReuse(userId, now)))
    return sessions
  }

  private async active(
    live: {
      familyId: string
      tokenHash: string
      createdAt: Date
      expiresAt: Date
      authenticatedAt: Date | null
      signInMethod: 'password' | 'passkey' | 'sign_up' | null
      device: string | null
    }[],
    currentRefreshToken: string | undefined,
    now: Date,
  ): Promise<SessionDto[]> {
    // Families from before `authenticated_at` count from their first token.
    const familyIds = [...new Set(live.map((row) => row.familyId))]
    const starts = await this.db.db
      .select({
        familyId: refreshTokensTable.familyId,
        startedAt: sql<Date>`min(${refreshTokensTable.createdAt})`.mapWith(
          refreshTokensTable.createdAt,
        ),
      })
      .from(refreshTokensTable)
      .where(inArray(refreshTokensTable.familyId, familyIds))
      .groupBy(refreshTokensTable.familyId)
    const startOf = new Map(starts.map((row) => [row.familyId, row.startedAt]))

    const currentHash = currentRefreshToken
      ? hashToken(currentRefreshToken)
      : undefined
    const sessions: SessionDto[] = []
    const seen = new Set<string>()
    // Newest first: a family normally has one live token, else the latest wins.
    for (const row of live) {
      if (seen.has(row.familyId)) continue
      seen.add(row.familyId)
      const signedInAt =
        row.authenticatedAt ?? startOf.get(row.familyId) ?? row.createdAt
      if (signedInAt.getTime() + SESSION_MAX_LIFETIME_MS <= now.getTime())
        continue
      sessions.push({
        id: row.familyId,
        signInMethod: row.signInMethod ?? 'unknown',
        device: row.device,
        signedInAt: signedInAt.toISOString(),
        lastUsedAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        current: false,
        reuseDetectedAt: null,
      })
    }

    if (currentHash) {
      const current = live.find((row) => row.tokenHash === currentHash)
      const session = sessions.find((s) => s.id === current?.familyId)
      if (session) session.current = true
    }
    return sessions.sort(
      (a, b) =>
        Number(b.current) - Number(a.current) ||
        b.lastUsedAt.localeCompare(a.lastUsedAt),
    )
  }

  /**
   * Families burned by reuse detection in the last `REUSE_LISTED_FOR_MS`
   * (#292), newest first: one row each, ended at the burn.
   */
  private async endedForReuse(
    userId: string,
    now: Date,
  ): Promise<SessionDto[]> {
    const rows = await this.db.db
      .select({
        familyId: refreshTokensTable.familyId,
        signedInAt:
          sql<Date>`min(coalesce(${refreshTokensTable.authenticatedAt}, ${refreshTokensTable.createdAt}))`.mapWith(
            refreshTokensTable.createdAt,
          ),
        lastUsedAt: sql<Date>`max(${refreshTokensTable.createdAt})`.mapWith(
          refreshTokensTable.createdAt,
        ),
        endedAt: sql<Date>`max(${refreshTokensTable.revokedAt})`.mapWith(
          refreshTokensTable.revokedAt,
        ),
        signInMethod: sql<
          'password' | 'passkey' | 'sign_up' | null
        >`max(${refreshTokensTable.signInMethod})`,
        device: sql<string | null>`max(${refreshTokensTable.device})`,
      })
      .from(refreshTokensTable)
      .where(
        and(
          eq(refreshTokensTable.userId, userId),
          eq(refreshTokensTable.revokedReason, 'reuse'),
          gt(
            refreshTokensTable.revokedAt,
            new Date(now.getTime() - REUSE_LISTED_FOR_MS),
          ),
        ),
      )
      .groupBy(refreshTokensTable.familyId)
    return rows
      .map(
        (row): SessionDto => ({
          id: row.familyId,
          signInMethod: row.signInMethod ?? 'unknown',
          device: row.device,
          signedInAt: row.signedInAt.toISOString(),
          lastUsedAt: row.lastUsedAt.toISOString(),
          expiresAt: row.endedAt.toISOString(),
          current: false,
          reuseDetectedAt: row.endedAt.toISOString(),
        }),
      )
      .sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))
  }

  /** Ends one of the user's active sessions; 404 when there is none. */
  async revoke(userId: string, sessionId: string): Promise<void> {
    const revoked = await this.db.db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date(), revokedReason: 'signed_out' })
      .where(
        and(
          eq(refreshTokensTable.familyId, sessionId),
          eq(refreshTokensTable.userId, userId),
          isNull(refreshTokensTable.revokedAt),
        ),
      )
      .returning({ id: refreshTokensTable.id })
    if (revoked.length === 0) throw new NotFoundException('Session not found')
    this.logger.log('Session ended: signed_out')
  }
}
