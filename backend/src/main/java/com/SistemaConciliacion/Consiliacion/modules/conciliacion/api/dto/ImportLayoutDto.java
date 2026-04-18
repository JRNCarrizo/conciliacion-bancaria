package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Mapeo opcional de filas/columnas al importar. Campos omitidos usan el layout estándar del sistema.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class ImportLayoutDto {

	public BankPart bank;
	public CompanyPart company;

	@JsonIgnoreProperties(ignoreUnknown = true)
	public static class BankPart {
		public Integer sheetIndex;
		public Integer headerRowIndex;
		public Integer firstDataRowIndex;
		public Integer colDate;
		public Integer colReference;
		public Integer colDescription;
		public Integer colAmount;
		public Boolean skipHeaderValidation;
	}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public static class CompanyPart {
		public Integer sheetIndex;
		public Integer headerRowIndex;
		public Integer firstDataRowIndex;
		public Integer colFechaContable;
		public Integer colTipo;
		public Integer colNumero;
		public Integer colFechaBanco;
		public Integer colDebe;
		public Integer colHaber;
		public Integer colObservacion;
		public Boolean skipHeaderValidation;
	}
}
