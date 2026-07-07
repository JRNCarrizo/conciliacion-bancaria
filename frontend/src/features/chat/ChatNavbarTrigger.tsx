import { useAuth } from '../../auth/AuthContext'
import { useChatPanel } from './ChatPanelContext'

const CAN_CHAT = ['ADMIN', 'OPERADOR', 'CONSULTA'] as const

export function ChatNavbarTrigger() {
  const { isAuthenticated, user } = useAuth()
  const { setOpen, unreadTotal } = useChatPanel()

  if (!isAuthenticated || !user || !CAN_CHAT.includes(user.role)) {
    return null
  }

  const badge =
    unreadTotal > 0 ? (unreadTotal > 99 ? '99+' : String(unreadTotal)) : null

  return (
    <button
      type="button"
      className="app-navbar-chat-btn"
      onClick={() => setOpen(true)}
      aria-label={badge ? `Mensajes (${unreadTotal} sin leer)` : 'Mensajes'}
      title="Mensajes"
    >
      <svg className="app-navbar-chat-icon" width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="currentColor"
          d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"
        />
        <path fill="currentColor" d="M7 9h10v2H7zm0-3h7v2H7z" opacity=".85" />
      </svg>
      {badge ? (
        <span className="app-navbar-chat-badge" aria-hidden>
          {badge}
        </span>
      ) : null}
    </button>
  )
}
