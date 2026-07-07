package com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;

import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

/**
 * Genera un .xlsx vacío con el mismo esquema que {@link PlataformaWorkbookParser}: título en las
 * primeras filas, encabezados en la fila 3 (índice 2), datos desde la fila 4 (índice 3).
 */
public final class PlataformaImportTemplateBuilder {

	private static final int HEADER_ROW_INDEX = 2;
	/**
	 * Mismos textos que la planilla TES, en dos renglones por celda (\\n). La columna Haber debe seguir
	 * conteniendo "haber" para {@link PlataformaWorkbookParser#assertHeader}.
	 */
	private static final String[] COLUMN_HEADERS = { "Fecha\ncontable", "División", "Tipo", "Número",
			"Fecha\nbanco", "Debe", "Haber", "Saldo", "Número\ncheque", "Observacion", "Tipo de\nSujeto",
			"Código\nSujeto", "Nombre del\nSujeto", "Cuit del\nSujeto" };

	private PlataformaImportTemplateBuilder() {
	}

	public static byte[] buildXlsx() {
		try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
			Sheet sh = wb.createSheet("Hoja1");
			Row title = sh.createRow(0);
			title.createCell(0).setCellValue("TES9040-Rut. cons. Resumen bancario");
			sh.createRow(1);
			CellStyle headerWrap = wb.createCellStyle();
			headerWrap.setWrapText(true);
			Row header = sh.createRow(HEADER_ROW_INDEX);
			header.setHeightInPoints(38f);
			for (int c = 0; c < COLUMN_HEADERS.length; c++) {
				var cell = header.createCell(c);
				cell.setCellValue(COLUMN_HEADERS[c]);
				cell.setCellStyle(headerWrap);
			}
			for (int c = 0; c < COLUMN_HEADERS.length; c++) {
				sh.setColumnWidth(c, 13 * 256);
			}
			wb.write(bos);
			return bos.toByteArray();
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}
}
