import { describe, expect, it } from 'vitest'
import { assertDemoTarget, databaseNameOf, DemoTargetError } from './guard'

const url = (name: string) => `postgres://user:password@localhost:5432/${name}`

describe('assertDemoTarget', () => {
  it('accepts throwaway databases and returns their name', () => {
    expect(assertDemoTarget(url('finances_demo'), 'development')).toBe(
      'finances_demo',
    )
    expect(assertDemoTarget(url('finances_test'), undefined)).toBe(
      'finances_test',
    )
  })

  it('refuses the app database, whatever its case', () => {
    expect(() => assertDemoTarget(url('finances'), 'development')).toThrow(
      DemoTargetError,
    )
    expect(() => assertDemoTarget(url('Finances'), undefined)).toThrow(
      /app database/,
    )
  })

  it('refuses production, even on a throwaway database', () => {
    expect(() => assertDemoTarget(url('finances_demo'), 'production')).toThrow(
      /NODE_ENV=production/,
    )
  })

  it('refuses a URL without a database name', () => {
    expect(() =>
      assertDemoTarget('postgres://user:password@localhost:5432', 'test'),
    ).toThrow(/names no database/)
    expect(() => assertDemoTarget('not a url', 'test')).toThrow(DemoTargetError)
  })
})

describe('databaseNameOf', () => {
  it('decodes the path of the URL', () => {
    expect(databaseNameOf(url('finances%5Fdemo'))).toBe('finances_demo')
    expect(databaseNameOf(`${url('finances_demo')}?sslmode=disable`)).toBe(
      'finances_demo',
    )
  })
})
