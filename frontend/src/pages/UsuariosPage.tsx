import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { apiFetch } from '../api/client'
import type { AppRole } from '../auth/types'
import { parseError } from '../features/conciliacion/api/http'
import './home.css'

type UserRow = {
  id: number
  username: string
  role: AppRole
  enabled: boolean
  createdAt: string
}

const ROLE_LABEL: Record<AppRole, string> = {
  ADMIN: 'Administrador',
  OPERADOR: 'Operador',
  CONSULTA: 'Consulta',
}

export function UsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<AppRole>('OPERADOR')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    setLoading(true)
    try {
      const r = await apiFetch('/api/v1/users')
      if (!r.ok) throw new Error(await parseError(r))
      setUsers((await r.json()) as UserRow[])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      const r = await apiFetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
          role: newRole,
        }),
      })
      if (!r.ok) throw new Error(await parseError(r))
      setNewUsername('')
      setNewPassword('')
      setNewRole('OPERADOR')
      await load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleEnabled(u: UserRow) {
    try {
      const r = await apiFetch(`/api/v1/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !u.enabled }),
      })
      if (!r.ok) throw new Error(await parseError(r))
      await load()
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }

  const enabledAdminCount = users.filter((u) => u.role === 'ADMIN' && u.enabled).length

  return (
    <div className="home-app">
      <header className="app-header">
        <h1>Gestión de usuarios</h1>
        <p className="subtitle">Alta de cuentas y asignación de rol (solo administrador).</p>
      </header>

      <main className="usuarios-admin-main">
        <section className="card usuarios-form-card">
          <h2>Nuevo usuario</h2>
          <form className="usuarios-form" onSubmit={onCreate}>
            <label>
              Usuario
              <input
                value={newUsername}
                onChange={(ev) => setNewUsername(ev.target.value)}
                required
                minLength={2}
              />
            </label>
            <label>
              Contraseña (mín. 8)
              <input
                type="password"
                value={newPassword}
                onChange={(ev) => setNewPassword(ev.target.value)}
                required
                minLength={8}
              />
            </label>
            <label>
              Rol
              <select
                value={newRole}
                onChange={(ev) => setNewRole(ev.target.value as AppRole)}
              >
                <option value="OPERADOR">{ROLE_LABEL.OPERADOR}</option>
                <option value="CONSULTA">{ROLE_LABEL.CONSULTA}</option>
                <option value="ADMIN">{ROLE_LABEL.ADMIN}</option>
              </select>
            </label>
            {formError && <p className="msg err">{formError}</p>}
            <button type="submit" className="btn-import" disabled={saving}>
              {saving ? 'Guardando…' : 'Crear usuario'}
            </button>
          </form>
        </section>

        <section className="card usuarios-list-card">
          <h2>Usuarios</h2>
          {loading && <p className="msg">Cargando…</p>}
          {loadError && <p className="msg err">{loadError}</p>}
          {!loading && !loadError && (
            <div className="usuarios-table-wrap">
              <table className="usuarios-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isLastEnabledAdmin =
                      u.role === 'ADMIN' && u.enabled && enabledAdminCount === 1
                    return (
                    <tr key={u.id}>
                      <td>{u.username}</td>
                      <td>{ROLE_LABEL[u.role]}</td>
                      <td>{u.enabled ? 'Activo' : 'Deshabilitado'}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary usuarios-toggle-btn"
                          disabled={isLastEnabledAdmin}
                          title={
                            isLastEnabledAdmin
                              ? 'Tiene que haber al menos un administrador activo. Creá otro administrador antes.'
                              : undefined
                          }
                          onClick={() => void toggleEnabled(u)}
                        >
                          {u.enabled ? 'Deshabilitar' : 'Habilitar'}
                        </button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
