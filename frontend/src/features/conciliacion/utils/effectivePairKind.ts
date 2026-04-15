import type { PairKind, ParDto } from '../types'
import { parseBalanceInput } from './parse'

/** Mismo fallback que backend si aún no hubo conciliación con tolerancia guardada. */
const EPS = 0.02

function signum(n: number): number {
  if (n === 0 || Object.is(n, -0)) return 0
  return n < 0 ? -1 : 1
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Importe desde API: número, string "1234,56", etc. `Number("10,1")` da NaN en JS. */
export function coerceAmount(v: unknown): number {
  if (v == null) return NaN
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  if (typeof v === 'string') {
    const t = v.trim().replace(/\u00a0/g, '').replace(/\s/g, '')
    if (t === '') return NaN
    const parsed = parseBalanceInput(t)
    if (parsed != null) return parsed
    const n = Number(t.replace(/\u00a0/g, '').replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : NaN
  }
  const n = Number(v as number)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Umbral: tolerancia guardada (0 es válido — no usar `||` que lo confunde con “vacío”).
 * Si no hay valor en sesión, EPS 0,02.
 */
export function resolveAmountGapThreshold(
  sessionAmountTolerance: number | null | undefined,
): number {
  if (sessionAmountTolerance === undefined || sessionAmountTolerance === null) {
    return EPS
  }
  const t = Number(sessionAmountTolerance)
  return Number.isFinite(t) && t >= 0 ? t : EPS
}

/**
 * Misma regla que la columna Δ de la grilla: importe banco vs empresa ya resueltos (mapa de movimientos).
 * El API a veces entrega números como string; se normalizan.
 */
export function effectivePairKindFromAmounts(
  bankAmount: number | string | null | undefined,
  companyAmount: number | string | null | undefined,
  sessionAmountTolerance: number | null | undefined,
): PairKind {
  const ba = coerceAmount(bankAmount)
  const ca = coerceAmount(companyAmount)
  if (!Number.isFinite(ba) || !Number.isFinite(ca)) {
    return 'EXACT'
  }
  if (signum(ba) !== 0 && signum(ca) !== 0 && signum(ba) !== signum(ca)) {
    return 'OPPOSITE_SIGN'
  }
  const threshold = resolveAmountGapThreshold(sessionAmountTolerance)
  const gap = round4(Math.abs(ba - ca))
  const thr = round4(threshold)
  if (gap > thr) return 'AMOUNT_GAP'
  if (gap > 0) return 'AMOUNT_ADJUST'
  return 'EXACT'
}

/** Filtro «Δ importe» y filas resaltadas: cualquier diferencia de importe (ajuste dentro de tol. o brecha fuera). */
export function pairKindShowsAmountDifference(k: PairKind): boolean {
  return k === 'AMOUNT_ADJUST' || k === 'AMOUNT_GAP'
}

/**
 * EXACT vs AMOUNT_GAP según tolerancia de sesión (última conciliación) o EPS 0,02.
 * Preferí `effectivePairKindFromAmounts` con los importes de la grilla si pueden diferir del ParDto.
 */
export function effectivePairKind(
  p: ParDto,
  sessionAmountTolerance: number | null | undefined,
): PairKind {
  return effectivePairKindFromAmounts(p.bankAmount, p.companyAmount, sessionAmountTolerance)
}
