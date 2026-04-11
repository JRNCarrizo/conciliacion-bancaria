package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.math.BigDecimal;

public record ConciliacionRunResultDto(long sessionId, int pairsCreated, long unmatchedBank, long unmatchedCompany,
		int dateToleranceDays, BigDecimal amountTolerance) {
}
