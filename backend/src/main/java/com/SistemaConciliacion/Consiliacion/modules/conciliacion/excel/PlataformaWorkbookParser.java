package com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.springframework.stereotype.Component;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;

/**
 * Importa movimientos TES / resumen bancario. Por fila se guardan dos magnitudes:
 * <ul>
 * <li><strong>Conciliación</strong> ({@code amount}): {@code debe − haber}, mismo criterio que el
 * importe del extracto — matching y Σ de control de conciliación.</li>
 * <li><strong>Contable</strong> ({@code accountingAmount}): {@code haber − debe}, neto de libro para
 * referencia de saldo contable (no interviene en el emparejamiento).</li>
 * </ul>
 */
@Component
public class PlataformaWorkbookParser {

	private static final int HEADER_ROW_INDEX = 2;
	private static final int FIRST_DATA_ROW_INDEX = 3;
	private static final int COL_FECHA_CONTABLE = 0;
	private static final int COL_TIPO = 2;
	private static final int COL_NUMERO = 3;
	private static final int COL_FECHA_BANCO = 4;
	private static final int COL_DEBE = 5;
	private static final int COL_HABER = 6;
	private static final int COL_OBS = 9;

	public void assertHeader(Sheet sheet) {
		Row header = sheet.getRow(HEADER_ROW_INDEX);
		if (header == null) {
			throw new IllegalArgumentException("Archivo de plataforma: no se encontró la fila de encabezados (fila 3).");
		}
		String haber = ExcelCells.asString(header.getCell(COL_HABER));
		if (haber == null || !haber.toLowerCase(Locale.ROOT).contains("haber")) {
			throw new IllegalArgumentException(
					"Archivo de plataforma: la columna Haber no está donde se espera (formato TES / resumen bancario).");
		}
	}

	public List<CompanyTransaction> parse(Sheet sheet, ReconciliationSession session) {
		assertHeader(sheet);
		List<CompanyTransaction> out = new ArrayList<>();
		for (int r = FIRST_DATA_ROW_INDEX; r <= sheet.getLastRowNum(); r++) {
			Row row = sheet.getRow(r);
			if (row == null || isEmptyDataRow(row)) {
				continue;
			}
			LocalDate fechaBanco = ExcelCells.asLocalDate(row.getCell(COL_FECHA_BANCO));
			LocalDate fechaContable = ExcelCells.asLocalDate(row.getCell(COL_FECHA_CONTABLE));
			LocalDate txDate = fechaBanco != null ? fechaBanco : fechaContable;
			if (txDate == null) {
				continue;
			}
			BigDecimal debe = ExcelCells.asBigDecimalOrZero(row.getCell(COL_DEBE));
			BigDecimal haber = ExcelCells.asBigDecimalOrZero(row.getCell(COL_HABER));
			BigDecimal accountingNet = haber.subtract(debe);
			BigDecimal reconciliationAmount = debe.subtract(haber);
			if (reconciliationAmount.compareTo(BigDecimal.ZERO) == 0) {
				continue;
			}

			String tipo = ExcelCells.asString(row.getCell(COL_TIPO));
			String numero = ExcelCells.asString(row.getCell(COL_NUMERO));
			String reference = buildReference(tipo, numero);

			CompanyTransaction ct = new CompanyTransaction();
			ct.setSession(session);
			ct.setTxDate(txDate);
			ct.setAmount(reconciliationAmount);
			ct.setAccountingAmount(accountingNet);
			ct.setReference(reference);
			ct.setDescription(ExcelCells.asString(row.getCell(COL_OBS)));
			out.add(ct);
		}
		if (out.isEmpty()) {
			throw new IllegalArgumentException(
					"Archivo de plataforma: no se importó ningún movimiento (revisá filas y columnas).");
		}
		return out;
	}

	private static String buildReference(String tipo, String numero) {
		if (tipo != null && numero != null) {
			return tipo + " " + numero;
		}
		if (numero != null) {
			return numero;
		}
		return tipo;
	}

	private boolean isEmptyDataRow(Row row) {
		return ExcelCells.isBlank(row.getCell(COL_FECHA_CONTABLE))
				&& ExcelCells.isBlank(row.getCell(COL_FECHA_BANCO))
				&& ExcelCells.isBlank(row.getCell(COL_HABER))
				&& ExcelCells.isBlank(row.getCell(COL_DEBE));
	}
}
