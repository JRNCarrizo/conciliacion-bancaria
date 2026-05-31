import { apiFetch } from '../../../api/client'
import { parseError } from './http'

export async function updateSessionDisplayName(
  sessionId: number,
  displayName: string | null,
): Promise<string | null> {
  const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/nombre`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName }),
  })
  if (!r.ok) throw new Error(await parseError(r))
  const data = (await r.json()) as { displayName?: string | null }
  const trimmed = data.displayName?.trim()
  return trimmed ? trimmed : null
}
