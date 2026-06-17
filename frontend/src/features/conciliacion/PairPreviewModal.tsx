import { useEffect } from 'react'
import type { PairPreviewData } from './utils/pairLookup'
import { comparisonPairRowKey } from './utils/pairLookup'
import { movementSummaryLine } from './utils/counterpartUtils'
import { formatAmount, formatDisplayDate } from './utils/format'
import { UnlinkPairButton } from './UnlinkPairButton'

function MovementCard({ title, m }: { title: string; m: PairPreviewData['bank'] }) {
  return (
    <div className="counterpart-card">
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

export function PairPreviewModal({
  data,
  onClose,
  onScrollToRow,
  canUnlink = false,
  onUnlinkPair,
}: {
  data: PairPreviewData
  onClose: () => void
  onScrollToRow?: (rowKey: string) => void
  canUnlink?: boolean
  onUnlinkPair?: (
    pairId: number,
    matchSource: 'MANUAL' | 'AUTO',
  ) => void | boolean | Promise<void | boolean>
}) {
  const { pair, bank, company, delta } = data
  const sourceLabel = pair.matchSource === 'MANUAL' ? 'Manual' : 'Automático'
  const matchSource = pair.matchSource === 'MANUAL' ? 'MANUAL' : 'AUTO'

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleUnlink() {
    if (!onUnlinkPair) return
    const result = await onUnlinkPair(pair.pairId, matchSource)
    if (result !== false) onClose()
  }

  return (
    <div className="comment-modal-backdrop counterpart-backdrop" role="presentation" onClick={onClose}>
      <div
        className="comment-modal counterpart-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pair-preview-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="comment-modal-head">
          <h3 id="pair-preview-title">Par conciliado #{pair.pairId}</h3>
          <button type="button" className="comment-modal-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <p className="counterpart-modal-hint">
          Origen: <strong>{sourceLabel}</strong>
          {pair.classification?.trim() ? (
            <>
              {' '}
              · Clasificación: <strong>{pair.classification.trim()}</strong>
            </>
          ) : null}
        </p>
        <div className="counterpart-compare-grid">
          <MovementCard title="Banco" m={bank} />
          <MovementCard title="Empresa" m={company} />
        </div>
        <p className="counterpart-delta">
          Δ (empresa − banco): {formatAmount(delta)}
          {Math.abs(delta) < 1e-9 ? ' · importes iguales' : null}
        </p>
        <footer className="counterpart-modal-actions">
          {canUnlink && onUnlinkPair ? (
            <UnlinkPairButton
              matchSource={matchSource}
              onClick={() => void handleUnlink()}
            />
          ) : null}
          {onScrollToRow ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onScrollToRow(comparisonPairRowKey(pair.pairId))}
            >
              Ver fila en Comparativa
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
