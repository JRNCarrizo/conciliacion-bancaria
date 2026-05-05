import { Client } from '@stomp/stompjs'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import SockJS from 'sockjs-client'
import { apiFetch, getStoredToken } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'

type ChatPanelContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  unreadTotal: number
  refreshUnread: () => Promise<void>
}

/** Disparado en cada frame de `/topic/chat.notify.*` para sincronizar UI (p. ej. lista del drawer). */
export const CHAT_NOTIFY_EVENT = 'conciliacion-chat-notify'

const ChatPanelContext = createContext<ChatPanelContextValue | null>(null)

export function ChatPanelProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  const [open, setOpen] = useState(false)
  const [unreadTotal, setUnreadTotal] = useState(0)

  const refreshUnread = useCallback(async () => {
    if (!getStoredToken()) return
    const r = await apiFetch('/api/v1/chat/unread-count')
    if (r.ok) {
      const j = (await r.json()) as { count: number }
      setUnreadTotal(typeof j.count === 'number' ? j.count : 0)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadTotal(0)
      return
    }
    void refreshUnread()
    const id = window.setInterval(() => void refreshUnread(), 55_000)
    return () => window.clearInterval(id)
  }, [isAuthenticated, refreshUnread])

  useEffect(() => {
    const onFocus = () => void refreshUnread()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshUnread])

  useEffect(() => {
    if (!isAuthenticated || user?.userId == null) return
    const token = getStoredToken()
    if (!token) return

    let stompSub: { unsubscribe: () => void } | undefined
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws') as unknown as WebSocket,
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        stompSub?.unsubscribe()
        stompSub = client.subscribe(`/topic/chat.notify.${user.userId}`, () => {
          void refreshUnread()
          window.dispatchEvent(new CustomEvent(CHAT_NOTIFY_EVENT))
        })
      },
    })
    client.activate()

    return () => {
      stompSub?.unsubscribe()
      void client.deactivate()
    }
  }, [isAuthenticated, user?.userId, refreshUnread])

  const value = useMemo(
    () => ({
      open,
      setOpen,
      unreadTotal,
      refreshUnread,
    }),
    [open, unreadTotal, refreshUnread],
  )

  return <ChatPanelContext.Provider value={value}>{children}</ChatPanelContext.Provider>
}

export function useChatPanel(): ChatPanelContextValue {
  const ctx = useContext(ChatPanelContext)
  if (!ctx) throw new Error('useChatPanel requiere ChatPanelProvider')
  return ctx
}
