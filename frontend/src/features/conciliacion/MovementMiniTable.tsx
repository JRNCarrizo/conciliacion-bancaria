import type { CSSProperties, RefObject } from 'react'
import { movementSummaryLine } from './utils/counterpartUtils'
import type { RubroMovementRef } from './utils/rubroGroups'
import { formatAmount, formatDisplayDate } from './utils/format'

export function MovementMiniTable({
  side,
  title,
  items,
  linkMode,
  selectedTxId,
  selectedTxIds,
  onToggleTxId,
  onViewPair,
  onScrollToGroup,
  onUnlinkGroup,
  tableWrapRef,
  keyboardNav,
  onTableMouseEnter,
  visibleRows = 10,
  adaptiveHeight = false,
  hideLinkHint = false,
  panelLayout = false,
}: {
  side: 'bank' | 'company'
  title: string
  items: RubroMovementRef[]
  linkMode?: boolean
  selectedTxId?: number | null
  /** Selección múltiple (p. ej. vista por archivo). Si se pasa, tiene prioridad sobre selectedTxId. */
  selectedTxIds?: ReadonlySet<number>
  /** Clic en pend.: alterna selección (mismo id → deselecciona). */
  onToggleTxId?: (id: number) => void
  /** Clic en par: ver el otro lado del emparejamiento. */
  onViewPair?: (pairId: number) => void
  /** Clic en grp: ir a la fila del grupo en comparativa. */
  onScrollToGroup?: (groupId: number) => void
  /** Desvincular grupo de conciliación N:M. */
  onUnlinkGroup?: (groupId: number) => void
  /** Contenedor scroll de la tabla (p. ej. navegación por teclado en vista por archivo). */
  tableWrapRef?: RefObject<HTMLDivElement | null>
  /** Navegación fila a fila con teclado (vista por archivo). */
  keyboardNav?: {
    focusedTxId: number | null
    tableActive: boolean
  }
  onTableMouseEnter?: () => void
  /** Filas visibles antes de scroll (vista previa usa menos). */
  visibleRows?: 5 | 10 | 12
  /** Altura según cantidad de filas (mín. 1, máx. visibleRows). */
  adaptiveHeight?: boolean
  /** Oculta el hint de pend. (el panel padre ya lo explica). */
  hideLinkHint?: boolean
  /** Tarjeta con encabezado de color (vista grupos expandida). */
  panelLayout?: boolean
}) {
  if (items.length === 0) {
    return (
      <div
        className={[
          `rubro-detail-side rubro-detail-side--${side}`,
          panelLayout ? 'rubro-detail-panel' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {panelLayout ? (
          <div className="rubro-detail-panel-head">
            <h4 className="rubro-detail-side-title">{title}</h4>
          </div>
        ) : (
          <h4 className="rubro-detail-side-title">{title}</h4>
        )}
        <p className="rubro-detail-empty">Sin movimientos.</p>
      </div>
    )
  }

  const adaptiveRowCount = Math.min(visibleRows, Math.max(1, items.length))
  const fitsContent = adaptiveHeight && items.length <= visibleRows
  const tableWrapStyle = adaptiveHeight
    ? ({ '--rubro-detail-visible-rows': adaptiveRowCount } as CSSProperties)
    : undefined

  return (
    <div
      className={[
        `rubro-detail-side rubro-detail-side--${side}`,
        panelLayout ? 'rubro-detail-panel' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {panelLayout ? (
        <div className="rubro-detail-panel-head">
          <h4 className="rubro-detail-side-title">{title}</h4>
          <span className="rubro-detail-panel-count">{items.length}</span>
        </div>
      ) : (
        <h4 className="rubro-detail-side-title">{title}</h4>
      )}
      {linkMode && !hideLinkHint ? (
        <p className="rubro-detail-link-hint">
          Tocá la <strong>fila</strong> del pendiente para{' '}
          {selectedTxIds != null ? 'elegir uno o más movimientos' : 'elegir el movimiento'}; otro clic en
          la misma fila lo quita.
        </p>
      ) : null}
      <div
        ref={tableWrapRef}
        className={[
          'table-wrap rubro-detail-table-wrap',
          adaptiveHeight ? '' : 'table-wrap--scrollY',
          adaptiveHeight
            ? 'rubro-detail-table-wrap--adaptive'
            : `rubro-detail-table-wrap--list-${visibleRows}`,
          fitsContent ? 'rubro-detail-table-wrap--fit' : adaptiveHeight ? 'table-wrap--scrollY' : '',
          keyboardNav != null ? 'rubro-detail-table-wrap--keynav' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={tableWrapStyle}
        tabIndex={keyboardNav != null ? -1 : undefined}
        role="region"
        aria-label={
          keyboardNav != null
            ? `${title}. Flechas para recorrer filas; izquierda/derecha cambia de tabla.`
            : `${title}.`
        }
        onMouseEnter={onTableMouseEnter}
      >
        <table className="data-table rubro-detail-table">
          <colgroup>
            <col className="rubro-detail-col-estado" />
            <col className="rubro-detail-col-date" />
            <col className="rubro-detail-col-amount" />
            <col className="rubro-detail-col-desc" />
          </colgroup>
          <thead>
            <tr>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Importe</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ m, pairId, groupId, groupLabel }) => {
              const pending = pairId == null && groupId == null
              const canToggle = linkMode && pending && onToggleTxId != null
              const selected =
                selectedTxIds != null ? selectedTxIds.has(m.id) : selectedTxId === m.id
              const keyboardFocused = keyboardNav?.focusedTxId === m.id
              return (
                <tr
                  key={m.id}
                  data-tx-id={m.id}
                  className={[
                    canToggle ? 'rubro-detail-row--linkable' : '',
                    selected ? 'rubro-detail-row--selected' : '',
                    keyboardFocused ? 'rubro-detail-row--keyboard-focus' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined}
                  aria-selected={canToggle ? selected : undefined}
                  onClick={
                    canToggle
                      ? () => {
                          onToggleTxId!(m.id)
                        }
                      : undefined
                  }
                >
                  <td className="rubro-detail-estado-td">
                    <span className="rubro-detail-estado-cell">
                      {pairId != null ? (
                        <button
                          type="button"
                          className="rubro-detail-pair-btn"
                          title="Ver el movimiento emparejado en el otro lado"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            onViewPair?.(pairId)
                          }}
                        >
                          par
                        </button>
                      ) : groupId != null ? (
                        <span className="rubro-detail-group-actions">
                          <button
                            type="button"
                            className="rubro-detail-group-badge rubro-detail-group-badge--btn"
                            title={
                              groupLabel != null
                                ? `${groupLabel}. Ir a la fila en comparativa.`
                                : `Grupo #${groupId}. Ir a la fila en comparativa.`
                            }
                            onClick={(ev) => {
                              ev.stopPropagation()
                              onScrollToGroup?.(groupId)
                            }}
                          >
                            grp
                          </button>
                          {onUnlinkGroup ? (
                            <button
                              type="button"
                              className="rubro-detail-unlink-group-btn"
                              title="Desvincular grupo"
                              aria-label="Desvincular grupo"
                              onClick={(ev) => {
                                ev.stopPropagation()
                                onUnlinkGroup(groupId)
                              }}
                            >
                              ×
                            </button>
                          ) : null}
                        </span>
                      ) : pending ? (
                        <span
                          className={
                            selected
                              ? 'rubro-detail-pending-badge rubro-detail-pending-badge--selected'
                              : 'rubro-detail-pending-badge'
                          }
                          title="Pendiente de conciliar"
                        >
                          pend.
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="cell-date-nowrap">{formatDisplayDate(m.txDate)}</td>
                  <td className="rubro-detail-amount-td">{formatAmount(m.amount)}</td>
                  <td className="rubro-detail-desc-td">
                    <div
                      className="cell-desc-inner scroll-x-muted"
                      title={movementSummaryLine(m)}
                      onMouseDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {movementSummaryLine(m)}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
