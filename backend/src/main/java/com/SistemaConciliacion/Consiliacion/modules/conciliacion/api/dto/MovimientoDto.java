package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * {@code amount} = importe de conciliación; {@code accountingAmount} solo empresa = haber−debe
 * (contable). En banco {@code accountingAmount} es siempre null.
 */
public record MovimientoDto(long id, LocalDate txDate, BigDecimal amount, String description, String reference,
		String pendingClassification, BigDecimal accountingAmount) {
}
