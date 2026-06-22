import type { GroupDto, MovimientoDto, SessionDetail } from '../types'
import { coerceAmount } from './effectivePairKind'
import type { RubroMovementRef } from './rubroGroups'

export type RubroViewTab = 'classification' | 'specification' | 'reconciled'

export type ReconciledGroupRow = {
  groupId: number
  groupKey: string
  /** Clasificación asignada o «Grupo #id». */
  label: string
  isUnclassified: boolean
  bankCount: number
  bankSum: number
  companyCount: number
  companySum: number
  delta: number
  squared: boolean
  matchSource: string
  bankItems: RubroMovementRef[]
  companyItems: RubroMovementRef[]
}

function amountGapThreshold(sessionAmountTolerance: number | null | undefined): number {
  if (sessionAmountTolerance !== undefined && sessionAmountTolerance !== null) {
    return Math.max(0, sessionAmountTolerance)
  }
  return 0.02
}

function movementRef(
  side: 'bank' | 'company',
  m: MovimientoDto,
  groupId: number,
  groupLabel: string,
): RubroMovementRef {
  return {
    side,
    m,
    pairId: null,
    groupId,
    groupLabel,
  }
}

export function buildReconciledGroups(
  detail: SessionDetail,
  sessionAmountTolerance: number | null | undefined,
): ReconciledGroupRow[] {
  const tol = amountGapThreshold(sessionAmountTolerance)
  const bankMap = new Map(detail.bankTransactions.map((m) => [m.id, m]))
  const companyMap = new Map(detail.companyTransactions.map((m) => [m.id, m]))

  return (detail.groups ?? [])
    .map((g: GroupDto) => {
      const classification = g.classification?.trim()
      const label = classification ? classification : `Grupo #${g.groupId}`
      const bankItems = g.bankTxIds
        .map((id) => bankMap.get(id))
        .filter((m): m is MovimientoDto => m != null)
        .map((m) => movementRef('bank', m, g.groupId, label))
      const companyItems = g.companyTxIds
        .map((id) => companyMap.get(id))
        .filter((m): m is MovimientoDto => m != null)
        .map((m) => movementRef('company', m, g.groupId, label))
      const bankSum = coerceAmount(g.bankSum)
      const companySum = coerceAmount(g.companySum)
      const delta = companySum - bankSum
      return {
        groupId: g.groupId,
        groupKey: `group-${g.groupId}`,
        label,
        isUnclassified: !classification,
        bankCount: bankItems.length,
        bankSum,
        companyCount: companyItems.length,
        companySum,
        delta,
        squared: Math.abs(delta) <= tol,
        matchSource: g.matchSource,
        bankItems,
        companyItems,
      }
    })
    .sort((a, b) => {
      const da =
        a.bankItems[0]?.m.txDate ??
        a.companyItems[0]?.m.txDate ??
        ''
      const db =
        b.bankItems[0]?.m.txDate ??
        b.companyItems[0]?.m.txDate ??
        ''
      return da.localeCompare(db) || a.groupId - b.groupId
    })
}

export function reconciledGroupsSummary(rows: readonly ReconciledGroupRow[]) {
  const unclassified = rows.filter((r) => r.isUnclassified).length
  const mismatch = rows.filter((r) => !r.squared).length
  return {
    total: rows.length,
    unclassified,
    mismatch,
    classified: rows.length - unclassified,
  }
}
