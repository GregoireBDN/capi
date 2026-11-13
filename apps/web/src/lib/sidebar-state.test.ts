import { describe, expect, it } from 'vitest'

import { parseSidebarOpen } from './sidebar-state'

describe('parseSidebarOpen', () => {
  it('shows the sidebar when nothing was remembered', () => {
    expect(parseSidebarOpen(undefined)).toBe(true)
    expect(parseSidebarOpen('')).toBe(true)
    expect(parseSidebarOpen('theme=dark; token=abc')).toBe(true)
  })

  it('restores a hidden sidebar', () => {
    expect(parseSidebarOpen('sidebar_state=false')).toBe(false)
    expect(parseSidebarOpen('token=abc; sidebar_state=false; theme=dark')).toBe(
      false,
    )
  })

  it('restores a shown sidebar', () => {
    expect(parseSidebarOpen('token=abc;sidebar_state=true')).toBe(true)
  })

  it('ignores cookies whose name only contains the key', () => {
    expect(parseSidebarOpen('old_sidebar_state=false')).toBe(true)
  })
})
