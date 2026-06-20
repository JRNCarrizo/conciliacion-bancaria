import { movementSummaryLine } from './utils/counterpartUtils'
import type { RubroMovementRef } from './utils/rubroGroups'
import { formatAmount, formatDisplayDate } from './utils/format'

export function MovementMiniTable({
  side,
  title,
  items,
  linkMode,
  selectedTxId,
  onToggleTxId,
  onViewPair,
}: {
  side: 'bank' | 'company'
  title: string
  items: RubroMovementRef[]
  linkMode?: boolean
  selectedTxId?: number | null
  /** Clic en pend.: alterna selección (mismo id → deselecciona). */
  onToggleTxId?: (id: number) => void
  /** Clic en par: ver el otro lado del emparejamiento. */
  onViewPair?: (pairId: number) => void
}) {
  if (items.length === 0) {
    return (
      <div className={`rubro-detail-side rubro-detail-side--${side}`}>
        <h4 className="rubro-detail-side-title">{title}</h4>
        <p className="rubro-detail-empty">Sin movimientos.</p>
      </div>
    )
  }
  return (
    <div className={`rubro-detail-side rubro-detail-side--${side}`}>
      <h4 className="rubro-detail-side-title">{title}</h4>
      {linkMode ? (
        <p className="rubro-detail-link-hint">
          Tocá <strong>pend.</strong> para elegir el movimiento; otro clic en el mismo lo quita.
        </p>
      ) : null}
      <div className="table-wrap rubro-detail-table-wrap">
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
            {items.map(({ m, pairId }) => {
              const pending = pairId == null
              const canToggle = linkMode && pending && onToggleTxId != null
              const selected = selectedTxId === m.id
              return (
                <tr
                  key={m.id}
                  className={selected ? 'rubro-detail-row--selected' : undefined}
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
