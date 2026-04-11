package com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Date;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;

public final class ExcelCells {

	private static final DataFormatter FORMATTER = new DataFormatter();
	private static final Pattern DD_MM_YYYY = Pattern.compile("(\\d{1,2})/(\\d{1,2})/(\\d{4})");

	private ExcelCells() {
	}

	public static boolean isBlank(Cell cell) {
		return asString(cell) == null;
	}

	public static String asString(Cell cell) {
		if (cell == null) {
			return null;
		}
		String s = FORMATTER.formatCellValue(cell);
		if (s == null) {
			return null;
		}
		s = s.trim();
		return s.isEmpty() ? null : s;
	}

	public static BigDecimal asBigDecimal(Cell cell) {
		if (cell == null) {
			return null;
		}
		CellType t = cell.getCellType();
		if (t == CellType.FORMULA) {
			t = cell.getCachedFormulaResultType();
		}
		if (t == CellType.NUMERIC) {
			return BigDecimal.valueOf(cell.getNumericCellValue());
		}
		if (t == CellType.STRING) {
			String s = cell.getStringCellValue().trim();
			if (s.isEmpty()) {
				return null;
			}
			return new BigDecimal(normalizeNumber(s));
		}
		return null;
	}

	public static BigDecimal asBigDecimalOrZero(Cell cell) {
		BigDecimal v = asBigDecimal(cell);
		return v != null ? v : BigDecimal.ZERO;
	}

	public static LocalDate asLocalDate(Cell cell) {
		if (cell == null) {
			return null;
		}
		CellType t = cell.getCellType();
		if (t == CellType.FORMULA) {
			t = cell.getCachedFormulaResultType();
		}
		if (t == CellType.NUMERIC) {
			double v = cell.getNumericCellValue();
			if (DateUtil.isValidExcelDate(v)) {
				Date d = DateUtil.getJavaDate(v);
				return d.toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
			}
			return null;
		}
		if (t == CellType.STRING) {
			return parseLocalDateFromText(cell.getStringCellValue());
		}
		return null;
	}

	private static LocalDate parseLocalDateFromText(String raw) {
		if (raw == null) {
			return null;
		}
		String s = raw.trim();
		if (s.isEmpty()) {
			return null;
		}
		Matcher m = DD_MM_YYYY.matcher(s);
		if (m.find()) {
			int day = Integer.parseInt(m.group(1));
			int month = Integer.parseInt(m.group(2));
			int year = Integer.parseInt(m.group(3));
			return LocalDate.of(year, month, day);
		}
		return null;
	}

	private static String normalizeNumber(String s) {
		return s.replace(" ", "").replace(".", "").replace(",", ".");
	}
}
