package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

public record DeferredMovementDto(long id, String side, LocalDate txDate, BigDecimal amount,
		BigDecimal accountingAmount, String reference, String description, String pendingClassification,
		long sourceSessionId, String sourceSessionLabel, Long sourceTransactionId, Instant excludedAt,
		String excludedBy, String note, String status, Long consumedSessionId, Long createdTransactionId,
		String sourceSideFileName, String consumedSessionLabel) {
}
