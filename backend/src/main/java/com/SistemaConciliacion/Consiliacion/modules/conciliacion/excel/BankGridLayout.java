package com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel;

/**
 * Posiciones 0-based de columnas y filas en la hoja del extracto bancario (formato actual por defecto).
 */
public record BankGridLayout(
		int sheetIndex,
		int headerRowIndex,
		int firstDataRowIndex,
		int colDate,
		int colReference,
		int colDescription,
		int colAmount,
		boolean skipHeaderValidation) {

	public static BankGridLayout standard() {
		return new BankGridLayout(0, 7, 8, 0, 3, 5, 6, false);
	}

	public void validate() {
		if (sheetIndex < 0) {
			throw new IllegalArgumentException("bank.sheetIndex debe ser ≥ 0.");
		}
		if (headerRowIndex < 0 || firstDataRowIndex < 0) {
			throw new IllegalArgumentException("bank: filas de encabezado o datos inválidas.");
		}
		if (firstDataRowIndex <= headerRowIndex) {
			throw new IllegalArgumentException("bank: la primera fila de datos debe ser posterior al encabezado.");
		}
		if (colDate < 0 || colReference < 0 || colDescription < 0 || colAmount < 0) {
			throw new IllegalArgumentException("bank: índices de columna deben ser ≥ 0.");
		}
	}
}
