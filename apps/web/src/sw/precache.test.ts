import { describe, expect, it } from 'vitest'
import {
  PUBLIC_SHELL_FILES,
  buildPrecacheManifest,
  isShellAsset,
} from './precache'

describe('isShellAsset', () => {
  it('keeps hashed code, styles, fonts and images', () => {
    for (const file of [
      'assets/main-abc123.js',
      'assets/globals-def456.css',
      'assets/font-789.woff2',
      'assets/logo-000.svg',
    ]) {
      expect(isShellAsset(file, 'sw.js')).toBe(true)
    }
  })

  it('skips the worker itself, source maps and hidden build metadata', () => {
    expect(isShellAsset('sw.js', 'sw.js')).toBe(false)
    expect(isShellAsset('assets/main-abc123.js.map', 'sw.js')).toBe(false)
    expect(isShellAsset('.vite/manifest.json', 'sw.js')).toBe(false)
    expect(isShellAsset('.vite/chunk.js', 'sw.js')).toBe(false)
  })
})

describe('PUBLIC_SHELL_FILES', () => {
  it('includes the offline page and leaves unrelated public files out', () => {
    expect(PUBLIC_SHELL_FILES).toContain('offline.html')
    expect(PUBLIC_SHELL_FILES).not.toContain('robots.txt')
  })
})

describe('buildPrecacheManifest', () => {
  const entries = [
    { fileName: 'offline.html', content: '<p>Hors ligne</p>' },
    { fileName: 'assets/main-abc123.js', content: 'console.warn(1)' },
  ]

  it('lists absolute paths in a stable order', () => {
    expect(buildPrecacheManifest(entries, 'sw').urls).toEqual([
      '/assets/main-abc123.js',
      '/offline.html',
    ])
  })

  it('derives the version from the content, not the order', () => {
    const a = buildPrecacheManifest(entries, 'sw')
    const b = buildPrecacheManifest([...entries].reverse(), 'sw')
    expect(a.version).toMatch(/^[0-9a-f]{12}$/)
    expect(b.version).toBe(a.version)
  })

  it('changes the version when a file, the list or the worker changes', () => {
    const base = buildPrecacheManifest(entries, 'sw').version
    const edited = [entries[0], { ...entries[1], content: 'console.warn(2)' }]
    expect(buildPrecacheManifest(edited, 'sw').version).not.toBe(base)
    expect(buildPrecacheManifest(entries.slice(1), 'sw').version).not.toBe(base)
    expect(buildPrecacheManifest(entries, 'sw2').version).not.toBe(base)
  })
})
