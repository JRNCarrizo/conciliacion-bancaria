export type ChatContact = {
  id: number
  username: string
  /** Presente si ya existe DM con esta persona. */
  conversationId: number | null
  /** ISO; última actividad del DM (p. ej. último mensaje). */
  lastActivityAt: string | null
  unreadCount: number
}

export type ChatConversation = {
  id: number
  peerUserId: number
  peerUsername: string
  updatedAt: string
  unreadCount: number
}

export type ChatMessage = {
  id: number
  conversationId: number
  senderId: number
  senderUsername: string
  body: string
  createdAt: string
  /** Solo aplica a mensajes propios: el otro participante ya los leyó (doble tilde). */
  readByPeer: boolean
}
