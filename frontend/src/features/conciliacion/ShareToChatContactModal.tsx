import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { useChatPanel } from '../chat/ChatPanelContext'
import type { ChatContact } from '../chat/types'
import { parseError } from './api/http'
import type { ConciliacionShareRef } from './utils/shareLink'

function normalizeContact(raw: ChatContact): ChatContact {
  return {
    id: raw.id,
    username: raw.username,
    conversationId: typeof raw.conversationId === 'number' ? raw.conversationId : null,
    lastActivityAt: typeof raw.lastActivityAt === 'string' ? raw.lastActivityAt : null,
    unreadCount: typeof raw.unreadCount === 'number' ? raw.unreadCount : 0,
  }
}

export function ShareToChatContactModal({
  shareRef,
  onClose,
}: {
  shareRef: ConciliacionShareRef
  onClose: () => void
}) {
  const { openChatWithShare } = useChatPanel()
  const [contacts, setContacts] = useState<ChatContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await apiFetch('/api/v1/chat/contacts')
      if (!r.ok) throw new Error(await parseError(r))
      const list = (await r.json()) as ChatContact[]
      setContacts(list.map(normalizeContact))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function pick(c: ChatContact) {
    openChatWithShare(c.id, shareRef)
    onClose()
  }

  return (
    <div className="comment-modal-backdrop share-chat-backdrop" role="presentation" onClick={onClose}>
      <div
        className="comment-modal share-chat-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-chat-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <header className="comment-modal-head">
          <h3 id="share-chat-title">Compartir en chat</h3>
          <button type="button" className="comment-modal-close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <p className="comment-modal-hint share-chat-preview-label">{shareRef.label}</p>
        {shareRef.detail ? (
          <p className="comment-modal-hint share-chat-preview-detail">{shareRef.detail}</p>
        ) : null}
        <p className="comment-modal-hint">
          Elegí a quién enviarlo. Se abrirá el chat con esta referencia; podés agregar un mensaje y
          enviar.
        </p>
        {loading ? <p className="msg subtle">Cargando contactos…</p> : null}
        {error ? <p className="msg err">{error}</p> : null}
        {!loading && !error && contacts.length === 0 ? (
          <p className="msg subtle">No hay otros usuarios para escribir.</p>
        ) : null}
        {!loading && !error && contacts.length > 0 ? (
          <ul className="share-chat-contact-list">
            {contacts.map((c) => (
              <li key={c.id}>
                <button type="button" className="share-chat-contact-row" onClick={() => pick(c)}>
                  <span>{c.username}</span>
                  {c.unreadCount > 0 ? (
                    <span className="chat-drawer-badge">{c.unreadCount > 99 ? '99+' : c.unreadCount}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
