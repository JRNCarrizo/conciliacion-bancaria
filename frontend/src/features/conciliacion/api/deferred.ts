import { apiFetch } from '../../../api/client'
import { parseError } from './http'
import type {
  DeferredMovement,
  IncorporateDeferredResult,
} from '../types'

export async function fetchAvailableDeferred(sessionId: number): Promise<DeferredMovement[]> {
  const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/diferidos/disponibles`)
  if (!r.ok) throw new Error(await parseError(r))
  return r.json() as Promise<DeferredMovement[]>
}

export async function deferMovement(
  sessionId: number,
  side: 'bank' | 'company',
  transactionId: number,
  note?: string,
): Promise<DeferredMovement> {
  const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/diferidos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ side, transactionId, note: note ?? null }),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json() as Promise<DeferredMovement>
}

export async function incorporateDeferred(
  sessionId: number,
  deferredIds: number[],
): Promise<IncorporateDeferredResult> {
  const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/diferidos/incorporar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deferredIds }),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json() as Promise<IncorporateDeferredResult>
}

export async function restoreDeferred(deferredId: number): Promise<void> {
  const r = await apiFetch(`/api/v1/conciliacion/diferidos/${deferredId}/restaurar`, {
    method: 'POST',
  })
  if (!r.ok) throw new Error(await parseError(r))
}
