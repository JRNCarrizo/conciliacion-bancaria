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

	private static final int HEADER_ROW_INDEX = 7;
	private static final int FIRST_DATA_ROW_INDEX = 8;
	private static final int COL_FECHA = 0;
	private static final int COL_REF = 3;
	private static final int COL_CONCEPTO = 5;
	private static final int COL_IMPORTE = 6;

	public void assertHeader(Sheet sheet) {
		Row header = sheet.getRow(HEADER_ROW_INDEX);
		if (header == null) {
			throw new IllegalArgumentException("Archivo de banco: no se encontró la fila de encabezados (fila 8).");
		}
		String importe = ExcelCells.asString(header.getCell(COL_IMPORTE));
		if (importe == null || !importe.toLowerCase(Locale.ROOT).contains("importe")) {
			throw new IllegalArgumentException(
					"Archivo de banco: la columna Importe no está donde se espera (formato extracto estándar).");
		}
	}

	public List<BankTransaction> parse(Sheet sheet, ReconciliationSession session) {
		assertHeader(sheet);
		List<BankTransaction> out = new ArrayList<>();
		for (int r = FIRST_DATA_ROW_INDEX; r <= sheet.getLastRowNum(); r++) {
			Row row = sheet.getRow(r);
			if (row == null || isEmptyDataRow(row)) {
				continue;
			}
			LocalDate d = ExcelCells.asLocalDate(row.getCell(COL_FECHA));
			BigDecimal amt = ExcelCells.asBigDecimal(row.getCell(COL_IMPORTE));
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
			bt.setReference(ExcelCells.asString(row.getCell(COL_REF)));
			bt.setDescription(ExcelCells.asString(row.getCell(COL_CONCEPTO)));
			out.add(bt);
		}
		if (out.isEmpty()) {
			throw new IllegalArgumentException("Archivo de banco: no se importó ningún movimiento (revisá filas y columnas).");
		}
		return out;
	}

	private boolean isEmptyDataRow(Row row) {
		return ExcelCells.isBlank(row.getCell(COL_FECHA)) && ExcelCells.isBlank(row.getCell(COL_IMPORTE));
	}
}
