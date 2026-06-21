import type { ReactNode } from 'react'
import type { ComparisonRow, GroupDto, MovimientoDto } from './types'
import {
  coerceAmount,
  effectivePairKindFromAmounts,
  pairKindShowsAmountDifference,
} from './utils/effectivePairKind'
import { movementSummaryLine } from './utils/counterpartUtils'
import { formatAmount, formatDisplayDate } from './utils/format'
import { deferredOriginTitle, hasDeferredOrigin } from './utils/deferredOrigin'
import { ClassificationCombo } from './ClassificationCombo'

type GroupEstado = { label: string; abbr: string; badgeClass: string }

function groupEstadoMeta(
  group: GroupDto,
  sessionTolerance: number | null | undefined,
): GroupEstado {
  const k = effectivePairKindFromAmounts(group.bankSum, group.companySum, sessionTolerance)
  const size = `${group.bankTxIds.length}:${group.companyTxIds.length}`
  if (k === 'OPPOSITE_SIGN') {
    return {
      label: `Grupo ${size} · signo incorrecto`,
      abbr: `G${size}·SI`,
      badgeClass: 'compare-badge compare-badge--estado compare-badge--opp-sign',
    }
  }
  if (k === 'AMOUNT_GAP') {
    return {
      label: `Grupo ${size} · diferencia de importe`,
      abbr: `G${size}·Δ`,
      badgeClass: 'compare-badge compare-badge--estado compare-badge--amount-gap',
    }
  }
  if (k === 'AMOUNT_ADJUST') {
    return {
      label: `Grupo ${size} · conciliado con ajuste`,
      abbr: `G${size}·Aj`,
      badgeClass: 'compare-badge compare-badge--estado compare-badge--amount-gap',
    }
  }
  if (group.matchSource === 'MANUAL') {
    return {
      label: `Grupo ${size} · conciliado manual`,
      abbr: `G${size}·M`,
      badgeClass: 'compare-badge compare-badge--estado compare-badge--manual',
    }
  }
  return {
    label: `Grupo ${size} · conciliado`,
    abbr: `G${size}`,
    badgeClass: 'compare-badge compare-badge--estado compare-badge--auto',
  }
}

function GroupMovementLine({ m }: { m: MovimientoDto }) {
  const desc = [m.reference, m.description].filter(Boolean).join(' · ')
  return (
    <div className="compare-group-mov-line">
      <span className="compare-group-mov-id">{m.id}</span>
      <span className="compare-group-mov-date">{formatDisplayDate(m.txDate)}</span>
      <span className="compare-group-mov-amt">{formatAmount(m.amount)}</span>
      <span className="compare-group-mov-desc">{desc || movementSummaryLine(m)}</span>
    </div>
  )
}

function GroupExpandIcon({ expanded }: { expanded: boolean }) {
  if (expanded) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
        <path
          d="M2.5 3.5 20.5 21.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M10.7 10.7a3 3 0 0 0 4.2 4.2M9.9 5.1A10.8 10.8 0 0 1 12 4.5c4.2 0 7.8 2.4 9.5 6-1 2.1-2.6 3.8-4.5 4.9M6.4 6.4C4.2 7.8 2.7 9.8 2 12c1.7 3.6 5.3 6 9.5 6 .9 0 1.8-.1 2.6-.4"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
      <path
        d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  )
}

function GroupSidePanel({
  side,
  movements,
  sum,
  expanded,
  onToggleExpand,
}: {
  side: 'bank' | 'company'
  movements: MovimientoDto[]
  sum: number
  expanded: boolean
  onToggleExpand: () => void
}) {
  const sideLabel = side === 'bank' ? 'banco' : 'empresa'
  return (
    <>
      <div className="compare-group-side-head">
        <p className="compare-group-side-meta">
          {movements.length} mov. · Σ <strong>{formatAmount(sum)}</strong>
        </p>
        {movements.length > 0 ? (
          <button
            type="button"
            className="compare-group-toggle-btn compare-group-side-toggle-btn"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={
              expanded
                ? `Ocultar movimientos ${sideLabel} del grupo`
                : `Ver ${movements.length} movimiento${movements.length === 1 ? '' : 's'} ${sideLabel} del grupo`
            }
            title={
              expanded
                ? `Ocultar movimientos ${sideLabel}`
                : `Ver movimientos ${sideLabel}`
            }
          >
            <GroupExpandIcon expanded={expanded} />
          </button>
        ) : null}
      </div>
      {expanded && movements.length > 0 ? (
        <div
          className="compare-group-mov-list"
          role="list"
          aria-label={`Movimientos ${sideLabel} del grupo`}
        >
          {movements.map((m) => (
            <GroupMovementLine key={m.id} m={m} />
          ))}
        </div>
      ) : !expanded && movements.length > 0 ? (
        <p className="compare-group-side-preview">
          {movements
            .slice(0, 2)
            .map((m) => `#${m.id} ${formatAmount(m.amount)}`)
            .join(' · ')}
          {movements.length > 2 ? ` · +${movements.length - 2} más` : ''}
        </p>
      ) : null}
    </>
  )
}

export function compareGroupSideKey(rowKey: string, side: 'bank' | 'company'): string {
  return `${rowKey}::${side}`
}

export function CompareGroupTableRows({
  row,
  rowNum,
  rowClass,
  expandedBank,
  expandedCompany,
  onToggleBankExpand,
  onToggleCompanyExpand,
  sessionAmountTolerance,
  classificationReadOnly,
  sessionClosed,
  selectedId,
  onUnlinkGroup,
  classificationSuggestions,
  onSetGroupClassification,
  notesTools,
}: {
  row: Extract<ComparisonRow, { kind: 'group' }>
  rowNum: number
  rowClass: string
  expandedBank: boolean
  expandedCompany: boolean
  onToggleBankExpand: () => void
  onToggleCompanyExpand: () => void
  sessionAmountTolerance: number | null | undefined
  classificationReadOnly: boolean
  sessionClosed: boolean
  selectedId: number | null
  onUnlinkGroup?: (groupId: number) => void
  classificationSuggestions: readonly string[]
  onSetGroupClassification: (groupId: number, classification: string) => void
  notesTools?: ReactNode
}) {
  const { group, banks, companies } = row
  const delta = coerceAmount(group.companySum) - coerceAmount(group.bankSum)
  const deltaStr = Math.abs(delta) < 1e-9 ? '0' : delta.toFixed(2)
  const estado = groupEstadoMeta(group, sessionAmountTolerance)
  const deferredMovements = [...banks, ...companies].filter(hasDeferredOrigin)
  const sideExpanded = expandedBank || expandedCompany

  return (
    <tr
      data-row-key={row.key}
      className={`${rowClass} compare-group-row compare-group-row--summary${sideExpanded ? ' compare-group-row--side-expanded' : ''}`}
    >
      <td className="rownum-td">{rowNum}</td>
      <td className="compare-td-tipo compare-td-tipo--stack">
        <div className="compare-estado-chips">
          <span className={`${estado.badgeClass} compare-estado-chip`} title={estado.label}>
            {estado.abbr}
          </span>
          <span className="compare-group-id-label" title={`Grupo de conciliación #${group.groupId}`}>
            #{group.groupId}
          </span>
          {deferredMovements.map((m) => (
            <span
              key={`dif-${m.id}`}
              className="compare-badge compare-badge--estado compare-badge--deferred-in compare-estado-chip"
              title={deferredOriginTitle(m)}
            >
              Dif←
            </span>
          ))}
        </div>
      </td>
      <td colSpan={4} className="compare-group-side compare-group-side--bank compare-td-split-edge">
        <GroupSidePanel
          side="bank"
          movements={banks}
          sum={group.bankSum}
          expanded={expandedBank}
          onToggleExpand={onToggleBankExpand}
        />
      </td>
      <td colSpan={4} className="compare-group-side compare-group-side--company">
        <GroupSidePanel
          side="company"
          movements={companies}
          sum={group.companySum}
          expanded={expandedCompany}
          onToggleExpand={onToggleCompanyExpand}
        />
      </td>
      <td className="compare-delta" title={deltaStr}>
        {deltaStr}
      </td>
      <td className="compare-td-clasif-pair">
        <ClassificationCombo
          value={group.classification ?? undefined}
          suggestions={classificationSuggestions}
          disabled={classificationReadOnly}
          ariaLabel="Clasificación del grupo conciliado"
          onCommit={(v) => onSetGroupClassification(group.groupId, v)}
        />
      </td>
      <td className="compare-td-notes">{notesTools ?? null}</td>
      <td className="compare-td-unlink compare-group-actions">
        {selectedId != null && !sessionClosed && !classificationReadOnly && onUnlinkGroup ? (
          <button
            type="button"
            className="pair-unlink-btn pair-unlink-btn--manual"
            onClick={() => onUnlinkGroup(group.groupId)}
            title="Desvincular grupo (todos los movimientos vuelven a pendientes)"
            aria-label="Desvincular grupo"
          >
            Desvincular
          </button>
        ) : null}
      </td>
    </tr>
  )
}

export function rowClassForGroupRow(
  row: Extract<ComparisonRow, { kind: 'group' }>,
  sessionTolerance: number | null | undefined,
): string {
  const k = effectivePairKindFromAmounts(row.group.bankSum, row.group.companySum, sessionTolerance)
  if (k === 'OPPOSITE_SIGN') return 'row--opp-sign row--group'
  if (k != null && pairKindShowsAmountDifference(k)) return 'row--amount-gap row--group'
  return row.group.matchSource === 'MANUAL' ? 'row--manual row--group' : 'row--auto row--group'
}
