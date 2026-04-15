import { SESSION_STATUS_LABEL } from '../constants'

export function formatAmount(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

/** Valor mostrado en el campo de tolerancia de importe (sin forzar 0,20 cuando es 0,2). */
export function formatToleranceInputDisplay(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
    useGrouping: false,
  }).format(n)
}

export function formatPct(n: number): string {
  return `${n.toFixed(2)} %`
}

/** Fechas del API (YYYY-MM-DD) → día/mes/año para pantalla */
export function formatSessionListWhen(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function shortFileLabel(name: string | null | undefined, max = 32): string {
  if (name == null || String(name).trim() === '') return '—'
  const s = String(name)
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

export function formatDisplayDate(isoDate: string | null | undefined): string {
  if (isoDate == null || String(isoDate).trim() === '') return '—'
  const s = String(isoDate).trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) {
    const [, y, mo, d] = m
    return `${d}/${mo}/${y}`
  }
  return s
}

export function formatCommentWhen(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export function sessionStatusLabel(code: string): string {
  return SESSION_STATUS_LABEL[code] ?? code
}

export function statusPanelClass(code: string): string {
  if (code === 'OK') return 'exec-status exec-status--ok'
  if (code === 'PENDING_DIFFERENCES') return 'exec-status exec-status--pending'
  return 'exec-status exec-status--err'
}
