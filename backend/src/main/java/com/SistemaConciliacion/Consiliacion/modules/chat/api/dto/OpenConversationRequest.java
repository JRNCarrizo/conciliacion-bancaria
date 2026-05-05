package com.SistemaConciliacion.Consiliacion.modules.chat.api.dto;

import jakarta.validation.constraints.NotNull;

public record OpenConversationRequest(@NotNull Long peerUserId) {
}
