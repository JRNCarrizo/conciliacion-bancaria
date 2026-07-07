package com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel;

/**
 * Posiciones 0-based para libro TES / resumen bancario (debe−haber), formato actual por defecto.
 */
public record CompanyGridLayout(
		int sheetIndex,
		int headerRowIndex,
		int firstDataRowIndex,
		int colFechaContable,
		int colTipo,
		int colNumero,
		int colFechaBanco,
		int colDebe,
		int colHaber,
		int colObservacion,
		boolean skipHeaderValidation) {

	public static CompanyGridLayout standard() {
		return new CompanyGridLayout(0, 2, 3, 0, 2, 3, 4, 5, 6, 9, false);
	}

	public void validate() {
		if (sheetIndex < 0) {
			throw new IllegalArgumentException("company.sheetIndex debe ser ≥ 0.");
		}
		if (headerRowIndex < 0 || firstDataRowIndex < 0) {
			throw new IllegalArgumentException("company: filas de encabezado o datos inválidas.");
		}
		if (firstDataRowIndex <= headerRowIndex) {
			throw new IllegalArgumentException("company: la primera fila de datos debe ser posterior al encabezado.");
		}
		int[] cols = { colFechaContable, colTipo, colNumero, colFechaBanco, colDebe, colHaber, colObservacion };
		for (int c : cols) {
			if (c < 0) {
				throw new IllegalArgumentException("company: índices de columna deben ser ≥ 0.");
			}
		}
	}
}
