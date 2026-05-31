import { useEffect, useState } from 'react'
import { updateSessionDisplayName } from './api/sessions'
import type { SessionSummary } from './types'
import { SessionSourceFiles } from './SessionSourceFiles'
import { formatSessionDisplayName, formatSessionListSubtitle } from './utils/sessionDisplayName'
import { sessionStatusLabel } from './utils/format'

export function SessionHistoryList({
  sessions,
  selectedId,
  exportLoading,
  onOpen,
  onActivity,
  onExportExcel,
  onExportPdf,
}: {
  sessions: SessionSummary[]
  selectedId: number | null
  exportLoading: boolean
  onOpen: (sessionId: number) => void
  onActivity: (sessionId: number) => void
  onExportExcel: (sessionId: number) => void
  onExportPdf: (sessionId: number) => void
}) {
  return (
    <div className="session-history-scroll">
      <ul className="session-history-list">
      {sessions.map((s) => {
        const pendingApprox = Math.max(0, s.bankRowCount + s.companyRowCount - s.matchedPairs * 2)
        return (
          <li key={s.id}>
            <article
              className={[
                'session-history-card',
                selectedId === s.id ? 'session-history-card--active' : '',
                s.status === 'CLOSED' ? 'session-history-card--closed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="session-history-card-main">
                <div className="session-history-card-head">
                  <h3 className="session-history-card-title">{formatSessionDisplayName(s)}</h3>
                  <span
                    className={`session-status-pill session-status-pill--${s.status.toLowerCase()} session-history-card-status`}
                  >
                    {sessionStatusLabel(s.status)}
                  </span>
                </div>
                <p className="session-history-card-subtitle">{formatSessionListSubtitle(s)}</p>
                <SessionSourceFiles
                  bankFileName={s.sourceBankFileName}
                  companyFileName={s.sourceCompanyFileName}
                  variant="compact"
                />
                <dl className="session-history-card-stats">
                  <div>
                    <dt>Pares</dt>
                    <dd>{s.matchedPairs}</dd>
                  </div>
                  <div>
                    <dt>Pend. aprox.</dt>
                    <dd>{pendingApprox}</dd>
                  </div>
                  <div>
                    <dt>Filas B/E</dt>
                    <dd>
                      {s.bankRowCount}/{s.companyRowCount}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="session-history-card-actions history-actions">
                <button type="button" className="history-open-btn" onClick={() => onOpen(s.id)}>
                  Abrir
                </button>
                <button
                  type="button"
                  className="history-audit-btn"
                  title="Ver actividad de la sesión"
                  onClick={() => onActivity(s.id)}
                >
                  Actividad
                </button>
                <button
                  type="button"
                  className="history-excel-link"
                  disabled={exportLoading}
                  onClick={() => onExportExcel(s.id)}
                >
                  Excel
                </button>
                <button
                  type="button"
                  className="history-pdf-link"
                  title="Informe en PDF: resumen, conciliados y pendientes"
                  disabled={exportLoading}
                  onClick={() => onExportPdf(s.id)}
                >
                  PDF
                </button>
              </div>
            </article>
          </li>
        )
      })}
      </ul>
    </div>
  )
}

export function SessionDisplayNameEditor({
  sessionId,
  createdAt,
  displayName,
  readOnly,
  onSaved,
}: {
  sessionId: number
  createdAt: string
  displayName: string | null | undefined
  readOnly: boolean
  onSaved: (displayName: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editing) setDraft(displayName ?? '')
  }, [displayName, editing])

  const title = formatSessionDisplayName({ id: sessionId, createdAt, displayName })
  const subtitle = formatSessionListSubtitle({ id: sessionId, createdAt, displayName })

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const next = draft.trim() === '' ? null : draft.trim()
      const saved = await updateSessionDisplayName(sessionId, next)
      onSaved(saved)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    setDraft(displayName ?? '')
    setError(null)
    setEditing(false)
  }

  return (
    <div className="session-display-name-editor">
      {editing ? (
        <div className="session-display-name-form">
          <label className="session-display-name-label" htmlFor={`session-name-${sessionId}`}>
            Nombre de la sesión
          </label>
          <input
            id={`session-name-${sessionId}`}
            className="session-display-name-input"
            type="text"
            maxLength={120}
            value={draft}
            disabled={saving}
            placeholder="Ej.: Octubre 2025"
            onChange={(ev) => setDraft(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') void save()
              if (ev.key === 'Escape') cancel()
            }}
          />
          {error ? <p className="msg err session-display-name-err">{error}</p> : null}
          <div className="session-display-name-actions">
            <button type="button" className="btn-secondary" disabled={saving} onClick={cancel}>
              Cancelar
            </button>
            <button type="button" className="btn-secondary session-display-name-save" disabled={saving} onClick={() => void save()}>
              {saving ? 'Guardando…' : 'Guardar nombre'}
            </button>
          </div>
        </div>
      ) : (
        <div className="session-display-name-view">
          <p className="session-display-name-kicker">Nombre de la sesión</p>
          <h3 className="session-detail-title">{title}</h3>
          <p className="session-detail-subtitle">{subtitle}</p>
          {!readOnly ? (
            <button
              type="button"
              className="btn-secondary session-display-name-edit"
              onClick={() => setEditing(true)}
            >
              Editar nombre
            </button>
          ) : (
            <p className="session-display-name-readonly-hint">Solo lectura (perfil consulta)</p>
          )}
        </div>
      )}
    </div>
  )
}
