import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { authControllerLogout, authControllerMe } from '#/api'
import type { UserDto } from '#/api/types.gen'
import { forgetCurrentUser } from '#/lib/current-user'
import { rememberSignedOut } from '#/lib/demo-sign-in'
import { storeThemeMode } from '#/lib/use-theme'

type AuthState = {
  user: UserDto | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const res = await authControllerMe({ throwOnError: false })
    if (!res.error && res.data) {
      setUser(res.data)
      storeThemeMode(res.data.theme)
    } else if (res.response?.status === 401) {
      // Only a 401 means signed out; a 429 / 5xx / network error keeps the
      // user already known (#292).
      setUser(null)
    }
    setLoading(false)
  }, [])

  const logout = useCallback(async () => {
    await authControllerLogout({ throwOnError: false })
    rememberSignedOut()
    forgetCurrentUser()
    setUser(null)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
