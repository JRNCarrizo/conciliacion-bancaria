package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.time.Instant;

public record SessionSummaryDto(long id, Instant createdAt, String sourceBankFileName, String sourceCompanyFileName,
		String status, long bankRowCount, long companyRowCount, long matchedPairs) {
}
