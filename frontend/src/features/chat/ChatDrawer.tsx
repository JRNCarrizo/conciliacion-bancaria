import { Client } from '@stomp/stompjs'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import SockJS from 'sockjs-client'
import { apiFetch, getStoredToken } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { parseError } from '../conciliacion/api/http'
import './chat-drawer.css'
import './chat.css'
import { CHAT_NOTIFY_EVENT, useChatPanel } from './ChatPanelContext'
import type { ChatContact, ChatConversation, ChatMessage } from './types'

function normalizeMessage(raw: ChatMessage): ChatMessage {
  return {
    id: raw.id,
    conversationId: raw.conversationId,
    senderId: raw.senderId,
    senderUsername: raw.senderUsername,
    body: raw.body,
    createdAt: raw.createdAt,
    readByPeer: Boolean(raw.readByPeer),
  }
}

function normalizeContact(raw: ChatContact): ChatContact {
  return {
    id: raw.id,
    username: raw.username,
    conversationId: typeof raw.conversationId === 'number' ? raw.conversationId : null,
    lastActivityAt: typeof raw.lastActivityAt === 'string' ? raw.lastActivityAt : null,
    unreadCount: typeof raw.unreadCount === 'number' ? raw.unreadCount : 0,
  }
}

export function ChatDrawer() {
  const { open, setOpen, refreshUnread } = useChatPanel()
  const { user } = useAuth()
  const myId = user?.userId

  const [screen, setScreen] = useState<'picker' | 'thread'>('picker')

  const [directory, setDirectory] = useState<ChatContact[]>([])
  const [active, setActive] = useState<ChatConversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [listError, setListError] = useState<string | null>(null)
  const [sendHint, setSendHint] = useState<string | null>(null)

  const stompRef = useRef<Client | null>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)

  const loadLists = useCallback(async () => {
    setListError(null)
    try {
      const cr = await apiFetch('/api/v1/chat/contacts')
      if (!cr.ok) throw new Error(await parseError(cr))
      const list = (await cr.json()) as ChatContact[]
      setDirectory(list.map(normalizeContact))
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    if (!open) return
    void loadLists().then(() => {
      setScreen('picker')
      setActive(null)
    })
  }, [open, loadLists])

  useEffect(() => {
    if (!open) return
    function onKey(ev: KeyboardEvent) {
      if (ev.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useEffect(() => {
    if (!open) return
    const onNotify = () => void loadLists()
    window.addEventListener(CHAT_NOTIFY_EVENT, onNotify)
    return () => window.removeEventListener(CHAT_NOTIFY_EVENT, onNotify)
  }, [open, loadLists])

  const loadMessages = useCallback(async (conversationId: number) => {
    const r = await apiFetch(`/api/v1/chat/conversations/${conversationId}/messages?page=0&size=200`)
    if (!r.ok) {
      setSendHint(await parseError(r))
      setMessages([])
      return
    }
    const page = (await r.json()) as { content: ChatMessage[] }
    const sorted = [...page.content.map(normalizeMessage)].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    setMessages(sorted)
    setSendHint(null)
  }, [])

  useEffect(() => {
    if (!active?.id) {
      setMessages([])
      return
    }
    void loadMessages(active.id)
  }, [active, loadMessages])

  useEffect(() => {
    if (screen !== 'thread') return
    const id = window.requestAnimationFrame(() => {
      const el = messagesScrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [messages, screen])

  useEffect(() => {
    if (!active?.id || !open) return
    void (async () => {
      await apiFetch(`/api/v1/chat/conversations/${active.id}/read`, { method: 'POST' })
      await refreshUnread()
      void loadLists()
    })()
  }, [active?.id, open, refreshUnread, loadLists])

  useEffect(() => {
    const token = getStoredToken()
    if (!token || !active || myId == null || !open || screen !== 'thread') {
      stompRef.current?.deactivate()
      stompRef.current = null
      return
    }

    const convId = active.id
    let stompSubChat: { unsubscribe: () => void } | undefined
    let stompSubNotify: { unsubscribe: () => void } | undefined
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws') as unknown as WebSocket,
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 4000,
      onConnect: () => {
        stompSubChat?.unsubscribe()
        stompSubNotify?.unsubscribe()
        stompSubChat = client.subscribe(`/topic/chat.${convId}`, (frame) => {
          try {
            const msg = JSON.parse(frame.body) as ChatMessage
            const normalized = normalizeMessage(msg)
            setMessages((prev) => {
              if (prev.some((m) => m.id === normalized.id)) return prev
              return [...prev, normalized].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
              )
            })
            void (async () => {
              if (normalized.senderId !== myId) {
                await apiFetch(`/api/v1/chat/conversations/${convId}/read`, { method: 'POST' })
              }
              await refreshUnread()
              void loadLists()
            })()
          } catch {
            /* ignore */
          }
        })
        stompSubNotify = client.subscribe(`/topic/chat.notify.${myId}`, (frame) => {
          try {
            const j = JSON.parse(frame.body) as {
              type?: string
              conversationId?: number
              lastReadMessageId?: number
            }
            if (
              j.type !== 'readReceipt' ||
              j.conversationId !== convId ||
              typeof j.lastReadMessageId !== 'number'
            ) {
              return
            }
            const lid = j.lastReadMessageId
            setMessages((prev) =>
              prev.map((m) =>
                m.senderId === myId && m.id <= lid ? { ...m, readByPeer: true } : m,
              ),
            )
          } catch {
            /* ignore */
          }
        })
      },
      onStompError: () => {
        setSendHint('Error de conexión en tiempo real; esperá o reintentá.')
      },
    })
    client.activate()
    stompRef.current = client

    return () => {
      stompSubChat?.unsubscribe()
      stompSubNotify?.unsubscribe()
      client.deactivate()
      stompRef.current = null
    }
  }, [active, myId, loadLists, open, screen, refreshUnread])

  async function openWithPeer(peerUserId: number) {
    setListError(null)
    try {
      const r = await apiFetch('/api/v1/chat/conversations/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerUserId }),
      })
      if (!r.ok) throw new Error(await parseError(r))
      const conv = (await r.json()) as ChatConversation
      setActive(conv)
      setScreen('thread')
      void loadLists()
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e))
    }
  }

  function pickConversation(t: ChatConversation) {
    setActive(t)
    setScreen('thread')
  }

  function openRow(c: ChatContact) {
    if (c.conversationId != null) {
      pickConversation({
        id: c.conversationId,
        peerUserId: c.id,
        peerUsername: c.username,
        updatedAt: c.lastActivityAt ?? '',
        unreadCount: c.unreadCount,
      })
    } else {
      void openWithPeer(c.id)
    }
  }

  function send(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !active) return
    const client = stompRef.current
    if (!client?.connected) {
      setSendHint('Sin conexión todavía; esperá un instante.')
      return
    }
    client.publish({
      destination: '/app/chat.send',
      body: JSON.stringify({ conversationId: active.id, body: text }),
    })
    setDraft('')
    setSendHint(null)
    void refreshUnread()
    void loadLists()
  }

  function backToPicker() {
    setScreen('picker')
    setActive(null)
    void loadLists()
  }

  if (!open) return null

  return (
    <>
      <div className="chat-drawer-backdrop" role="presentation" onClick={() => setOpen(false)} />

      <div className="chat-drawer-sheet" role="dialog" aria-modal="true" aria-labelledby="chat-drawer-title">
        {screen === 'picker' ? (
          <>
            <div className="chat-drawer-head">
              <h2 id="chat-drawer-title">Mensajes</h2>
              <button type="button" onClick={() => setOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="chat-drawer-body">
              {listError ? <p className="chat-error">{listError}</p> : null}

              <div className="chat-drawer-scroll">
                {directory.length === 0 ? (
                  <p className="chat-muted">No hay otros usuarios para escribir.</p>
                ) : (
                  directory.map((c) => (
                    <button key={c.id} type="button" className="chat-drawer-row" onClick={() => openRow(c)}>
                      <span className="chat-drawer-row-label">{c.username}</span>
                      {c.unreadCount > 0 ? (
                        <span className="chat-drawer-badge" title="Mensajes sin leer">
                          {c.unreadCount > 99 ? '99+' : c.unreadCount}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="chat-drawer-head">
              <button type="button" onClick={backToPicker} aria-label="Volver">
                ←
              </button>
              <h2 id="chat-drawer-title">{active?.peerUsername ?? 'Chat'}</h2>
              <button type="button" onClick={() => setOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="chat-drawer-body chat-drawer-thread">
              <div ref={messagesScrollRef} className="chat-drawer-thread-messages chat-messages">
                {messages.map((m) => {
                  const mine = m.senderId === myId
                  return (
                    <div key={m.id} className={`chat-bubble ${mine ? 'chat-bubble--mine' : ''}`}>
                      <div className="chat-bubble-meta">
                        {mine ? 'Vos' : m.senderUsername}
                        {' · '}
                        {new Date(m.createdAt).toLocaleString(undefined, {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </div>
                      <div className="chat-bubble-text">{m.body}</div>
                      {mine ? (
                        <div className="chat-bubble-ticks-wrap">
                          <span
                            className={`chat-msg-ticks ${m.readByPeer ? 'chat-msg-ticks--read' : ''}`}
                            aria-label={m.readByPeer ? 'Leído' : 'Entregado'}
                            title={m.readByPeer ? 'Leído' : 'Entregado'}
                          >
                            {m.readByPeer ? '✓✓' : '✓'}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
              {sendHint ? <p className="chat-muted">{sendHint}</p> : null}
              <form className="chat-compose chat-drawer-compose" onSubmit={send}>
                <input
                  value={draft}
                  onChange={(ev) => setDraft(ev.target.value)}
                  placeholder="Mensaje…"
                  maxLength={4000}
                  autoComplete="off"
                />
                <button type="submit" className="btn-secondary">
                  Enviar
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </>
  )
}
