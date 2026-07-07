import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getLogoutCheckpointContext } from '../auth/logoutCheckpoint'
import { LogoutCheckpointModal, saveLogoutCheckpoint } from '../features/conciliacion/LogoutCheckpointModal'
import { ChatNavbarTrigger } from '../features/chat/ChatNavbarTrigger'
import { BrandLogo } from './BrandLogo'
import { ThemeToggle } from './ThemeToggle'
import './navbar.css'

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  OPERADOR: 'Operador',
  CONSULTA: 'Consulta',
}

export function AppNavbar() {
  const { user, isAuthenticated, logout } = useAuth()
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutPromptOpen, setLogoutPromptOpen] = useState(false)
  const [logoutSessionId, setLogoutSessionId] = useState<number | null>(null)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  async function finishLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
      setLogoutPromptOpen(false)
      setLogoutSessionId(null)
      setLogoutError(null)
    }
  }

  function handleLogoutClick() {
    if (loggingOut) return
    const ctx = getLogoutCheckpointContext()
    if (ctx) {
      setLogoutSessionId(ctx.sessionId)
      setLogoutError(null)
      setLogoutPromptOpen(true)
      return
    }
    void finishLogout()
  }

  async function handleLogoutWithCheckpoint(note: string) {
    if (logoutSessionId == null) return
    setLoggingOut(true)
    setLogoutError(null)
    try {
      await saveLogoutCheckpoint(logoutSessionId, note)
      await finishLogout()
    } catch (e) {
      setLogoutError(e instanceof Error ? e.message : String(e))
      setLoggingOut(false)
    }
  }

  return (
    <header className="app-navbar">
      <div className="app-navbar-inner">
        <Link to="/" className="app-navbar-brand">
          <span className="app-navbar-logo-frame" aria-hidden>
            <BrandLogo className="app-navbar-logo" alt="" />
          </span>
          <span className="app-navbar-title">Sistema de conciliación</span>
        </Link>

        <div className="app-navbar-actions">
          <div className="app-navbar-toolbar">
            <ThemeToggle className="app-navbar-theme" />
            {isAuthenticated && user ? <ChatNavbarTrigger /> : null}
          </div>

          {isAuthenticated && user ? (
            <>
              <div className="app-navbar-divider" aria-hidden />
              <div className="app-navbar-session">
                <div className="app-navbar-user" title={user.role}>
                  <span className="app-navbar-user-avatar" aria-hidden>
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                  <span className="app-navbar-user-text">
                    <span className="app-navbar-user-name">{user.username}</span>
                    <span
                      className={`app-navbar-user-role app-navbar-user-role--${user.role.toLowerCase()}`}
                    >
                      {ROLE_LABEL[user.role] ?? user.role}
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  className="app-navbar-logout"
                  disabled={loggingOut}
                  onClick={handleLogoutClick}
                >
                  {loggingOut ? 'Saliendo…' : 'Salir'}
                </button>
              </div>
            </>
          ) : (
            <div className="app-navbar-guest">
              <Link to="/login" className="app-navbar-link app-navbar-link--cta">
                Iniciar sesión
              </Link>
            </div>
          )}
        </div>
      </div>

      {logoutPromptOpen && logoutSessionId != null ? (
        <LogoutCheckpointModal
          sessionId={logoutSessionId}
          saving={loggingOut}
          error={logoutError}
          onCancel={() => {
            if (loggingOut) return
            setLogoutPromptOpen(false)
            setLogoutSessionId(null)
            setLogoutError(null)
          }}
          onConfirm={(note) => void handleLogoutWithCheckpoint(note)}
        />
      ) : null}
    </header>
  )
}
