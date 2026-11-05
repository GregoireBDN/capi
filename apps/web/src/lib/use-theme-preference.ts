import { useCallback } from 'react'
import { toast } from 'sonner'
import { userControllerUpdate } from '#/api'
import { useAuth } from '#/lib/auth-context'
import { useTheme } from '#/lib/use-theme'
import type { ThemeMode } from '#/lib/use-theme'

/**
 * The user's theme: applied immediately on this device, then saved on the
 * account so it follows them to their other devices.
 */
export function useThemePreference(userId: string) {
  const { mode, setThemeMode } = useTheme()
  const { refresh } = useAuth()

  const setPreference = useCallback(
    async (value: ThemeMode) => {
      setThemeMode(value)
      const res = await userControllerUpdate({
        path: { id: userId },
        body: { theme: value },
        throwOnError: false,
      })
      if (res.error) {
        toast.error('Impossible de sauvegarder le thème')
        return
      }
      await refresh()
    },
    [userId, setThemeMode, refresh],
  )

  return { mode, setPreference }
}
