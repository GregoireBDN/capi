// Integrity checks (#427): integrity_checks reads GET /api/integrity, defaults
// to the previous month and names each finding's account and day.
// Synthetic names and amounts only.
import { describe, expect, it } from 'vitest'
import type { IntegrityDto } from '../api/types.js'
import { connect } from '../test/mock-api.js'

const ACCOUNT = '00000000-0000-4000-8000-0000000000a1'

const data: IntegrityDto = {
  month: '2026-10',
  checks: [
    { key: 'balances', scope: 'month', status: 'findings', count: 1 },
    { key: 'crypto', scope: 'current', status: 'failed', count: 0 },
    { key: 'owed', scope: 'current', status: 'ok', count: 0 },
    { key: 'totals', scope: 'month', status: 'findings', count: 1 },
  ],
  findings: [
    {
      check: 'balances',
      code: 'balance_gap',
      accountId: ACCOUNT,
      accountName: 'Compte test',
      date: '2026-10-20',
      fromDate: '2026-10-05',
      amountCents: -500,
      transactionId: null,
      asset: null,
      quantity: null,
      readQuantity: null,
    },
    {
      check: 'totals',
      code: 'internal_move_counted',
      accountId: ACCOUNT,
      accountName: 'Compte test',
      date: '2026-10-03',
      fromDate: null,
      amountCents: -20000,
      transactionId: '00000000-0000-4000-8000-0000000000b1',
      asset: null,
      quantity: null,
      readQuantity: null,
    },
  ],
}

describe('integrity_checks', () => {
  it('lists each check and finding with its account and day', async () => {
    const { call, calls, writes } = await connect({
      'GET /api/integrity': data,
    })
    const { text, isError } = await call('integrity_checks')
    expect(isError).toBe(false)
    // 14 November: the previous month by default.
    expect(calls[0]?.url.searchParams.get('month')).toBe('2026-10')
    expect(text).toContain('✗ Soldes bancaires : 1 point(s)')
    expect(text).toContain(
      'Compte test, le 20/10/2026 : le solde recalculé ne suit plus celui de la banque depuis le 05/10/2026 (-5,00 €).',
    )
    expect(text).toContain('? Quantités crypto (état actuel) : non vérifié')
    expect(text).toContain(
      '✓ Dépenses partagées (état actuel) : rien à signaler',
    )
    expect(text).toContain(
      'virement entre comptes du propriétaire compté comme dépense',
    )
    expect(writes()).toEqual([])
  })
})
