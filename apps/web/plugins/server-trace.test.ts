import { describe, expect, it } from 'vitest'
import {
  SERVER_RUNTIME_PACKAGES,
  SERVER_TRACE_EXCLUDE,
  assertServerTrace,
  serverTraceDeps,
} from './server-trace'

describe('server trace (#242)', () => {
  it('negates every excluded tool for Nitro traceDeps', () => {
    expect(serverTraceDeps()).toContain('!vite')
    expect(serverTraceDeps()).toContain('!playwright')
    expect(serverTraceDeps()).toHaveLength(SERVER_TRACE_EXCLUDE.length)
    expect(serverTraceDeps().every((d) => d.startsWith('!'))).toBe(true)
  })

  it('never excludes a runtime package', () => {
    for (const name of SERVER_TRACE_EXCLUDE) {
      expect(SERVER_RUNTIME_PACKAGES.has(name)).toBe(false)
    }
  })

  it('accepts the known runtime externals', () => {
    expect(() => assertServerTrace({})).not.toThrow()
    expect(() => assertServerTrace({ tslib: { versions: {} } })).not.toThrow()
  })

  it('fails on anything else, naming the packages', () => {
    expect(() =>
      assertServerTrace({ tslib: {}, vite: {}, esbuild: {} }),
    ).toThrow(/esbuild, vite/)
  })
})
