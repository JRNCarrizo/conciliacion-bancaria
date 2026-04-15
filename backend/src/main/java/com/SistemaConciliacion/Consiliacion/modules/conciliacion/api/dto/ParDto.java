package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * @param pairKind EXACT · |banco−empresa| dentro de la tolerancia guardada en sesión (o 0,02 si aún no hubo
 *             conciliación); AMOUNT_GAP · brecha por encima de ese umbral; OPPOSITE_SIGN · signos opuestos.
 */
public record ParDto(long pairId, String matchSource, long bankTxId, long companyTxId, BigDecimal bankAmount,
		BigDecimal companyAmount, LocalDate bankDate, LocalDate companyDate, String pairKind,
		long pairAttachmentCount) {
}
