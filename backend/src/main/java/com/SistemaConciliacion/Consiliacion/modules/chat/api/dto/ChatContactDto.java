package com.SistemaConciliacion.Consiliacion.modules.chat.api.dto;

import java.time.Instant;

/**
 * Usuario habilitado para DM. Siempre aparece en el directorio; orden por última actividad del chat.
 * {@code unreadCount}: mensajes sin leer de ese usuario si existe conversación.
 */
public record ChatContactDto(long id, String username, Long conversationId, Instant lastActivityAt, long unreadCount) {
}
