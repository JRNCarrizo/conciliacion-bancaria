package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.math.BigDecimal;
import java.time.LocalDate;

/** Fila parseada de un Excel antes de persistir (banco o empresa). */
public record ImportRowSnapshot(
		LocalDate txDate,
		BigDecimal amount,
		BigDecimal accountingAmount,
		String reference,
		String description,
		String contentFingerprint,
		String correctionKey) {

	public static ImportRowSnapshot bank(LocalDate txDate, BigDecimal amount, String reference, String description) {
		return new ImportRowSnapshot(txDate, amount, null, reference, description,
				TransactionFingerprint.forBank(txDate, amount, reference, description),
				TransactionFingerprint.correctionKey(txDate, reference, description));
	}

	public static ImportRowSnapshot company(LocalDate txDate, BigDecimal amount, BigDecimal accountingAmount,
			String reference, String description) {
		return new ImportRowSnapshot(txDate, amount, accountingAmount, reference, description,
				TransactionFingerprint.forCompany(txDate, amount, accountingAmount, reference, description),
				TransactionFingerprint.correctionKey(txDate, reference, description));
	}
}
