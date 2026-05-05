package com.SistemaConciliacion.Consiliacion.modules.chat.api.dto;

import java.time.Instant;

public record ChatConversationDto(long id, long peerUserId, String peerUsername, Instant updatedAt,
		long unreadCount) {
}
