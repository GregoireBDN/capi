import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { inlineHashes, offlinePageHeaders } from '../../plugins/offline-csp'

const OFFLINE_HTML = path.resolve(
  import.meta.dirname,
  '../../public/offline.html',
)

describe('offline page headers', () => {
  it('allows its own inline style and script by hash, and nothing else', () => {
    const headers = offlinePageHeaders(OFFLINE_HTML)
    const policy = headers['content-security-policy'] ?? ''

    expect(policy).toMatch(/^default-src 'none'; /)
    expect(policy).toMatch(/script-src 'sha256-[A-Za-z0-9+/]+=*';/)
    expect(policy).toMatch(/style-src 'sha256-[A-Za-z0-9+/]+=*';/)
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).not.toContain('unsafe')
    expect(headers['x-frame-options']).toBe('DENY')
  })

  it('has no inline event handlers or style attributes a hash could not cover', () => {
    const html = readFileSync(OFFLINE_HTML, 'utf8')

    expect(html).not.toMatch(/\son[a-z]+=/i)
    expect(html).not.toMatch(/\sstyle=/i)
  })

  it('hashes each element, and denies when there is none', () => {
    const html = '<style>a{}</style><script>1</script><script>2</script>'

    expect(inlineHashes(html, 'script')).toHaveLength(2)
    expect(inlineHashes(html, 'style')).toHaveLength(1)
    expect(inlineHashes('<p></p>', 'script')).toEqual(["'none'"])
  })
})
