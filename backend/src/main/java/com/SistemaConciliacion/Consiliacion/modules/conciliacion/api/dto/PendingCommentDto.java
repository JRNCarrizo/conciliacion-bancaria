package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.time.Instant;

public record PendingCommentDto(long id, String body, Instant createdAt, String createdByUsername) {
}
