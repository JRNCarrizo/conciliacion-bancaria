package com.SistemaConciliacion.Consiliacion.modules.chat.ws;

/** Cuerpo JSON enviado a `/app/chat.send`. */
public record ChatSendPayload(Long conversationId, String body) {
}
