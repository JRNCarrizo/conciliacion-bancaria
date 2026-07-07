import { setStoredToken } from '../api/client'

const SERVER_INSTANCE_KEY = 'conciliacion.serverInstance'
const AUTH_USER_KEY = 'conciliacion.auth'

/**
 * Si el servidor se reinició (nuevo instanceId), borra token y usuario para forzar login.
 * Debe ejecutarse antes del primer render de React.
 */
export async function syncAuthWithServerInstance(): Promise<void> {
  try {
    const r = await fetch('/api/v1/auth/instance')
    if (!r.ok) return
    const data = (await r.json()) as { instanceId?: string }
    const id = data.instanceId
    if (!id) return
    const prev = localStorage.getItem(SERVER_INSTANCE_KEY)
    if (prev != null && prev !== id) {
      setStoredToken(null)
      localStorage.removeItem(AUTH_USER_KEY)
    }
    localStorage.setItem(SERVER_INSTANCE_KEY, id)
  } catch {
    /* sin red / servidor caído: no limpiar sesión */
  }
}
