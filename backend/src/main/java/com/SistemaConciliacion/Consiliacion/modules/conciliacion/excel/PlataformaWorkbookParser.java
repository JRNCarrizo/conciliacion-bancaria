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

	public void assertHeader(Sheet sheet, CompanyGridLayout layout) {
		Row header = sheet.getRow(layout.headerRowIndex());
		if (header == null) {
			throw new IllegalArgumentException("Archivo de plataforma: no se encontró la fila de encabezados (fila "
					+ (layout.headerRowIndex() + 1) + ").");
		}
		if (layout.skipHeaderValidation()) {
			return;
		}
		String haber = ExcelCells.asString(header.getCell(layout.colHaber()));
		if (haber == null || !haber.toLowerCase(Locale.ROOT).contains("haber")) {
			throw new IllegalArgumentException(
					"Archivo de plataforma: la columna Haber no coincide con el mapeo (o activá omitir validación de encabezado).");
		}
	}

	public List<CompanyTransaction> parse(Sheet sheet, ReconciliationSession session, CompanyGridLayout layout) {
		assertHeader(sheet, layout);
		List<CompanyTransaction> out = new ArrayList<>();
		for (int r = layout.firstDataRowIndex(); r <= sheet.getLastRowNum(); r++) {
			Row row = sheet.getRow(r);
			if (row == null || isEmptyDataRow(row, layout)) {
				continue;
			}
			LocalDate fechaBanco = ExcelCells.asLocalDate(row.getCell(layout.colFechaBanco()));
			LocalDate fechaContable = ExcelCells.asLocalDate(row.getCell(layout.colFechaContable()));
			LocalDate txDate = fechaBanco != null ? fechaBanco : fechaContable;
			if (txDate == null) {
				continue;
			}
			BigDecimal debe = ExcelCells.asBigDecimalOrZero(row.getCell(layout.colDebe()));
			BigDecimal haber = ExcelCells.asBigDecimalOrZero(row.getCell(layout.colHaber()));
			BigDecimal accountingNet = haber.subtract(debe);
			BigDecimal reconciliationAmount = debe.subtract(haber);
			if (reconciliationAmount.compareTo(BigDecimal.ZERO) == 0) {
				continue;
			}

			String tipo = ExcelCells.asString(row.getCell(layout.colTipo()));
			String numero = ExcelCells.asString(row.getCell(layout.colNumero()));
			String reference = buildReference(tipo, numero);

			CompanyTransaction ct = new CompanyTransaction();
			ct.setSession(session);
			ct.setTxDate(txDate);
			ct.setAmount(reconciliationAmount);
			ct.setAccountingAmount(accountingNet);
			ct.setReference(reference);
			ct.setDescription(ExcelCells.asString(row.getCell(layout.colObservacion())));
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

	private boolean isEmptyDataRow(Row row, CompanyGridLayout layout) {
		return ExcelCells.isBlank(row.getCell(layout.colFechaContable()))
				&& ExcelCells.isBlank(row.getCell(layout.colFechaBanco()))
				&& ExcelCells.isBlank(row.getCell(layout.colHaber()))
				&& ExcelCells.isBlank(row.getCell(layout.colDebe()));
	}
}
