package com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.springframework.stereotype.Component;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;

@Component
public class BancoWorkbookParser {

	public void assertHeader(Sheet sheet, BankGridLayout layout) {
		Row header = sheet.getRow(layout.headerRowIndex());
		if (header == null) {
			throw new IllegalArgumentException("Archivo de banco: no se encontró la fila de encabezados (fila "
					+ (layout.headerRowIndex() + 1) + ").");
		}
		if (layout.skipHeaderValidation()) {
			return;
		}
		String importe = ExcelCells.asString(header.getCell(layout.colAmount()));
		if (importe == null || !importe.toLowerCase(Locale.ROOT).contains("importe")) {
			throw new IllegalArgumentException(
					"Archivo de banco: la columna Importe no coincide con el mapeo (o activá omitir validación de encabezado).");
		}
	}

	public List<BankTransaction> parse(Sheet sheet, ReconciliationSession session, BankGridLayout layout) {
		assertHeader(sheet, layout);
		List<BankTransaction> out = new ArrayList<>();
		for (int r = layout.firstDataRowIndex(); r <= sheet.getLastRowNum(); r++) {
			Row row = sheet.getRow(r);
			if (row == null || isEmptyDataRow(row, layout)) {
				continue;
			}
			LocalDate d = ExcelCells.asLocalDate(row.getCell(layout.colDate()));
			BigDecimal amt = ExcelCells.asBigDecimal(row.getCell(layout.colAmount()));
			if (d == null && amt == null) {
				continue;
			}
			if (d == null || amt == null) {
				continue;
			}
			if (amt.compareTo(BigDecimal.ZERO) == 0) {
				continue;
			}
			BankTransaction bt = new BankTransaction();
			bt.setSession(session);
			bt.setTxDate(d);
			bt.setAmount(amt);
			bt.setReference(ExcelCells.asString(row.getCell(layout.colReference())));
			bt.setDescription(ExcelCells.asString(row.getCell(layout.colDescription())));
			out.add(bt);
		}
		if (out.isEmpty()) {
			throw new IllegalArgumentException("Archivo de banco: no se importó ningún movimiento (revisá filas y columnas).");
		}
		return out;
	}

	private boolean isEmptyDataRow(Row row, BankGridLayout layout) {
		return ExcelCells.isBlank(row.getCell(layout.colDate()))
				&& ExcelCells.isBlank(row.getCell(layout.colAmount()));
	}
}
