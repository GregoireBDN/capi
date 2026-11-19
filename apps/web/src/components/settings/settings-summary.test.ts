import { describe, expect, it } from 'vitest'
import { accessSummary, countLabel, securitySummary } from './settings-summary'

describe('countLabel', () => {
  it('spells out none, one and several', () => {
    expect(countLabel(0, 'règle', 'règles', 'Aucune règle')).toBe(
      'Aucune règle',
    )
    expect(countLabel(1, 'règle', 'règles', 'Aucune règle')).toBe('1 règle')
    expect(countLabel(32, 'règle', 'règles', 'Aucune règle')).toBe('32 règles')
  })
})

describe('securitySummary', () => {
  it('names the password, then the passkeys and sessions', () => {
    expect(securitySummary(2, 3)).toBe('Mot de passe, 2 passkeys, 3 sessions')
    expect(securitySummary(0, 1)).toBe(
      'Mot de passe, aucune passkey, 1 session',
    )
  })

  it('leaves out what is still loading', () => {
    expect(securitySummary(undefined, undefined)).toBe('Mot de passe')
    expect(securitySummary(1, undefined)).toBe('Mot de passe, 1 passkey')
  })
})

describe('accessSummary', () => {
  it('counts the tokens and the connected apps', () => {
    expect(accessSummary(1, 0)).toBe('1 jeton, aucune app connectée')
    expect(accessSummary(2, 1)).toBe('2 jetons, 1 app connectée')
    expect(accessSummary(0, 3)).toBe('Aucun jeton, 3 apps connectées')
  })

  it('leaves the apps out while remote access is off', () => {
    expect(accessSummary(0, null)).toBe('Aucun jeton')
  })
})
