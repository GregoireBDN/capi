import { describe, expect, it } from 'vitest'
import type { PortfolioAccountDto } from '#/api/types.gen'
import {
  accountFreshness,
  ageText,
  changePercentText,
  deltaTone,
} from './portfolio-view'

const NOW = new Date('2026-11-19T10:00:00Z')

function account(patch: Partial<PortfolioAccountDto>): PortfolioAccountDto {
  return {
    accountId: '00000000-0000-4000-8000-000000000001',
    name: 'Compte',
    institution: null,
    source: 'manual',
    provider: null,
    valueCents: 0,
    holdingCount: 0,
    missingPriceCount: 0,
    updatedAt: null,
    sync: null,
    ...patch,
  }
}

const sync = (patch: Partial<NonNullable<PortfolioAccountDto['sync']>>) => ({
  enabled: true,
  syncedAt: null,
  failedAt: null,
  failedChains: [],
  retryAt: null,
  syncing: false,
  ...patch,
})

describe('changePercentText', () => {
  it('signs the change and rounds it to a tenth', () => {
    expect(changePercentText('2.4')).toMatch(/^\+2,4\s%$/)
    expect(changePercentText('-1.2346')).toMatch(/^-1,2\s%$/)
    expect(changePercentText('0')).toMatch(/^0\s%$/)
  })
})

describe('deltaTone', () => {
  it('tones gains and losses only', () => {
    expect(deltaTone(5)).toBe('text-chart-delta-good')
    expect(deltaTone(-5)).toBe('text-chart-delta-bad')
    expect(deltaTone(0)).toBeUndefined()
  })
})

describe('ageText', () => {
  it('counts recent times and dates older ones', () => {
    expect(ageText('2026-11-19T09:54:00Z', NOW)).toBe('il y a 6 min')
    expect(ageText('2026-11-16T10:00:00Z', NOW)).toBe('il y a 3 j')
    expect(ageText('2026-10-12T10:00:00Z', NOW)).toBe('le 12 oct.')
    expect(ageText('2026-10-01T10:00:00Z', NOW)).toBe('le 1er oct.')
  })
})

describe('accountFreshness', () => {
  it('asks an exchange for its first or a newer export', () => {
    expect(accountFreshness(account({ source: 'exchange' }), NOW)).toEqual({
      text: 'Plateforme · aucun export',
      warning: 'à importer',
    })
    expect(
      accountFreshness(
        account({ source: 'exchange', updatedAt: '2026-11-17T10:00:00Z' }),
        NOW,
      ),
    ).toEqual({
      text: 'Plateforme · export importé il y a 2 j',
      warning: null,
    })
    expect(
      accountFreshness(
        account({ source: 'exchange', updatedAt: '2026-09-02T10:00:00Z' }),
        NOW,
      ).warning,
    ).toBe('à mettre à jour')
  })

  it('says a wallet is being read while its sync runs (#381)', () => {
    expect(
      accountFreshness(
        account({
          source: 'wallet',
          updatedAt: '2026-11-19T09:54:00Z',
          sync: sync({ syncedAt: '2026-11-19T09:54:00Z', syncing: true }),
        }),
        NOW,
      ),
    ).toEqual({ text: 'Wallet · lecture en cours…', warning: null })
  })

  it('says when a wallet was read, or why not', () => {
    const read = '2026-11-19T09:54:00Z'
    expect(
      accountFreshness(
        account({
          source: 'wallet',
          updatedAt: read,
          sync: sync({ syncedAt: read }),
        }),
        NOW,
      ),
    ).toEqual({ text: 'Wallet · lu il y a 6 min', warning: null })
    expect(
      accountFreshness(
        account({
          source: 'wallet',
          updatedAt: read,
          sync: sync({ syncedAt: read, failedAt: read }),
        }),
        NOW,
      ).warning,
    ).toBe('lecture en échec')
    expect(
      accountFreshness(account({ source: 'wallet', sync: sync({}) }), NOW),
    ).toEqual({ text: 'Wallet · jamais lu', warning: 'à lire' })
    expect(
      accountFreshness(
        account({ source: 'wallet', sync: sync({ enabled: false }) }),
        NOW,
      ),
    ).toEqual({ text: 'Wallet · synchro désactivée', warning: null })
  })

  it('dates the last line edited by hand', () => {
    expect(
      accountFreshness(account({ updatedAt: '2026-10-02T10:00:00Z' }), NOW),
    ).toEqual({ text: 'Saisie manuelle · modifiée le 2 oct.', warning: null })
    expect(accountFreshness(account({}), NOW).text).toBe(
      'Saisie manuelle · vide',
    )
  })
})
