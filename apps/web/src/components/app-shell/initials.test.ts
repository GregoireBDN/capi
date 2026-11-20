import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('takes the first letter of the first two words, in capitals', () => {
    expect(initials('Camille Dupont')).toBe('CD')
    expect(initials('camille')).toBe('C')
    expect(initials('  Jean-Luc  Martin Petit ')).toBe('JL')
    expect(initials('élodie roux')).toBe('ÉR')
  })

  it('shows « ? » for an empty name', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
  })
})
