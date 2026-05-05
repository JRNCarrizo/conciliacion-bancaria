import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import type { AppRole, AuthUser } from '../auth/types'
import { BrandLogo } from '../components/BrandLogo'
import { parseError } from '../features/conciliacion/api/http'
import './auth.css'

type LoginJson = {
  token: string
  username: string
  role: AppRole
}

export function LoginPage() {
  const { setSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  /** Evita que el navegador rellene usuario/clave guardados antes de que el usuario enfoque el campo */
  const [usernameReadOnly, setUsernameReadOnly] = useState(true)
  const [passwordReadOnly, setPasswordReadOnly] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      if (!r.ok) throw new Error(await parseError(r))
      const data = (await r.json()) as LoginJson
      const u: AuthUser = { username: data.username, role: data.role }
      setSession(data.token, u)
      navigate(from === '/login' ? '/' : from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page auth-page--login">
      <div className="auth-card auth-card--login card">
        <div className="auth-brand auth-brand--plain">
          <BrandLogo className="auth-brand-logo" alt="" />
        </div>
        <h1 className="auth-title auth-title--center">Iniciar sesión</h1>
        <form className="auth-form" onSubmit={onSubmit} autoComplete="off">
          <label className="auth-label">
            Usuario
            <input
              className="auth-input"
              name="username"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              readOnly={usernameReadOnly}
              onFocus={() => setUsernameReadOnly(false)}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label className="auth-label">
            Contraseña
            <input
              className="auth-input"
              name="password"
              type="password"
              autoComplete="off"
              readOnly={passwordReadOnly}
              onFocus={() => setPasswordReadOnly(false)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <p className="msg err">{error}</p>}
          <button type="submit" className="btn-import" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p className="auth-hint">
          ¿Primera vez? Si el sistema aún no tiene admin, usá
          <br />
          <Link to="/setup">alta del administrador</Link>.
        </p>
        <p className="auth-back">
          <Link to="/">Volver al inicio</Link>
        </p>
      </div>
    </div>
  )
}
