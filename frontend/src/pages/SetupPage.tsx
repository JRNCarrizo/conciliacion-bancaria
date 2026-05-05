import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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

export function SetupPage() {
  const { setSession } = useAuth()
  const navigate = useNavigate()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await fetch('/api/v1/auth/bootstrap-available')
        if (!r.ok) throw new Error(await parseError(r))
        const j = (await r.json()) as { available: boolean }
        if (!cancelled) setAvailable(j.available)
      } catch {
        if (!cancelled) setAvailable(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const r = await fetch('/api/v1/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      if (!r.ok) throw new Error(await parseError(r))
      const data = (await r.json()) as LoginJson
      const u: AuthUser = { username: data.username, role: data.role }
      setSession(data.token, u)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  if (available === null) {
    return (
      <div className="auth-page auth-page--login">
        <div className="auth-card auth-card--login card">
          <div className="auth-brand auth-brand--plain">
            <BrandLogo className="auth-brand-logo" alt="" />
          </div>
          <p className="msg auth-msg--center">Comprobando…</p>
        </div>
      </div>
    )
  }

  if (!available) {
    return (
      <div className="auth-page auth-page--login">
        <div className="auth-card auth-card--login card">
          <div className="auth-brand auth-brand--plain">
            <BrandLogo className="auth-brand-logo" alt="" />
          </div>
          <h1 className="auth-title auth-title--center">Alta inicial no disponible</h1>
          <p className="auth-sub auth-sub--center">Ya existe un administrador.</p>
          <p className="auth-back auth-back--split">
            <Link to="/login">Ir al login</Link>
            <span className="auth-back-sep" aria-hidden="true">
              ·
            </span>
            <Link to="/">Inicio</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page auth-page--login">
      <div className="auth-card auth-card--login card">
        <div className="auth-brand auth-brand--plain">
          <BrandLogo className="auth-brand-logo" alt="" />
        </div>
        <h1 className="auth-title auth-title--center">Alta del administrador</h1>
        <p className="auth-sub auth-sub--center auth-setup-lead">
          Creá la cuenta principal (rol administrador). Solo se puede hacer una vez.
        </p>
        <form className="auth-form" onSubmit={onSubmit}>
          <label className="auth-label">
            Usuario
            <input
              className="auth-input"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={2}
            />
          </label>
          <label className="auth-label">
            Contraseña (mín. 8 caracteres)
            <input
              className="auth-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error && <p className="msg err">{error}</p>}
          <button type="submit" className="btn-import" disabled={loading}>
            {loading ? 'Creando…' : 'Crear administrador'}
          </button>
        </form>
        <p className="auth-back">
          <Link to="/">Volver al inicio</Link>
        </p>
      </div>
    </div>
  )
}
