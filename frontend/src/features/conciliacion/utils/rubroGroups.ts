import type { MovimientoDto, SessionDetail } from '../types'
import { coerceAmount } from './effectivePairKind'
import { movementSummaryLine } from './counterpartUtils'

export const SIN_RUBRO_LABEL = '(Sin rubro)'
export const SIN_DETALLE_LABEL = '(Sin detalle)'

export type RubroGroupMode = 'classification' | 'specification'

export type RubroMovementRef = {
  side: 'bank' | 'company'
  m: MovimientoDto
  pairId: number | null
}

export type RubroGroupRow = {
  /** Etiqueta visible del grupo */
  rubro: string
  /** Clave interna de agrupación */
  groupKey: string
  isSinRubro: boolean
  bankCount: number
  bankSum: number
  companyCount: number
  companySum: number
  delta: number
  squared: boolean
  bankItems: RubroMovementRef[]
  companyItems: RubroMovementRef[]
}

export function normalizeRubro(classification: string | null | undefined): string {
  const t = classification?.trim()
  return t ? t : SIN_RUBRO_LABEL
}

/** Clave de agrupación: mismo texto de descripción o referencia (sin distinguir mayúsculas/acentos). */
export function specificationGroupKey(m: MovimientoDto): string {
  const raw = (m.description?.trim() || m.reference?.trim() || '').trim()
  if (!raw) return SIN_DETALLE_LABEL
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function specificationDisplayLabel(m: MovimientoDto): string {
  const d = m.description?.trim()
  if (d) return d
  const r = m.reference?.trim()
  if (r) return r
  return SIN_DETALLE_LABEL
}

function pairIdByBankTx(detail: SessionDetail): Map<number, number> {
  const m = new Map<number, number>()
  for (const p of detail.pairs) m.set(p.bankTxId, p.pairId)
  return m
}

function pairIdByCompanyTx(detail: SessionDetail): Map<number, number> {
  const m = new Map<number, number>()
  for (const p of detail.pairs) m.set(p.companyTxId, p.pairId)
  return m
}

function amountGapThreshold(sessionAmountTolerance: number | null | undefined): number {
  if (sessionAmountTolerance !== undefined && sessionAmountTolerance !== null) {
    return Math.max(0, sessionAmountTolerance)
  }
  return 0.02
}

type GroupKeyFns = {
  key: (m: MovimientoDto) => string
  label: (m: MovimientoDto) => string
  isEmpty: (key: string) => boolean
}

function buildGroupsInternal(
  detail: SessionDetail,
  sessionAmountTolerance: number | null | undefined,
  fns: GroupKeyFns,
): RubroGroupRow[] {
  const tol = amountGapThreshold(sessionAmountTolerance)
  const bankPair = pairIdByBankTx(detail)
  const companyPair = pairIdByCompanyTx(detail)

  type Acc = {
    displayLabel: string
    bankCount: number
    bankSum: number
    companyCount: number
    companySum: number
    bankItems: RubroMovementRef[]
    companyItems: RubroMovementRef[]
  }

  const map = new Map<string, Acc>()

  function accFor(groupKey: string, sample: MovimientoDto): Acc {
    let a = map.get(groupKey)
    if (!a) {
      a = {
        displayLabel: fns.label(sample),
        bankCount: 0,
        bankSum: 0,
        companyCount: 0,
        companySum: 0,
        bankItems: [],
        companyItems: [],
      }
      map.set(groupKey, a)
    }
    return a
  }

  for (const m of detail.bankTransactions) {
    const groupKey = fns.key(m)
    const a = accFor(groupKey, m)
    a.bankCount += 1
    a.bankSum += coerceAmount(m.amount)
    a.bankItems.push({ side: 'bank', m, pairId: bankPair.get(m.id) ?? null })
  }

  for (const m of detail.companyTransactions) {
    const groupKey = fns.key(m)
    const a = accFor(groupKey, m)
    a.companyCount += 1
    a.companySum += coerceAmount(m.amount)
    a.companyItems.push({ side: 'company', m, pairId: companyPair.get(m.id) ?? null })
  }

  const rows: RubroGroupRow[] = []
  for (const [groupKey, a] of map) {
    const delta = a.companySum - a.bankSum
    rows.push({
      rubro: a.displayLabel,
      groupKey,
      isSinRubro: fns.isEmpty(groupKey),
      bankCount: a.bankCount,
      bankSum: a.bankSum,
      companyCount: a.companyCount,
      companySum: a.companySum,
      delta,
      squared: Math.abs(delta) <= tol,
      bankItems: a.bankItems.sort((x, y) => x.m.txDate.localeCompare(y.m.txDate) || x.m.id - y.m.id),
      companyItems: a.companyItems.sort(
        (x, y) => x.m.txDate.localeCompare(y.m.txDate) || x.m.id - y.m.id,
      ),
    })
  }

  rows.sort((a, b) => {
    if (a.isSinRubro !== b.isSinRubro) return a.isSinRubro ? 1 : -1
    return a.rubro.localeCompare(b.rubro, 'es')
  })

  return rows
}

export function buildRubroGroups(
  detail: SessionDetail,
  sessionAmountTolerance: number | null | undefined,
  mode: RubroGroupMode = 'classification',
): RubroGroupRow[] {
  if (mode === 'specification') {
    return buildGroupsInternal(detail, sessionAmountTolerance, {
      key: specificationGroupKey,
      label: specificationDisplayLabel,
      isEmpty: (k) => k === SIN_DETALLE_LABEL,
    })
  }
  return buildGroupsInternal(detail, sessionAmountTolerance, {
    key: (m) => normalizeRubro(m.pendingClassification),
    label: (m) => normalizeRubro(m.pendingClassification),
    isEmpty: (k) => k === SIN_RUBRO_LABEL,
  })
}

export function crossGroupComparison(
  bank: RubroGroupRow,
  company: RubroGroupRow,
  sessionAmountTolerance: number | null | undefined,
): { delta: number; squared: boolean } {
  const tol = amountGapThreshold(sessionAmountTolerance)
  const delta = company.companySum - bank.bankSum
  return { delta, squared: Math.abs(delta) <= tol }
}

export function rubroGroupsSummary(groups: RubroGroupRow[]) {
  const withRubro = groups.filter((g) => !g.isSinRubro)
  const squared = withRubro.filter((g) => g.squared).length
  const mismatch = withRubro.filter((g) => !g.squared).length
  const sinRubro = groups.find((g) => g.isSinRubro)
  return {
    totalRubros: withRubro.length,
    squared,
    mismatch,
    sinRubroBank: sinRubro?.bankCount ?? 0,
    sinRubroCompany: sinRubro?.companyCount ?? 0,
  }
}

export { movementSummaryLine }
