import { describe, expect, it } from 'vitest'
import {
  attempted,
  callLines,
  describeCall,
  endLabel,
  formatAge,
  lastUseLabel,
} from './access-labels'

const NOW = new Date('2026-11-19T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000

describe('formatAge', () => {
  it('counts minutes, hours and days, then gives the day', () => {
    expect(formatAge(ago(20_000), NOW)).toBe('à l’instant')
    expect(formatAge(ago(3 * MIN), NOW)).toBe('il y a\u00a03\u00a0min')
    expect(formatAge(ago(125 * MIN), NOW)).toBe('il y a\u00a02\u00a0h')
    expect(formatAge(ago(4 * 24 * 60 * MIN), NOW)).toBe('il y a\u00a04\u00a0j')
    expect(formatAge('2026-09-03T10:00:00Z', NOW)).toBe('le 3 sept. 2026')
  })
})

describe('lastUseLabel / endLabel', () => {
  it('says when it was used and until when', () => {
    expect(lastUseLabel(null, NOW)).toBe('jamais utilisé')
    expect(lastUseLabel(ago(125 * MIN), NOW)).toBe(
      'utilisé il y a\u00a02\u00a0h',
    )
    expect(endLabel(null, false)).toBe('sans limite')
    expect(endLabel('2027-02-17T10:00:00Z', false)).toBe(
      'jusqu’au 17 févr. 2027',
    )
    expect(endLabel('2026-11-01T10:00:00Z', true)).toBe('expiré le 1 nov. 2026')
  })
})

describe('describeCall', () => {
  it('tells reads and writes in plain words', () => {
    expect(describeCall('GET', '/api/transactions')).toBe('a lu les opérations')
    expect(describeCall('GET', '/api/dashboard/review')).toBe(
      'a lu la revue du mois',
    )
    expect(describeCall('PATCH', '/api/transactions/:id')).toBe(
      'a modifié une opération',
    )
    expect(describeCall('PATCH', '/api/transactions/:id', 3)).toBe(
      'a modifié 3 opérations',
    )
    expect(describeCall('POST', '/api/imports/:id/commit')).toBe(
      'a importé un relevé',
    )
  })

  it('falls back on reads and changes it does not know', () => {
    expect(describeCall('GET', '/api/something/new')).toBe('a lu des données')
    expect(describeCall('GET', '/api/something/new', 2)).toBe(
      'a lu des données (2 fois)',
    )
    expect(describeCall('DELETE', '/api/transactions/:id')).toBe(
      'a voulu faire une modification',
    )
  })
})

describe('attempted', () => {
  it('tells a refused call as an attempt', () => {
    expect(attempted('a ajouté une opération')).toBe(
      'a voulu ajouter une opération',
    )
    expect(attempted('a lu les comptes')).toBe('a voulu lire les comptes')
    expect(attempted('a mis à jour un avoir crypto')).toBe(
      'a voulu mettre à jour un avoir crypto',
    )
    expect(attempted('a voulu faire une modification')).toBe(
      'a voulu faire une modification',
    )
  })
})

describe('callLines', () => {
  const call = (
    id: string,
    method: string,
    route: string,
    minutesAgo: number,
    statusCode = 200,
  ) => ({ id, method, route, statusCode, createdAt: ago(minutesAgo * MIN) })

  it('folds identical calls in a row into one line with their count', () => {
    const lines = callLines([
      call('1', 'PATCH', '/api/transactions/:id', 1),
      call('2', 'PATCH', '/api/transactions/:id', 2),
      call('3', 'PATCH', '/api/transactions/:id', 3),
      call('4', 'GET', '/api/transactions', 4),
      call('5', 'DELETE', '/api/transactions/:id', 5, 403),
      call('6', 'GET', '/api/transactions', 60 * 24),
    ])
    expect(
      lines.map(({ label, refused, count }) => [label, refused, count]),
    ).toEqual([
      ['a modifié 3 opérations', false, 3],
      ['a lu les opérations', false, 1],
      ['a voulu faire une modification', true, 1],
      ['a lu les opérations', false, 1],
    ])
    expect(lines[0].id).toBe('1')
  })

  it('keeps refused and accepted calls apart', () => {
    const lines = callLines([
      call('1', 'GET', '/api/accounts', 1, 403),
      call('2', 'GET', '/api/accounts', 2),
    ])
    expect(lines).toHaveLength(2)
  })
})
