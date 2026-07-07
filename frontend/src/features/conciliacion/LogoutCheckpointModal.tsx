import { useEffect, useState } from 'react'
import { createSessionCheckpoint } from './api/checkpoints'

export function LogoutCheckpointModal({
  sessionId,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  sessionId: number
  saving: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState('')

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, saving])

  return (
    <div className="comment-modal-backdrop session-checkpoint-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="comment-modal session-checkpoint-detail-modal session-checkpoint-logout-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-checkpoint-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="comment-modal-head session-checkpoint-detail-head">
          <div className="session-checkpoint-detail-head-block">
            <p className="session-checkpoint-kicker">Corte de jornada</p>
            <h3 id="logout-checkpoint-title" className="session-checkpoint-detail-title">
              Salir del sistema
            </h3>
          </div>
          <button
            type="button"
            className="comment-modal-close session-checkpoint-close"
            onClick={onCancel}
            disabled={saving}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <div className="session-checkpoint-detail-body">
          <p className="session-checkpoint-logout-intro">
            Se guardará un corte con el estado actual de la sesión #{sessionId} (PDF + resumen). La
            conciliación sigue abierta para retomar mañana.
          </p>
          <label className="comment-modal-label session-checkpoint-logout-label">
            <span>Nota (opcional)</span>
            <textarea
              className="comment-modal-input session-checkpoint-logout-input"
              rows={3}
              maxLength={512}
              value={note}
              disabled={saving}
              placeholder="Ej.: faltan comprobantes de EDESUR…"
              onChange={(ev) => setNote(ev.target.value)}
            />
          </label>
          {error ? <p className="msg err">{error}</p> : null}
        </div>

        <footer className="session-checkpoint-detail-footer">
          <div className="session-checkpoint-save-actions">
            <button type="button" className="btn-secondary" disabled={saving} onClick={onCancel}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-secondary session-checkpoint-pdf-primary"
              disabled={saving}
              onClick={() => onConfirm(note)}
            >
              {saving ? 'Guardando…' : 'Salir y guardar corte'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

export async function saveLogoutCheckpoint(sessionId: number, note: string): Promise<void> {
  await createSessionCheckpoint(sessionId, note.trim() || null)
}
