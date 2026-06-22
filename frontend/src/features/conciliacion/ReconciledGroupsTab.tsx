import { Fragment, useMemo, useState } from 'react'
import { ClassificationCombo } from './ClassificationCombo'
import { MovementMiniTable } from './MovementMiniTable'
import type { SessionDetail } from './types'
import { formatAmount } from './utils/format'
import {
  buildReconciledGroups,
  reconciledGroupsSummary,
  type ReconciledGroupRow,
} from './utils/reconciledGroups'

/** Anchos válidos para <col> (solo % y rem; sin minmax/fr). */
const RECONCILED_SUMMARY_COLS = [
  '2.25rem',
  '24%',
  '11%',
  '11%',
  '6.5rem',
  '5.5rem',
  '38%',
] as const

export function ReconciledGroupsTab({
  detail,
  sessionAmountTolerance,
  classificationReadOnly,
  classificationSuggestions,
  onSetGroupClassification,
  onUnlinkGroup,
}: {
  detail: SessionDetail
  sessionAmountTolerance: number | null | undefined
  classificationReadOnly: boolean
  classificationSuggestions: readonly string[]
  onSetGroupClassification: (groupId: number, classification: string) => void | Promise<void>
  onUnlinkGroup?: (groupId: number) => void | Promise<void>
}) {
  const [onlyUnclassified, setOnlyUnclassified] = useState(true)
  const [onlyMismatch, setOnlyMismatch] = useState(false)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  const rows = useMemo(
    () => buildReconciledGroups(detail, sessionAmountTolerance),
    [detail, sessionAmountTolerance],
  )

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (onlyUnclassified && !r.isUnclassified) return false
      if (onlyMismatch && r.squared) return false
      return true
    })
  }, [rows, onlyUnclassified, onlyMismatch])

  const summary = useMemo(() => reconciledGroupsSummary(rows), [rows])

  function toggleExpand(groupKey: string, isOpen: boolean) {
    setExpandedKey(isOpen ? null : groupKey)
  }

  function handleRowClick(ev: React.MouseEvent, groupKey: string, isOpen: boolean) {
    const target = ev.target as HTMLElement
    if (target.closest('.reconciled-group-clasif, .rubro-expand-btn')) return
    toggleExpand(groupKey, isOpen)
  }

  return (
    <>
      <div className="rubro-view-toolbar" role="group" aria-label="Filtros grupos conciliados">
        <label className="rubro-view-check">
          <input
            type="checkbox"
            checked={onlyUnclassified}
            onChange={(ev) => setOnlyUnclassified(ev.target.checked)}
          />
          Solo sin clasificar
        </label>
        <label className="rubro-view-check">
          <input
            type="checkbox"
            checked={onlyMismatch}
            onChange={(ev) => setOnlyMismatch(ev.target.checked)}
          />
          Solo con diferencia de importe
        </label>
      </div>

      <p className="rubro-view-summary" aria-live="polite">
        {summary.total} grupo{summary.total === 1 ? '' : 's'} N:M
        {summary.total > 0 ? (
          <>
            : {summary.classified} clasificado{summary.classified === 1 ? '' : 's'},{' '}
            {summary.unclassified} sin clasificar
            {summary.mismatch > 0 ? (
              <>
                , {summary.mismatch} con diferencia de importe
              </>
            ) : null}
            .
          </>
        ) : (
          '.'
        )}
      </p>

      <div
        className={[
          'table-wrap reconciled-groups-table-wrap',
          expandedKey != null ? 'reconciled-groups-table-wrap--expanded' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <table className="data-table reconciled-groups-table">
          <colgroup>
            {RECONCILED_SUMMARY_COLS.map((width, i) => (
              <col key={i} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="reconciled-th-expand" aria-label="Expandir" />
              <th className="reconciled-th-group">Grupo</th>
              <th className="reconciled-th-side">Banco</th>
              <th className="reconciled-th-side">Empresa</th>
              <th className="reconciled-th-delta" title="Empresa − banco">
                Δ
              </th>
              <th className="reconciled-th-estado">Estado</th>
              <th className="reconciled-th-clasif">Clasificación</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="compare-empty">
                  {rows.length === 0
                    ? 'No hay grupos N:M en esta sesión. Conciliá varios pendientes de cada lado para crear uno.'
                    : onlyUnclassified
                      ? 'No hay grupos N:M sin clasificar con estos filtros.'
                      : 'No hay grupos con estos filtros.'}
                </td>
              </tr>
            ) : (
              filtered.map((g) => (
                <ReconciledGroupTableRows
                  key={g.groupKey}
                  group={g}
                  open={expandedKey === g.groupKey}
                  classificationReadOnly={classificationReadOnly}
                  classificationSuggestions={classificationSuggestions}
                  onSetGroupClassification={onSetGroupClassification}
                  onUnlinkGroup={onUnlinkGroup}
                  onRowClick={handleRowClick}
                  onToggleExpand={toggleExpand}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ReconciledSideCell({
  count,
  sum,
  side,
}: {
  count: number
  sum: number
  side: 'bank' | 'company'
}) {
  return (
    <td className={`reconciled-td-side reconciled-td-side--${side}`}>
      <span className="reconciled-side-count">
        {count} mov.
      </span>
      <span className="reconciled-side-sum">{formatAmount(sum)}</span>
    </td>
  )
}

function ReconciledGroupTableRows({
  group: g,
  open,
  classificationReadOnly,
  classificationSuggestions,
  onSetGroupClassification,
  onUnlinkGroup,
  onRowClick,
  onToggleExpand,
}: {
  group: ReconciledGroupRow
  open: boolean
  classificationReadOnly: boolean
  classificationSuggestions: readonly string[]
  onSetGroupClassification: (groupId: number, classification: string) => void | Promise<void>
  onUnlinkGroup?: (groupId: number) => void | Promise<void>
  onRowClick: (ev: React.MouseEvent, groupKey: string, isOpen: boolean) => void
  onToggleExpand: (groupKey: string, isOpen: boolean) => void
}) {
  const sizeLabel = `${g.bankCount}:${g.companyCount}`
  const rowClassName = [
    'reconciled-summary-row',
    g.isUnclassified ? 'reconciled-summary-row--unclassified' : '',
    open ? 'reconciled-summary-row--open' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Fragment>
      <tr
        className={rowClassName}
        data-group-key={g.groupKey}
        onClick={(ev) => onRowClick(ev, g.groupKey, open)}
        title={open ? 'Clic para ocultar movimientos' : 'Clic para ver movimientos'}
      >
        <td className="reconciled-td-expand">
          <button
            type="button"
            className="rubro-expand-btn"
            aria-expanded={open}
            aria-label={open ? `Ocultar detalle de ${g.label}` : `Ver movimientos de ${g.label}`}
            onClick={(ev) => {
              ev.stopPropagation()
              onToggleExpand(g.groupKey, open)
            }}
          >
            {open ? '▼' : '▶'}
          </button>
        </td>
        <td className="reconciled-td-group">
          <span className="reconciled-group-label scroll-x-muted" title={g.label}>
            {g.label}
          </span>
          <span className="reconciled-name-meta">
            <span className="reconciled-group-id">#{g.groupId}</span>
            <span className="reconciled-group-size" title="Movimientos banco : empresa">
              G{sizeLabel}
            </span>
          </span>
        </td>
        <ReconciledSideCell count={g.bankCount} sum={g.bankSum} side="bank" />
        <ReconciledSideCell count={g.companyCount} sum={g.companySum} side="company" />
        <td className="reconciled-td-delta">{formatAmount(g.delta)}</td>
        <td className="reconciled-td-estado">
          {g.squared ? (
            <span className="compare-badge compare-badge--estado rubro-badge--ok">Cuadrado</span>
          ) : (
            <span className="compare-badge compare-badge--estado rubro-badge--warn">Revisar</span>
          )}
        </td>
        <td className="reconciled-td-clasif reconciled-group-clasif">
          <div className="reconciled-clasif-row">
            <div className="clasif-field-wrap reconciled-clasif-field">
              <ClassificationCombo
                value={g.isUnclassified ? undefined : g.label}
                suggestions={classificationSuggestions}
                disabled={classificationReadOnly}
                ariaLabel={`Clasificación del grupo #${g.groupId}`}
                onCommit={(v) => void onSetGroupClassification(g.groupId, v)}
              />
            </div>
            {onUnlinkGroup && !classificationReadOnly ? (
              <button
                type="button"
                className="pair-unlink-btn pair-unlink-btn--manual reconciled-group-unlink-btn"
                title="Desvincular grupo"
                aria-label="Desvincular grupo"
                onClick={(ev) => {
                  ev.stopPropagation()
                  onUnlinkGroup(g.groupId)
                }}
              >
                ×
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {open ? (
        <tr className="reconciled-detail-row">
          <td colSpan={7} className="reconciled-detail-cell">
            <section
              className="reconciled-group-expanded"
              aria-label={`Movimientos del grupo ${g.label}`}
            >
              <div className="reconciled-group-expanded-grid">
                <MovementMiniTable
                  side="bank"
                  title={`Banco (${g.bankCount})`}
                  items={g.bankItems}
                  visibleRows={10}
                  adaptiveHeight
                  hideLinkHint
                />
                <MovementMiniTable
                  side="company"
                  title={`Empresa (${g.companyCount})`}
                  items={g.companyItems}
                  visibleRows={10}
                  adaptiveHeight
                  hideLinkHint
                />
              </div>
            </section>
          </td>
        </tr>
      ) : null}
    </Fragment>
  )
}
