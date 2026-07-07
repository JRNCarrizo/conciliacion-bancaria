import type { MovimientoDto, SessionDetail } from '../types'
import { coerceAmount } from './effectivePairKind'
import { movementSummaryLine } from './counterpartUtils'

export const SIN_RUBRO_LABEL = '(Sin clasificar)'
export const SIN_DETALLE_LABEL = '(Sin detalle)'

export type RubroGroupMode = 'classification' | 'specification'

export type RubroMovementRef = {
  side: 'bank' | 'company'
  m: MovimientoDto
  pairId: number | null
  groupId: number | null
  /** Clasificación del grupo N:M, o «Grupo #id» si aún no tiene rubro. */
  groupLabel?: string | null
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

function groupIdByBankTx(detail: SessionDetail): Map<number, number> {
  const m = new Map<number, number>()
  for (const g of detail.groups ?? []) {
    for (const id of g.bankTxIds) m.set(id, g.groupId)
  }
  return m
}

function groupIdByCompanyTx(detail: SessionDetail): Map<number, number> {
  const m = new Map<number, number>()
  for (const g of detail.groups ?? []) {
    for (const id of g.companyTxIds) m.set(id, g.groupId)
  }
  return m
}

function groupLabelsById(detail: SessionDetail): Map<number, string> {
  const m = new Map<number, string>()
  for (const g of detail.groups ?? []) {
    const label = g.classification?.trim()
    m.set(g.groupId, label ? label : `Grupo #${g.groupId}`)
  }
  return m
}

function groupLabelFor(labels: Map<number, string>, groupId: number | null | undefined): string | null {
  if (groupId == null) return null
  return labels.get(groupId) ?? `Grupo #${groupId}`
}

export function isRubroMovementLinkable(ref: RubroMovementRef): boolean {
  return ref.pairId == null && ref.groupId == null
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
  const bankGroup = groupIdByBankTx(detail)
  const companyGroup = groupIdByCompanyTx(detail)
  const groupLabels = groupLabelsById(detail)

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
    a.bankItems.push({
      side: 'bank',
      m,
      pairId: bankPair.get(m.id) ?? null,
      groupId: bankGroup.get(m.id) ?? null,
      groupLabel: groupLabelFor(groupLabels, bankGroup.get(m.id)),
    })
  }

  for (const m of detail.companyTransactions) {
    const groupKey = fns.key(m)
    const a = accFor(groupKey, m)
    a.companyCount += 1
    a.companySum += coerceAmount(m.amount)
    a.companyItems.push({
      side: 'company',
      m,
      pairId: companyPair.get(m.id) ?? null,
      groupId: companyGroup.get(m.id) ?? null,
      groupLabel: groupLabelFor(groupLabels, companyGroup.get(m.id)),
    })
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

export function aggregateCrossComparison(
  bankGroups: readonly RubroGroupRow[],
  companyGroups: readonly RubroGroupRow[],
  sessionAmountTolerance: number | null | undefined,
) {
  const bankSum = bankGroups.reduce((s, g) => s + g.bankSum, 0)
  const companySum = companyGroups.reduce((s, g) => s + g.companySum, 0)
  const bankCount = bankGroups.reduce((s, g) => s + g.bankCount, 0)
  const companyCount = companyGroups.reduce((s, g) => s + g.companyCount, 0)
  const tol = amountGapThreshold(sessionAmountTolerance)
  const delta = companySum - bankSum
  return {
    bankSum,
    companySum,
    bankCount,
    companyCount,
    delta,
    squared: Math.abs(delta) <= tol,
  }
}

export function mergedBankItems(groups: readonly RubroGroupRow[]): RubroMovementRef[] {
  return groups
    .flatMap((g) => g.bankItems)
    .sort((x, y) => x.m.txDate.localeCompare(y.m.txDate) || x.m.id - y.m.id)
}

export function mergedCompanyItems(groups: readonly RubroGroupRow[]): RubroMovementRef[] {
  return groups
    .flatMap((g) => g.companyItems)
    .sort((x, y) => x.m.txDate.localeCompare(y.m.txDate) || x.m.id - y.m.id)
}

/** Grupos únicos elegidos en banco y/o empresa (para vista previa con ambas columnas). */
export function unionPreviewGroups(
  bankGroups: readonly RubroGroupRow[],
  companyGroups: readonly RubroGroupRow[],
): RubroGroupRow[] {
  const map = new Map<string, RubroGroupRow>()
  for (const g of bankGroups) map.set(g.groupKey, g)
  for (const g of companyGroups) map.set(g.groupKey, g)
  return [...map.values()]
}

/** Grupos marcados en Comparar (cualquier lado), resueltos desde la lista completa. */
export function resolvePickedRubroGroups(
  groups: readonly RubroGroupRow[],
  pickBankKeys: ReadonlySet<string>,
  pickCompanyKeys: ReadonlySet<string>,
): RubroGroupRow[] {
  if (pickBankKeys.size === 0 && pickCompanyKeys.size === 0) return []
  return groups.filter((g) => pickBankKeys.has(g.groupKey) || pickCompanyKeys.has(g.groupKey))
}

/** Movimientos para las dos columnas del panel de comparación (todos los rubros marcados). */
export function crossCompareTableItems(previewGroups: readonly RubroGroupRow[]): {
  bankItems: RubroMovementRef[]
  companyItems: RubroMovementRef[]
} {
  return {
    bankItems: mergedBankItems(previewGroups),
    companyItems: mergedCompanyItems(previewGroups),
  }
}

export type BulkClassificationTarget = {
  bankPendingIds: number[]
  companyPendingIds: number[]
  pairIds: number[]
}

export function collectBulkClassificationTargets(
  bankGroups: readonly RubroGroupRow[],
  companyGroups: readonly RubroGroupRow[],
): BulkClassificationTarget {
  const bankPendingIds = new Set<number>()
  const companyPendingIds = new Set<number>()
  const pairIds = new Set<number>()

  for (const g of bankGroups) {
    for (const ref of g.bankItems) {
      if (ref.pairId != null) pairIds.add(ref.pairId)
      else if (isRubroMovementLinkable(ref)) bankPendingIds.add(ref.m.id)
    }
  }
  for (const g of companyGroups) {
    for (const ref of g.companyItems) {
      if (ref.pairId != null) pairIds.add(ref.pairId)
      else if (isRubroMovementLinkable(ref)) companyPendingIds.add(ref.m.id)
    }
  }

  return {
    bankPendingIds: [...bankPendingIds],
    companyPendingIds: [...companyPendingIds],
    pairIds: [...pairIds],
  }
}

export function bulkClassificationTargetCount(t: BulkClassificationTarget): number {
  return t.bankPendingIds.length + t.companyPendingIds.length + t.pairIds.length
}

/** Pendientes elegidos en el panel de vinculación (vista previa de selección). */
export function collectSelectionClassificationTargets(
  selectedBank: readonly RubroMovementRef[],
  selectedCompany: readonly RubroMovementRef[],
): BulkClassificationTarget {
  return {
    bankPendingIds: selectedBank.filter(isRubroMovementLinkable).map((i) => i.m.id),
    companyPendingIds: selectedCompany.filter(isRubroMovementLinkable).map((i) => i.m.id),
    pairIds: [],
  }
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

export function allBankMovementRefs(detail: SessionDetail): RubroMovementRef[] {
  const pairMap = pairIdByBankTx(detail)
  const groupMap = groupIdByBankTx(detail)
  const groupLabels = groupLabelsById(detail)
  return detail.bankTransactions.map((m) => {
    const groupId = groupMap.get(m.id) ?? null
    return {
      side: 'bank',
      m,
      pairId: pairMap.get(m.id) ?? null,
      groupId,
      groupLabel: groupLabelFor(groupLabels, groupId),
    }
  })
}

export function allCompanyMovementRefs(detail: SessionDetail): RubroMovementRef[] {
  const pairMap = pairIdByCompanyTx(detail)
  const groupMap = groupIdByCompanyTx(detail)
  const groupLabels = groupLabelsById(detail)
  return detail.companyTransactions.map((m) => {
    const groupId = groupMap.get(m.id) ?? null
    return {
      side: 'company',
      m,
      pairId: pairMap.get(m.id) ?? null,
      groupId,
      groupLabel: groupLabelFor(groupLabels, groupId),
    }
  })
}

export function ledgerViewSummary(detail: SessionDetail) {
  const bank = allBankMovementRefs(detail)
  const company = allCompanyMovementRefs(detail)
  const bankPending = bank.filter(isRubroMovementLinkable).length
  const companyPending = company.filter(isRubroMovementLinkable).length
  const bankSum = bank.reduce((s, i) => s + coerceAmount(i.m.amount), 0)
  const companySum = company.reduce((s, i) => s + coerceAmount(i.m.amount), 0)
  return {
    bankCount: bank.length,
    companyCount: company.length,
    bankPending,
    companyPending,
    bankMatched: bank.length - bankPending,
    companyMatched: company.length - companyPending,
    bankSum,
    companySum,
    delta: companySum - bankSum,
  }
}

export { movementSummaryLine }
