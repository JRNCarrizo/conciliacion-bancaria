package com.SistemaConciliacion.Consiliacion.modules.chat.api.dto;

import java.time.Instant;

public record ChatMessageDto(long id, long conversationId, long senderId, String senderUsername, String body,
		Instant createdAt, boolean readByPeer) {
}
