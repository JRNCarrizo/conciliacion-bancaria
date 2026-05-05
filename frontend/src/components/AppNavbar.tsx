import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
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
          <ThemeToggle className="app-navbar-theme" />
          {isAuthenticated && user ? (
            <>
              <ChatNavbarTrigger />
              <div className="app-navbar-session">
                <span className="app-navbar-user" title={user.role}>
                  <span className="app-navbar-user-name">{user.username}</span>
                  <span className="app-navbar-user-role">{ROLE_LABEL[user.role] ?? user.role}</span>
                </span>
                <button type="button" className="btn-secondary app-navbar-logout" onClick={() => logout()}>
                  Salir
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
    </header>
  )
}
