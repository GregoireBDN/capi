import { Injectable, NotFoundException } from '@nestjs/common'
import * as crypto from 'node:crypto'
import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { refreshTokensTable } from '#/auth/auth.schema'
import { SESSION_MAX_LIFETIME_MS } from '#/auth/auth.constants'
import { DatabaseService } from '#/database/database.service'
import type { SessionDto } from './session.dto'

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
    if (live.length === 0) return []

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

  /** Ends one of the user's active sessions; 404 when there is none. */
  async revoke(userId: string, sessionId: string): Promise<void> {
    const revoked = await this.db.db
      .update(refreshTokensTable)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokensTable.familyId, sessionId),
          eq(refreshTokensTable.userId, userId),
          isNull(refreshTokensTable.revokedAt),
        ),
      )
      .returning({ id: refreshTokensTable.id })
    if (revoked.length === 0) throw new NotFoundException('Session not found')
  }
}
