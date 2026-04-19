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
      <div className="auth-page auth-page--center">
        <div className="auth-card card auth-card--compact">
          <div className="auth-brand">
            <div className="auth-brand-frame">
              <BrandLogo className="auth-brand-logo" alt="" />
            </div>
          </div>
          <p className="msg">Comprobando…</p>
        </div>
      </div>
    )
  }

  if (!available) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <div className="auth-brand">
            <div className="auth-brand-frame">
              <BrandLogo className="auth-brand-logo" alt="" />
            </div>
          </div>
          <h1 className="auth-title auth-title--center">Alta inicial no disponible</h1>
          <p className="auth-sub auth-sub--center">Ya existe un administrador.</p>
          <p className="auth-sub auth-sub--center auth-unavailable-actions">
            <Link to="/login">Ir al login</Link>
            {' · '}
            <Link to="/">Inicio</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-brand">
          <div className="auth-brand-frame">
            <BrandLogo className="auth-brand-logo" alt="" />
          </div>
        </div>
        <h1 className="auth-title">Alta del administrador</h1>
        <p className="auth-sub">
          Creá la cuenta principal (rol administrador). Solo se puede hacer una vez.
        </p>
        <p className="auth-sub">
          <Link to="/">← Inicio</Link>
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
      </div>
    </div>
  )
}
