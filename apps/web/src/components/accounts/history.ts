import type { AccountPerformanceDto, SnapshotDto } from '#/api/types.gen'

/**
 * The points of an account's « Évolution » (#366): its stored values, then,
 * for a crypto account, today's live value (holdings × the last known
 * prices, never stored) as the last point.
 */
export function historyPoints(
  performance: Pick<AccountPerformanceDto, 'snapshots' | 'live'>,
): SnapshotDto[] {
  const { snapshots, live } = performance
  if (!live) return snapshots
  return [
    ...snapshots.filter((snapshot) => snapshot.date < live.date),
    {
      id: `live-${live.date}`,
      date: live.date,
      valueCents: live.valueCents,
      contributionsCents: live.contributionsCents,
      note: null,
      source: 'computed',
    },
  ]
}
