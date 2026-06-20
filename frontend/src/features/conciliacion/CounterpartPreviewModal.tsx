import { useEffect } from 'react'
import type { MovimientoDto } from './types'
import type { CounterpartInspectMode, CounterpartSide } from './utils/counterpartUtils'
import { comparisonRowKey, movementSummaryLine } from './utils/counterpartUtils'
import { formatAmount, formatDisplayDate } from './utils/format'

function MovementCard({
  title,
  m,
  side,
  highlight,
}: {
  title: string
  m: MovimientoDto
  side: 'bank' | 'company'
  highlight?: boolean
}) {
  return (
    <div
      className={`counterpart-card counterpart-card--${side} ${highlight ? 'counterpart-card--highlight' : ''}`}
    >
      <h4 className="counterpart-card-title">{title}</h4>
      <dl className="counterpart-card-dl">
        <div>
          <dt>ID</dt>
          <dd>{m.id}</dd>
        </div>
        <div>
          <dt>Fecha</dt>
          <dd>{formatDisplayDate(m.txDate)}</dd>
        </div>
        <div>
          <dt>Importe</dt>
          <dd>{formatAmount(m.amount)}</dd>
        </div>
        <div className="counterpart-card-dl--wide">
          <dt>Detalle</dt>
          <dd>{movementSummaryLine(m)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function CounterpartPreviewModal({
  mode,
  side,
  mov,
  counterpart,
  duplicateSiblings,
  reconcileLocked,
  linkLoading,
  onClose,
  onLink,
  onScrollToRow,
}: {
  mode: CounterpartInspectMode
  side: CounterpartSide
  mov: MovimientoDto
  counterpart: MovimientoDto | null
  duplicateSiblings: MovimientoDto[]
  reconcileLocked: boolean
  linkLoading: boolean
  onClose: () => void
  onLink?: (bankId: number, companyId: number) => void
  onScrollToRow?: (rowKey: string) => void
}) {
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const canLink =
    mode === 'fuzzy' &&
    !reconcileLocked &&
    counterpart != null &&
    onLink != null &&
    ((side === 'bank' && mov.id != null && counterpart.id != null) ||
      (side === 'company' && mov.id != null && counterpart.id != null))

  const bankId = side === 'bank' ? mov.id : counterpart?.id
  const companyId = side === 'company' ? mov.id : counterpart?.id

  let deltaLabel: string | null = null
  if (mode === 'fuzzy' && counterpart != null) {
    const delta = Number(counterpart.amount) - Number(mov.amount)
    deltaLabel =
      Math.abs(delta) < 1e-9
        ? 'Importes iguales'
        : `Diferencia (empresa − banco): ${formatAmount(delta)}`
  }

  return (
    <div className="comment-modal-backdrop counterpart-backdrop" role="presentation" onClick={onClose}>
      <div
        className="comment-modal counterpart-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="counterpart-modal-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="comment-modal-head">
          <h3 id="counterpart-modal-title">
            {mode === 'fuzzy' ? 'Posible match' : 'Duplicado en archivo'}
          </h3>
          <button type="button" className="comment-modal-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        {mode === 'fuzzy' ? (
          <>
            <p className="counterpart-modal-hint">
              Comparación sugerida entre pendientes (importe y fecha cercanos). Si es el mismo movimiento,
              vinculá manualmente; si no, cerrá y seguí revisando.
            </p>
            <div className="counterpart-compare-grid counterpart-compare-grid--split">
              <MovementCard
                title={side === 'bank' ? 'Banco (esta fila)' : 'Empresa (esta fila)'}
                m={mov}
                side={side}
                highlight
              />
              {counterpart ? (
                <MovementCard
                  title={side === 'bank' ? 'Empresa (candidato)' : 'Banco (candidato)'}
                  m={counterpart}
                  side={side === 'bank' ? 'company' : 'bank'}
                />
              ) : (
                <div
                  className={`counterpart-card counterpart-card--empty counterpart-card--${side === 'bank' ? 'company' : 'bank'}`}
                >
                  <p>No se encontró el movimiento candidato (puede haberse vinculado o filtrado).</p>
                </div>
              )}
            </div>
            {deltaLabel ? <p className="counterpart-delta">{deltaLabel}</p> : null}
          </>
        ) : (
          <>
            <p className="counterpart-modal-hint">
              Hay más de un movimiento con la misma fecha e importe en este lado. Revisá si es repetición en el
              Excel o si uno debería emparejarse al otro lado.
            </p>
            <MovementCard
              title={side === 'bank' ? 'Banco (esta fila)' : 'Empresa (esta fila)'}
              m={mov}
              side={side}
              highlight
            />
            {duplicateSiblings.length > 0 ? (
              <div className="counterpart-dup-list">
                <h4 className="counterpart-dup-list-title">Mismo importe y fecha en este lado</h4>
                <ul className="counterpart-dup-cards">
                  {duplicateSiblings.map((s) => (
                    <li key={s.id} className="counterpart-dup-item">
                      <MovementCard
                        title={
                          side === 'bank'
                            ? `Banco · ID ${s.id}`
                            : `Empresa · ID ${s.id}`
                        }
                        m={s}
                        side={side}
                      />
                      {onScrollToRow ? (
                        <button
                          type="button"
                          className="btn-link counterpart-dup-scroll"
                          onClick={() => onScrollToRow(comparisonRowKey(side, s.id))}
                        >
                          Ver en tabla
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="counterpart-modal-hint">No hay otros movimientos con el mismo criterio visibles.</p>
            )}
          </>
        )}

        <footer className="counterpart-modal-actions">
          {onScrollToRow ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onScrollToRow(comparisonRowKey(side, mov.id))}
            >
              Ver esta fila en la tabla
            </button>
          ) : null}
          {counterpart != null && onScrollToRow ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() =>
                onScrollToRow(
                  comparisonRowKey(side === 'bank' ? 'company' : 'bank', counterpart.id),
                )
              }
            >
              Ver candidato en la tabla
            </button>
          ) : null}
          {canLink && bankId != null && companyId != null ? (
            <button
              type="button"
              className="btn-import"
              disabled={linkLoading}
              onClick={() => onLink!(bankId, companyId)}
            >
              {linkLoading ? 'Vinculando…' : 'Vincular estos dos'}
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  )
}
