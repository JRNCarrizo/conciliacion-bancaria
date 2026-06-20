package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

public record ReimportResultDto(
		String side,
		int unchangedCount,
		int addedCount,
		int updatedCount,
		int removedCount,
		int pairsUnlinkedCount,
		long bankRowCount,
		long companyRowCount,
		String sourceFileName) {
}
