package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Conciliación N:M: varios movimientos de banco y/o empresa vinculados como un grupo.
 *
 * @param pairKind EXACT | AMOUNT_GAP | OPPOSITE_SIGN según Σ banco vs Σ empresa.
 */
public record GroupDto(long groupId, String matchSource, List<Long> bankTxIds, List<Long> companyTxIds,
		BigDecimal bankSum, BigDecimal companySum, LocalDate bankMinDate, LocalDate companyMinDate, String pairKind,
		String classification, long groupCommentCount, long groupAttachmentCount) {
}
