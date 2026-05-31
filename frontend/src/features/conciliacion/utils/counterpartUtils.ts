import type { MovimientoDto, SessionDetail } from '../types'

export type CounterpartInspectMode = 'fuzzy' | 'duplicate'
export type CounterpartSide = 'bank' | 'company'

export type CounterpartInspectRequest = {
  mode: CounterpartInspectMode
  side: CounterpartSide
  mov: MovimientoDto
}

export function comparisonRowKey(side: CounterpartSide, id: number): string {
  return side === 'bank' ? `ub-${id}` : `uc-${id}`
}

export function findMovementInSession(
  detail: SessionDetail,
  side: CounterpartSide,
  id: number,
): MovimientoDto | null {
  const lists =
    side === 'bank'
      ? [detail.unmatchedBankTransactions, detail.bankTransactions]
      : [detail.unmatchedCompanyTransactions, detail.companyTransactions]
  for (const list of lists) {
    const hit = list.find((m) => m.id === id)
    if (hit) return hit
  }
  return null
}

export function resolveFuzzyCounterpart(
  detail: SessionDetail,
  side: CounterpartSide,
  mov: MovimientoDto,
): MovimientoDto | null {
  const otherId = mov.fuzzyCounterpartId
  if (otherId == null) return null
  const otherSide: CounterpartSide = side === 'bank' ? 'company' : 'bank'
  return findMovementInSession(detail, otherSide, otherId)
}

/** Otros movimientos del mismo lado con misma fecha e importe (incluye emparejados). */
export function findDuplicateSiblings(detail: SessionDetail, side: CounterpartSide, mov: MovimientoDto): MovimientoDto[] {
  const list = side === 'bank' ? detail.bankTransactions : detail.companyTransactions
  const key = duplicateKey(mov)
  return list
    .filter((m) => m.id !== mov.id && duplicateKey(m) === key)
    .map((m) => findMovementInSession(detail, side, m.id) ?? m)
}

function duplicateKey(m: MovimientoDto): string {
  return `${m.txDate}|${Number(m.amount)}`
}

export function movementSummaryLine(m: MovimientoDto): string {
  const ref = [m.reference, m.description].filter(Boolean).join(' · ')
  return ref || '—'
}

/** Etiqueta corta en tabla (el detalle completo va en title / modal). */
export function fuzzyMatchBadgeLabel(m: MovimientoDto): string | null {
  if (m.fuzzyCounterpartId != null) {
    return `Posible match · ID ${m.fuzzyCounterpartId}`
  }
  const hint = m.fuzzyHint?.trim()
  if (!hint) return null
  const idMatch = hint.match(/ID\s+(\d+)/i)
  if (idMatch) return `Posible match · ID ${idMatch[1]}`
  return 'Posible match'
}

export function hasFuzzyMatchHint(m: MovimientoDto): boolean {
  return m.fuzzyCounterpartId != null || Boolean(m.fuzzyHint?.trim())
}
