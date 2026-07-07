package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.time.Instant;

public record SessionAuditEntryDto(long id, String eventType, String eventLabel, String username,
		Instant createdAt, String detail) {
}
