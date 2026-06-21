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
  visibleRows?: 5 | 10
  /** Altura según cantidad de filas (mín. 1, máx. visibleRows). */
  adaptiveHeight?: boolean
  /** Oculta el hint de pend. (el panel padre ya lo explica). */
  hideLinkHint?: boolean
}) {
  if (items.length === 0) {
    return (
      <div className={`rubro-detail-side rubro-detail-side--${side}`}>
        <h4 className="rubro-detail-side-title">{title}</h4>
        <p className="rubro-detail-empty">Sin movimientos.</p>
      </div>
    )
  }

  const keyboardActive = keyboardNav?.tableActive === true
  const adaptiveRowCount = Math.min(visibleRows, Math.max(1, items.length))
  const tableWrapStyle = adaptiveHeight
    ? ({ '--rubro-detail-visible-rows': adaptiveRowCount } as CSSProperties)
    : undefined

  return (
    <div
      className={[
        `rubro-detail-side rubro-detail-side--${side}`,
        keyboardActive ? 'rubro-detail-side--keyboard-active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <h4 className="rubro-detail-side-title">{title}</h4>
      {linkMode && !hideLinkHint ? (
        <p className="rubro-detail-link-hint">
          Tocá <strong>pend.</strong> para{' '}
          {selectedTxIds != null ? 'elegir uno o más movimientos' : 'elegir el movimiento'}; otro clic en
          el mismo lo quita.
        </p>
      ) : null}
      <div
        ref={tableWrapRef}
        className={[
          'table-wrap table-wrap--scrollY rubro-detail-table-wrap',
          adaptiveHeight
            ? 'rubro-detail-table-wrap--adaptive'
            : `rubro-detail-table-wrap--list-${visibleRows}`,
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
            <col className="rubro-detail-col-id" />
            <col className="rubro-detail-col-date" />
            <col className="rubro-detail-col-amount" />
            <col className="rubro-detail-col-desc" />
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>Fecha</th>
              <th>Importe</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ m, pairId, groupId }) => {
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
                    selected ? 'rubro-detail-row--selected' : '',
                    keyboardFocused ? 'rubro-detail-row--keyboard-focus' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined}
                >
                  <td className="rubro-detail-id-td">
                    <span className="rubro-detail-id-cell">
                      <span className="rubro-detail-id-num">{m.id}</span>
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
                            title={`Grupo #${groupId}. Ir a la fila en comparativa.`}
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
                        linkMode && onToggleTxId != null ? (
                          <button
                            type="button"
                            className={
                              selected
                                ? 'rubro-detail-pending-btn rubro-detail-pending-btn--active'
                                : 'rubro-detail-pending-btn'
                            }
                            disabled={!canToggle}
                            aria-pressed={selected}
                            title={
                              selected
                                ? 'Quitar selección para vincular'
                                : 'Seleccionar para vincular con el otro lado'
                            }
                            onClick={(ev) => {
                              ev.stopPropagation()
                              if (canToggle) onToggleTxId(m.id)
                            }}
                          >
                            pend.
                          </button>
                        ) : (
                          <span className="rubro-detail-pending-badge" title="Pendiente de conciliar">
                            pend.
                          </span>
                        )
                      ) : null}
                    </span>
                  </td>
                  <td className="cell-date-nowrap">{formatDisplayDate(m.txDate)}</td>
                  <td>{formatAmount(m.amount)}</td>
                  <td className="cell-desc">{movementSummaryLine(m)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
