package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.time.Instant;

public record SessionCheckpointDto(long id, long sessionId, Instant createdAt, String createdByUsername,
		String note, String sessionStatusAtSave, long matchedPairs, long unmatchedBankCount,
		long unmatchedCompanyCount, String reconciliationStatus, ConciliacionStatsDto stats) {
}
