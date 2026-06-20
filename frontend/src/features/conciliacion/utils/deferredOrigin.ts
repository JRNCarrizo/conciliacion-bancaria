import type { ComparisonRow, MovimientoDto } from '../types'

export function hasDeferredOrigin(m: MovimientoDto | undefined): boolean {
  return m?.deferredOriginId != null
}

export function deferredOriginTitle(m: MovimientoDto): string {
  const parts = [`Diferido #${m.deferredOriginId}`]
  if (m.deferredOriginSessionLabel) parts.push(m.deferredOriginSessionLabel)
  if (m.deferredOriginSideFileName) parts.push(`Archivo: ${m.deferredOriginSideFileName}`)
  return `Incorporado · ${parts.join(' · ')}`
}

export function comparisonRowHasDeferredOrigin(row: ComparisonRow): boolean {
  if (row.kind === 'pair') {
    return hasDeferredOrigin(row.bank) || hasDeferredOrigin(row.company)
  }
  return hasDeferredOrigin(row.m)
}
