import { apiFetch } from '../../../api/client'
import { parseError } from './http'

export async function createReconciliationGroup(
  sessionId: number,
  bankTransactionIds: number[],
  companyTransactionIds: number[],
): Promise<{ groupId: number; sessionId: number; matchSource: string }> {
  const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/grupos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bankTransactionIds, companyTransactionIds }),
  })
  if (!r.ok) throw new Error(await parseError(r))
  return r.json() as Promise<{ groupId: number; sessionId: number; matchSource: string }>
}

export async function deleteReconciliationGroup(sessionId: number, groupId: number): Promise<void> {
  const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/grupos/${groupId}`, {
    method: 'DELETE',
  })
  if (!r.ok) throw new Error(await parseError(r))
}
