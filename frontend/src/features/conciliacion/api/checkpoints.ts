import { apiFetch } from '../../../api/client'
import type { SessionCheckpoint } from '../types'
import { parseError } from './http'

export async function createSessionCheckpoint(
  sessionId: number,
  note?: string | null,
): Promise<SessionCheckpoint> {
  const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/cortes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: note?.trim() || null }),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return (await r.json()) as SessionCheckpoint
}
