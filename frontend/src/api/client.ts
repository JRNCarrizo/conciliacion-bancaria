const TOKEN_KEY = 'conciliacion.jwt'

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

/** Fetch a la API con Bearer si hay sesión. En 401 limpia el token y redirige al login. */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers ?? undefined)
  const t = getStoredToken()
  if (t) headers.set('Authorization', `Bearer ${t}`)
  const r = await fetch(input, { ...init, headers })
  if (r.status === 401) {
    setStoredToken(null)
    localStorage.removeItem('conciliacion.auth')
    if (!window.location.pathname.startsWith('/login')) {
      window.location.assign('/login')
    }
  }
  return r
}
