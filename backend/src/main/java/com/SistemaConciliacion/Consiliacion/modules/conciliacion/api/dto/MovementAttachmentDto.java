package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.time.Instant;

public record MovementAttachmentDto(long id, String originalFilename, String contentType, long sizeBytes,
		Instant createdAt, String createdByUsername) {
}
