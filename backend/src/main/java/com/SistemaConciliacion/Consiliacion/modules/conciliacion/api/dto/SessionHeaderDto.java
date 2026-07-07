package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

public record SessionHeaderDto(long id, Instant createdAt, String displayName, String sourceBankFileName,
		String sourceCompanyFileName, String status, BigDecimal openingBankBalance, BigDecimal closingBankBalance,
		BigDecimal openingCompanyBalance, BigDecimal closingCompanyBalance,
		@JsonInclude(JsonInclude.Include.ALWAYS) BigDecimal amountTolerance,
		@JsonInclude(JsonInclude.Include.ALWAYS) Integer dateToleranceDays,
		List<ImportFileSummaryDto> bankFileSummaries, List<ImportFileSummaryDto> companyFileSummaries) {
}
