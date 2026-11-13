import { useCallback } from 'react'
import { toast } from 'sonner'
import { profileControllerUpdate } from '#/api'
import { useAuth } from '#/lib/auth-context'
import { useTheme } from '#/lib/use-theme'
import type { ThemeMode } from '#/lib/use-theme'

/**
 * The user's theme: applied immediately on this device, then saved on the
 * account so it follows them to their other devices.
 */
export function useThemePreference() {
  const { mode, setThemeMode } = useTheme()
  const { refresh } = useAuth()

  const setPreference = useCallback(
    async (value: ThemeMode) => {
      setThemeMode(value)
      const res = await profileControllerUpdate({
        body: { theme: value },
        throwOnError: false,
      })
      if (res.error) {
        toast.error('Impossible de sauvegarder le thème')
        return
      }
      await refresh()
    },
    [setThemeMode, refresh],
  )

  return { mode, setPreference }
}
