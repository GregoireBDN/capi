import { describe, expect, it } from 'vitest'
import type { WalletSyncStatusDto } from '#/api/types.gen'
import {
  chainFailureText,
  nextAttemptText,
  retryTimeText,
  syncFailedToast,
} from './wallet-sync-status'

const NOW = new Date('2026-11-06T10:00:00Z') // 11:00 in Paris

const failed: WalletSyncStatusDto = {
  enabled: true,
  syncedAt: '2026-11-05T09:00:00.000Z',
  failedAt: '2026-11-06T09:59:00.000Z',
  failedChains: [
    { chain: 'polygon', reason: 'timeout', retryAt: null },
    { chain: 'bsc', reason: 'rate_limited', retryAt: '2026-11-07T08:00:00Z' },
  ],
  retryAt: '2026-11-07T08:00:00Z',
  syncing: false,
}

describe('wallet sync status texts', () => {
  it('states the retry time in Paris, with the day when it is not today', () => {
    expect(retryTimeText('2026-11-06T10:30:00Z', NOW)).toBe('à 11:30')
    expect(retryTimeText('2026-11-07T08:00:00Z', NOW)).toBe(
      'le 7 novembre à 09:00',
    )
  })

  it('names each chain and why, with a retry only while it waits', () => {
    expect(failed.failedChains.map((f) => chainFailureText(f, NOW))).toEqual([
      'Polygon : délai dépassé',
      'BNB Chain : trop de requêtes, nouvel essai possible le 7 novembre à 09:00',
    ])
    expect(
      chainFailureText(
        {
          chain: 'bitcoin',
          reason: 'rate_limited',
          retryAt: '2026-11-06T09:00:00Z',
        },
        NOW,
      ),
    ).toBe('Bitcoin : trop de requêtes')
    expect(nextAttemptText(failed, NOW)).toBe(
      'Prochain essai possible le 7 novembre à 09:00',
    )
    expect(nextAttemptText({ ...failed, retryAt: null }, NOW)).toBeNull()
  })

  it('tells after "Synchroniser" what was kept', () => {
    expect(syncFailedToast(failed, NOW)).toBe(
      'Lecture impossible pour Polygon, BNB Chain (nouvel essai possible le 7 novembre à 09:00) : les derniers avoirs connus sont conservés.',
    )
    expect(
      syncFailedToast({ ...failed, failedChains: [], retryAt: null }, NOW),
    ).toBe(
      'Synchronisation impossible pour le moment : les derniers avoirs connus sont conservés.',
    )
  })
})
