package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ImportLayoutDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.BankGridLayout;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.CompanyGridLayout;

final class ImportLayoutResolver {

	private ImportLayoutResolver() {
	}

	static BankGridLayout resolveBank(ImportLayoutDto layout) {
		BankGridLayout d = BankGridLayout.standard();
		if (layout == null || layout.bank == null) {
			return d;
		}
		var p = layout.bank;
		return new BankGridLayout(
				nz(p.sheetIndex, d.sheetIndex()),
				nz(p.headerRowIndex, d.headerRowIndex()),
				nz(p.firstDataRowIndex, d.firstDataRowIndex()),
				nz(p.colDate, d.colDate()),
				nz(p.colReference, d.colReference()),
				nz(p.colDescription, d.colDescription()),
				nz(p.colAmount, d.colAmount()),
				p.skipHeaderValidation != null ? p.skipHeaderValidation : d.skipHeaderValidation());
	}

	static CompanyGridLayout resolveCompany(ImportLayoutDto layout) {
		CompanyGridLayout d = CompanyGridLayout.standard();
		if (layout == null || layout.company == null) {
			return d;
		}
		var p = layout.company;
		return new CompanyGridLayout(
				nz(p.sheetIndex, d.sheetIndex()),
				nz(p.headerRowIndex, d.headerRowIndex()),
				nz(p.firstDataRowIndex, d.firstDataRowIndex()),
				nz(p.colFechaContable, d.colFechaContable()),
				nz(p.colTipo, d.colTipo()),
				nz(p.colNumero, d.colNumero()),
				nz(p.colFechaBanco, d.colFechaBanco()),
				nz(p.colDebe, d.colDebe()),
				nz(p.colHaber, d.colHaber()),
				nz(p.colObservacion, d.colObservacion()),
				p.skipHeaderValidation != null ? p.skipHeaderValidation : d.skipHeaderValidation());
	}

	private static int nz(Integer v, int fallback) {
		return v != null ? v : fallback;
	}
}
