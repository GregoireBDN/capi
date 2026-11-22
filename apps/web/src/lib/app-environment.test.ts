import { describe, expect, it } from 'vitest'
import { parseAppEnvironment } from './app-environment'

describe('parseAppEnvironment (#454)', () => {
  it('reads staging from the web service’s APP_ENVIRONMENT', () => {
    expect(parseAppEnvironment('staging')).toBe('staging')
    expect(parseAppEnvironment(' Staging ')).toBe('staging')
  })

  it('is production when unset or anything else, so production needs nothing', () => {
    expect(parseAppEnvironment(undefined)).toBe('production')
    expect(parseAppEnvironment(null)).toBe('production')
    expect(parseAppEnvironment('')).toBe('production')
    expect(parseAppEnvironment('production')).toBe('production')
    expect(parseAppEnvironment('stage')).toBe('production')
  })
})
