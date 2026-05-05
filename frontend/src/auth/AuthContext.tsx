import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { getStoredToken, setStoredToken } from '../api/client'
import type { AuthUser } from './types'

const AUTH_USER_KEY = 'conciliacion.auth'

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as AuthUser
    if (o?.username && o?.role && typeof o.userId === 'number') return o as AuthUser
    return null
  } catch {
    return null
  }
}

type AuthContextValue = {
  user: AuthUser | null
  isAuthenticated: boolean
  setSession: (token: string, user: AuthUser) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser())

  useEffect(() => {
    const t = getStoredToken()
    const u = readStoredUser()
    if (t && !u) {
      setStoredToken(null)
      setUser(null)
      return
    }
    if (!t && u) {
      localStorage.removeItem(AUTH_USER_KEY)
      setUser(null)
      return
    }
    setUser(t && u ? u : null)
  }, [])

  const setSession = useCallback((token: string, u: AuthUser) => {
    setStoredToken(token)
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(u))
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    setStoredToken(null)
    localStorage.removeItem(AUTH_USER_KEY)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user != null && getStoredToken() != null,
      setSession,
      logout,
    }),
    [user, setSession, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
