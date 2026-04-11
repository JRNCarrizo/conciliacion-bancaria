package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.math.BigDecimal;
import java.time.Instant;

public record SessionHeaderDto(long id, Instant createdAt, String sourceBankFileName, String sourceCompanyFileName,
		String status, BigDecimal openingBankBalance, BigDecimal closingBankBalance,
		BigDecimal openingCompanyBalance, BigDecimal closingCompanyBalance) {
}
