import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import {
  downloadAuthenticatedFile,
  openAuthenticatedFileInNewTab,
} from './api/authenticatedBlob'
import { parseError } from './api/http'
import { STATUS_LABEL, SESSION_STATUS_LABEL } from './constants'
import type { SessionCheckpoint } from './types'
import { formatAmount, formatCommentAuthor, formatPct, statusPanelClass } from './utils/format'

function checkpointDayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Corte'
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function checkpointTimeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function CheckpointDetailModal({
  sessionId,
  checkpoint,
  onClose,
}: {
  sessionId: number
  checkpoint: SessionCheckpoint
  onClose: () => void
}) {
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const stats = checkpoint.stats
  const statusLabel = STATUS_LABEL[stats.reconciliationStatus] ?? stats.reconciliationStatus
  const pdfPath = `/api/v1/conciliacion/sessions/${sessionId}/cortes/${checkpoint.id}/pdf`

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function openPdf() {
    setPdfLoading(true)
    setPdfError(null)
    try {
      await openAuthenticatedFileInNewTab(pdfPath)
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : String(e))
    } finally {
      setPdfLoading(false)
    }
  }

  async function downloadPdf() {
    setPdfLoading(true)
    setPdfError(null)
    try {
      await downloadAuthenticatedFile(
        pdfPath,
        `conciliacion-sesion-${sessionId}-corte-${checkpoint.id}.pdf`,
      )
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : String(e))
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="comment-modal-backdrop session-checkpoint-backdrop" role="presentation" onClick={onClose}>
      <div
        className="comment-modal session-checkpoint-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkpoint-detail-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="comment-modal-head session-checkpoint-detail-head">
          <div className="session-checkpoint-detail-head-block">
            <p className="session-checkpoint-kicker">Corte de jornada</p>
            <h3 id="checkpoint-detail-title" className="session-checkpoint-detail-title">
              <span className="session-checkpoint-detail-date">
                {checkpointDayLabel(checkpoint.createdAt)}
              </span>
              <span className="session-checkpoint-detail-time">
                {checkpointTimeLabel(checkpoint.createdAt)}
              </span>
            </h3>
            <div className="session-checkpoint-detail-meta-row">
              <span className="session-checkpoint-meta-chip session-checkpoint-meta-chip--user">
                {formatCommentAuthor(checkpoint.createdByUsername)}
              </span>
              <span className="session-checkpoint-meta-chip">
                {SESSION_STATUS_LABEL[checkpoint.sessionStatusAtSave] ??
                  checkpoint.sessionStatusAtSave}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="comment-modal-close session-checkpoint-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="session-checkpoint-detail-body">
          {checkpoint.note ? (
            <blockquote className="session-checkpoint-detail-note">{checkpoint.note}</blockquote>
          ) : null}

          <div
            className={`session-checkpoint-status exec-status ${statusPanelClass(stats.reconciliationStatus)}`}
          >
            <span className="session-checkpoint-status-label">Estado del reporte</span>
            <span className="session-checkpoint-status-value">{statusLabel}</span>
          </div>

          <div className="session-checkpoint-kpi-grid">
            <div className="session-checkpoint-kpi">
              <span className="session-checkpoint-kpi-label">Pares conciliados</span>
              <span className="session-checkpoint-kpi-value">{checkpoint.matchedPairs}</span>
            </div>
            <div className="session-checkpoint-kpi">
              <span className="session-checkpoint-kpi-label">Pendientes banco</span>
              <span className="session-checkpoint-kpi-value">{checkpoint.unmatchedBankCount}</span>
            </div>
            <div className="session-checkpoint-kpi">
              <span className="session-checkpoint-kpi-label">Pendientes empresa</span>
              <span className="session-checkpoint-kpi-value">{checkpoint.unmatchedCompanyCount}</span>
            </div>
            <div className="session-checkpoint-kpi session-checkpoint-kpi--wide">
              <span className="session-checkpoint-kpi-label">Diferencia total</span>
              <span className="session-checkpoint-kpi-value">{formatAmount(stats.differenceTotal)}</span>
            </div>
          </div>

          <dl className="session-checkpoint-stats">
            <div className="session-checkpoint-stat-row">
              <dt>Suma pendientes banco / empresa</dt>
              <dd>
                {formatAmount(stats.sumPendingBank)} / {formatAmount(stats.sumPendingCompany)}
              </dd>
            </div>
            <div className="session-checkpoint-stat-row">
              <dt>% conciliado banco / empresa</dt>
              <dd>
                {formatPct(stats.pctRowsReconciledBank)} / {formatPct(stats.pctRowsReconciledCompany)}
              </dd>
            </div>
          </dl>
        </div>

        <footer className="session-checkpoint-detail-footer">
          <p className="session-checkpoint-pdf-hint">
            El PDF incluye pares y pendientes tal como estaban al guardar este corte.
          </p>
          {pdfError ? <p className="msg err session-checkpoint-pdf-err">{pdfError}</p> : null}
          <div className="session-checkpoint-save-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={pdfLoading}
              onClick={() => void openPdf()}
            >
              {pdfLoading ? 'Abriendo…' : 'Ver PDF'}
            </button>
            <button
              type="button"
              className="btn-secondary session-checkpoint-pdf-primary"
              disabled={pdfLoading}
              onClick={() => void downloadPdf()}
            >
              Descargar PDF
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export function SessionCheckpointsSection({
  sessionId,
  refreshKey,
}: {
  sessionId: number
  /** Incrementar tras acciones que cambian el detalle (conciliar, desvincular, etc.). */
  refreshKey?: number
}) {
  const [checkpoints, setCheckpoints] = useState<SessionCheckpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<SessionCheckpoint | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch(`/api/v1/conciliacion/sessions/${sessionId}/cortes`)
      if (!r.ok) throw new Error(await parseError(r))
      setCheckpoints((await r.json()) as SessionCheckpoint[])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setCheckpoints([])
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  return (
    <section className="session-checkpoints" aria-labelledby="session-checkpoints-title">
      <div className="session-checkpoints-head">
        <div>
          <h4 id="session-checkpoints-title" className="session-checkpoints-title">
            Cortes de jornada
          </h4>
          <p className="session-checkpoints-hint">
            Fotos consultables del avance (PDF + resumen). Al pulsar <strong>Salir</strong> podés
            dejar una nota opcional; la conciliación sigue abierta entre cortes.
          </p>
        </div>
      </div>

      {loading ? <p className="msg subtle">Cargando cortes…</p> : null}
      {error ? <p className="msg err">{error}</p> : null}
      {!loading && !error && checkpoints.length === 0 ? (
        <p className="msg subtle session-checkpoints-empty">
          Todavía no hay cortes. Al salir del sistema se archivará el estado del día.
        </p>
      ) : null}

      {!loading && !error && checkpoints.length > 0 ? (
        <ul className="session-checkpoint-list">
          {checkpoints.map((cp) => {
            const pendingTotal = cp.unmatchedBankCount + cp.unmatchedCompanyCount
            return (
              <li key={cp.id}>
                <button type="button" className="session-checkpoint-row" onClick={() => setSelected(cp)}>
                  <span className="session-checkpoint-row-main">
                    <span className="session-checkpoint-row-day">{checkpointDayLabel(cp.createdAt)}</span>
                    <span className="session-checkpoint-row-time">{checkpointTimeLabel(cp.createdAt)}</span>
                  </span>
                  <span className="session-checkpoint-row-stats">
                    {cp.matchedPairs} pares · {pendingTotal} pend.
                  </span>
                  <span className="session-checkpoint-row-user">{formatCommentAuthor(cp.createdByUsername)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {selected ? (
        <CheckpointDetailModal sessionId={sessionId} checkpoint={selected} onClose={() => setSelected(null)} />
      ) : null}
    </section>
  )
}
