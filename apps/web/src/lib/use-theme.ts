import { useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'auto'

/** Fired on `window` whenever the stored theme changes, so every `useTheme` stays in sync. */
const THEME_CHANGE_EVENT = 'finances:theme-change'

function getStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto'
  const stored = window.localStorage.getItem('theme')
  if (stored === 'light' || stored === 'dark' || stored === 'auto')
    return stored
  return 'auto'
}

export function applyThemeMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = mode === 'auto' ? (prefersDark ? 'dark' : 'light') : mode
  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(resolved)
  if (mode === 'auto') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', mode)
  }
  document.documentElement.style.colorScheme = resolved
}

/** Apply a theme, remember it locally and notify every mounted `useTheme`. */
export function storeThemeMode(mode: ThemeMode) {
  applyThemeMode(mode)
  window.localStorage.setItem('theme', mode)
  window.dispatchEvent(
    new CustomEvent<ThemeMode>(THEME_CHANGE_EVENT, { detail: mode }),
  )
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>('auto')

  useEffect(() => {
    const m = getStoredMode()
    setMode(m)
    applyThemeMode(m)

    const onThemeChange = (event: Event) =>
      setMode((event as CustomEvent<ThemeMode>).detail)
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange)
  }, [])

  useEffect(() => {
    if (mode !== 'auto') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemeMode('auto')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [mode])

  return { mode, setThemeMode: storeThemeMode }
}
