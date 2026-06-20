package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

public record ReimportPreviewDto(
		String side,
		int unchangedCount,
		int addedCount,
		int updatedCount,
		int removedCount,
		int pairsToUnlinkCount) {
}
