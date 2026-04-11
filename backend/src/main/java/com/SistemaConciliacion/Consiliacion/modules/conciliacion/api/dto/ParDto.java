package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ParDto(long pairId, String matchSource, long bankTxId, long companyTxId, BigDecimal bankAmount,
		BigDecimal companyAmount, LocalDate bankDate, LocalDate companyDate) {
}
