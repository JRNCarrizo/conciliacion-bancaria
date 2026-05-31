import { useNavigate } from 'react-router-dom'
import type { ConciliacionShareRef } from '../conciliacion/utils/shareLink'
import { buildConciliacionSharePath } from '../conciliacion/utils/shareLink'

export function ChatConciliacionShareCard({ shareRef }: { shareRef: ConciliacionShareRef }) {
  const navigate = useNavigate()
  const path = buildConciliacionSharePath(shareRef)

  function openInConciliacion() {
    navigate(path, { state: { conciliacionRefocus: Date.now() } })
  }

  return (
    <button
      type="button"
      className="chat-share-card"
      onClick={openInConciliacion}
      title="Abrir en conciliación"
    >
      <span className="chat-share-card-kicker">Conciliación · sesión {shareRef.sessionId}</span>
      <span className="chat-share-card-label">{shareRef.label}</span>
      {shareRef.detail ? (
        <span className="chat-share-card-detail">{shareRef.detail}</span>
      ) : null}
      <span className="chat-share-card-action">Ver en la grilla →</span>
    </button>
  )
}
