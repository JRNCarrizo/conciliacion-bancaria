package com.SistemaConciliacion.Consiliacion.modules.conciliacion.pdf;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ConciliacionStatsDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.MovimientoDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ParDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionDetailDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionHeaderDto;

/**
 * Informe PDF alineado al export Excel: resumen ejecutivo, conciliados, pendientes banco y empresa.
 */
public final class ConciliacionPdfReportWriter {

	private static final DateTimeFormatter FECHA = DateTimeFormatter.ofPattern("dd/MM/yyyy");
	private static final DateTimeFormatter GENERADO = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

	private final PDType1Font fontBody;
	private final PDType1Font fontBold;

	private ConciliacionPdfReportWriter() throws IOException {
		this.fontBody = new PDType1Font(FontName.HELVETICA);
		this.fontBold = new PDType1Font(FontName.HELVETICA_BOLD);
	}

	public static byte[] build(SessionDetailDto d) throws IOException {
		ConciliacionPdfReportWriter w = new ConciliacionPdfReportWriter();
		try (PDDocument doc = new PDDocument(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
			var ctx = new PageCtx(doc, w.fontBody, w.fontBold);
			ctx.writeCoverAndResumen(d);
			ctx.writeConciliados(d);
			ctx.writePendientesBanco(d.unmatchedBankTransactions());
			ctx.writePendientesEmpresa(d.unmatchedCompanyTransactions());
			doc.save(bos);
			return bos.toByteArray();
		}
	}

	private static final class PageCtx {
		private static final float MARGIN = 44f;
		private static final float LEAD_TITLE = 22f;
		private static final float LEAD_SECTION = 16f;
		private static final float LEAD_BODY = 13f;
		private static final float LEAD_TABLE = 11f;

		private final PDDocument doc;
		private final PDType1Font font;
		private final PDType1Font bold;
		private PDPage page;
		private PDPageContentStream cs;
		private float pageW;
		private float pageH;
		private float y;

		PageCtx(PDDocument doc, PDType1Font font, PDType1Font bold) {
			this.doc = doc;
			this.font = font;
			this.bold = bold;
		}

		void writeCoverAndResumen(SessionDetailDto d) throws IOException {
			newPortraitPage();
			SessionHeaderDto h = d.session();
			ConciliacionStatsDto s = d.stats();
			drawCenterTitle("Informe de conciliación bancaria");
			y -= 8;
			drawCenterSubtitle("Sesión " + h.id() + " | Generado " + java.time.LocalDateTime.now().format(GENERADO));
			y -= LEAD_SECTION;

			drawSection("Resumen ejecutivo");
			kv("Creada", String.valueOf(h.createdAt()));
			kv("Estado de la sesión", sessionStatusEs(h.status()));
			kv("Archivo banco", nullToDash(h.sourceBankFileName()));
			kv("Archivo empresa", nullToDash(h.sourceCompanyFileName()));
			y -= 6;
			kv("Saldo inicial banco (declarado)", h.openingBankBalance());
			kv("Saldo final banco (declarado)", h.closingBankBalance());
			kv("Saldo inicial empresa (declarado)", h.openingCompanyBalance());
			kv("Saldo final empresa (declarado)", h.closingCompanyBalance());
			y -= 6;
			kv("Suma importes extracto (banco, control)", s.sumBank());
			kv("Suma plataforma - conciliación (debe-haber)", s.sumCompany());
			kv("Suma plataforma - neto contable (haber-debe)", s.sumCompanyAccounting());
			kv("Diferencia total (banco - empresa conciliación)", s.differenceTotal());
			kv("Delta pares (suma banco en pares - suma empresa en pares)", s.reconciledPairDelta());
			kv("Efecto neto pendientes (suma pend. banco - suma pend. empresa)", s.pendingNetDifference());
			kv("Descomposición OK (algebra)", s.differenceDecompositionOk());
			kv("Estado del reporte", s.reconciliationStatus());
			kv("Detalle estado", s.reconciliationStatusDetail());
			kv("Saldo ajustado (final extracto + suma pend. emp. - suma pend. banco)", s.adjustedBalanceFromBank());
			kv("Diferencia (ajustado extracto - saldo final empresa)", s.adjustedVsCompanyClosing());
			kv("Auditoria: cierre extracto y libro conforme", s.auditCierreCuadrado());
			y -= 6;
			kv("Pares: idénticos / brecha / signo opuesto",
					s.pairsExactAmountCount() + " / " + s.pairsWithAmountGapCount() + " / "
							+ s.pairsOppositeSignCount());
			kv("Pares conciliados (cantidad)", s.matchedPairs());
			kv("Suma importes conciliados (lado banco)", s.sumReconciledBank());
			kv("Suma importes conciliados (lado empresa)", s.sumReconciledCompany());
			y -= 6;
			kv("Suma pendientes banco", s.sumPendingBank());
			kv("Suma pendientes empresa", s.sumPendingCompany());
			y -= 6;
			kv("Movimientos banco / empresa (filas)", s.bankRowCount() + " / " + s.companyRowCount());
			kv("Pendientes banco / empresa (filas)", s.unmatchedBankCount() + " / " + s.unmatchedCompanyCount());
			kv("% mov. conciliados (banco)", s.pctRowsReconciledBank());
			kv("% mov. conciliados (empresa)", s.pctRowsReconciledCompany());
			y -= 8;
			drawSection("Explicación de la diferencia");
			for (String line : s.differenceExplanation()) {
				paragraph(line, 10f);
			}
			closeCs();
		}

		void writeConciliados(SessionDetailDto d) throws IOException {
			Map<Long, MovimientoDto> bankMap = indexById(d.bankTransactions());
			Map<Long, MovimientoDto> compMap = indexById(d.companyTransactions());
			List<ParDto> pairs = new ArrayList<>(d.pairs());
			pairs.sort(Comparator.comparing(ParDto::bankDate).thenComparing(ParDto::pairId));

			newLandscapePage();
			drawSectionLandscape("Conciliados (" + pairs.size() + " pares)");
			y -= 4;

			String[] headers = { "F.banco", "F.emp.", "Par", "ID B", "ID E", "Ref.banco", "Desc.banco", "Ref.emp.",
					"Desc.emp.", "Imp.banco", "Imp.emp.", "Neto cont.", "Clas.", "Estado", "Match" };
			float[] cols = { 48, 48, 32, 28, 28, 54, 58, 54, 58, 46, 46, 46, 44, 46, 38 };
			drawTableHeaderLandscape(headers, cols);

			for (ParDto p : pairs) {
				MovimientoDto b = bankMap.get(p.bankTxId());
				MovimientoDto c = compMap.get(p.companyTxId());
				if (b == null || c == null) {
					continue;
				}
				BigDecimal acc = c.accountingAmount();
				BigDecimal neto = acc != null ? acc : c.amount().negate();
				String[] cells = { fmtFecha(b.txDate()), fmtFecha(c.txDate()), String.valueOf(p.pairId()),
						String.valueOf(b.id()), String.valueOf(c.id()), clip(b.reference(), 18), clip(b.description(), 22),
						clip(c.reference(), 18), clip(c.description(), 22), fmtMoney(b.amount()),
						fmtMoney(c.amount()), fmtMoney(neto), clip(p.classification(), 12),
						pairKindLabelEs(p.pairKind()), matchSourceLabel(p.matchSource()) };
				if (y < MARGIN + 100f) {
					closeCs();
					newLandscapePage();
					drawSectionLandscape("Conciliados (continuación)");
					y -= 4;
					drawTableHeaderLandscape(headers, cols);
				}
				drawTableRowLandscape(cols, cells, 7f);
			}
			closeCs();
		}

		void writePendientesBanco(List<MovimientoDto> bank) throws IOException {
			List<MovimientoDto> rows = new ArrayList<>(bank);
			rows.sort(Comparator.comparing(MovimientoDto::txDate).thenComparing(MovimientoDto::id));
			newLandscapePage();
			drawSectionLandscape("Pendientes extracto - banco (" + rows.size() + " movimientos)");
			y -= 4;
			String[] headers = { "ID", "Fecha", "Importe", "Referencia", "Descripción", "Clasif.", "Dup.", "Sug.ID",
					"Sugerencia", "Com." };
			float[] cols = { 36, 54, 58, 72, 92, 52, 28, 36, 92, 28 };
			drawTableHeaderLandscape(headers, cols);
			for (MovimientoDto m : rows) {
				String[] cells = { String.valueOf(m.id()), fmtFecha(m.txDate()), fmtMoney(m.amount()),
						clip(m.reference(), 20), clip(m.description(), 28), clip(m.pendingClassification(), 14),
						m.duplicateInFile() ? "Sí" : "No",
						m.fuzzyCounterpartId() == null ? "" : String.valueOf(m.fuzzyCounterpartId()),
						clip(m.fuzzyHint(), 28), String.valueOf(m.commentCount()) };
				if (y < MARGIN + 100f) {
					closeCs();
					newLandscapePage();
					drawSectionLandscape("Pendientes banco (continuación)");
					y -= 4;
					drawTableHeaderLandscape(headers, cols);
				}
				drawTableRowLandscape(cols, cells, 7f);
			}
			closeCs();
		}

		void writePendientesEmpresa(List<MovimientoDto> comp) throws IOException {
			List<MovimientoDto> rows = new ArrayList<>(comp);
			rows.sort(Comparator.comparing(MovimientoDto::txDate).thenComparing(MovimientoDto::id));
			newLandscapePage();
			drawSectionLandscape("Pendientes libro / plataforma - empresa (" + rows.size() + " movimientos)");
			y -= 4;
			String[] headers = { "ID", "Fecha", "Imp.conc.", "Neto cont.", "Referencia", "Descripción", "Clasif.",
					"Dup.", "Sug.ID", "Sugerencia", "Com." };
			float[] cols = { 34, 52, 54, 54, 68, 88, 48, 28, 34, 84, 26 };
			drawTableHeaderLandscape(headers, cols);
			for (MovimientoDto m : rows) {
				BigDecimal acc = m.accountingAmount();
				BigDecimal neto = acc != null ? acc : m.amount().negate();
				String[] cells = { String.valueOf(m.id()), fmtFecha(m.txDate()), fmtMoney(m.amount()),
						fmtMoney(neto), clip(m.reference(), 18), clip(m.description(), 26),
						clip(m.pendingClassification(), 12), m.duplicateInFile() ? "Sí" : "No",
						m.fuzzyCounterpartId() == null ? "" : String.valueOf(m.fuzzyCounterpartId()),
						clip(m.fuzzyHint(), 26), String.valueOf(m.commentCount()) };
				if (y < MARGIN + 100f) {
					closeCs();
					newLandscapePage();
					drawSectionLandscape("Pendientes empresa (continuación)");
					y -= 4;
					drawTableHeaderLandscape(headers, cols);
				}
				drawTableRowLandscape(cols, cells, 7f);
			}
			closeCs();
		}

		private void newPortraitPage() throws IOException {
			closeCs();
			page = new PDPage(PDRectangle.A4);
			doc.addPage(page);
			pageW = page.getMediaBox().getWidth();
			pageH = page.getMediaBox().getHeight();
			cs = new PDPageContentStream(doc, page);
			y = pageH - MARGIN;
		}

		private void newLandscapePage() throws IOException {
			closeCs();
			PDRectangle land = new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth());
			page = new PDPage(land);
			doc.addPage(page);
			pageW = page.getMediaBox().getWidth();
			pageH = page.getMediaBox().getHeight();
			cs = new PDPageContentStream(doc, page);
			y = pageH - MARGIN;
		}

		private void closeCs() throws IOException {
			if (cs != null) {
				cs.close();
				cs = null;
			}
		}

		private void drawCenterTitle(String text) throws IOException {
			String t = sanitize(text);
			float fs = 16f;
			cs.setFont(bold, fs);
			float w = bold.getStringWidth(t) / 1000f * fs;
			float x = (pageW - w) / 2f;
			cs.beginText();
			cs.newLineAtOffset(x, y);
			cs.showText(t);
			cs.endText();
			y -= LEAD_TITLE;
		}

		private void drawCenterSubtitle(String text) throws IOException {
			String t = sanitize(text);
			float fs = 10f;
			cs.setFont(font, fs);
			float w = font.getStringWidth(t) / 1000f * fs;
			float x = (pageW - w) / 2f;
			cs.beginText();
			cs.newLineAtOffset(x, y);
			cs.showText(t);
			cs.endText();
			y -= LEAD_BODY;
		}

		private void drawSection(String title) throws IOException {
			String t = sanitize(title);
			ensurePortraitSpace(LEAD_SECTION + 6);
			cs.setFont(bold, 12f);
			cs.beginText();
			cs.newLineAtOffset(MARGIN, y);
			cs.showText(t);
			cs.endText();
			y -= LEAD_SECTION;
			cs.setStrokingColor(0.2f, 0.45f, 0.65f);
			cs.setLineWidth(1f);
			cs.moveTo(MARGIN, y + 4f);
			cs.lineTo(pageW - MARGIN, y + 4f);
			cs.stroke();
			cs.setStrokingColor(0f, 0f, 0f);
			y -= 8f;
		}

		private void drawSectionLandscape(String title) throws IOException {
			String t = sanitize(title);
			cs.setFont(bold, 11f);
			cs.beginText();
			cs.newLineAtOffset(MARGIN, y);
			cs.showText(t);
			cs.endText();
			y -= LEAD_SECTION;
			cs.setStrokingColor(0.2f, 0.45f, 0.65f);
			cs.setLineWidth(1f);
			cs.moveTo(MARGIN, y + 4f);
			cs.lineTo(pageW - MARGIN, y + 4f);
			cs.stroke();
			cs.setStrokingColor(0f, 0f, 0f);
			y -= 10f;
		}

		private void ensurePortraitSpace(float needed) throws IOException {
			if (y < MARGIN + needed) {
				closeCs();
				newPortraitPage();
			}
		}

		private void kv(String key, Object value) throws IOException {
			String v = sanitize(formatValue(value));
			float fs = 9f;
			String keyPart = sanitize(key) + ":";
			cs.setFont(bold, fs);
			float keyW = bold.getStringWidth(keyPart) / 1000f * fs;
			cs.setFont(font, fs);
			float maxV = pageW - MARGIN * 2 - keyW - 10f;
			List<String> wrapped = wrapText(v, maxV, fs);
			float blockH = (LEAD_BODY - 2f) * wrapped.size() + 6f;
			ensurePortraitSpace(blockH);
			cs.setFont(bold, fs);
			cs.beginText();
			cs.newLineAtOffset(MARGIN, y);
			cs.showText(keyPart);
			cs.endText();
			for (int i = 0; i < wrapped.size(); i++) {
				cs.setFont(font, fs);
				cs.beginText();
				cs.newLineAtOffset(MARGIN + keyW + 8f, y - i * (LEAD_BODY - 2f));
				cs.showText(wrapped.get(i));
				cs.endText();
			}
			y -= blockH;
		}

		private void paragraph(String text, float fs) throws IOException {
			if (text == null || text.isBlank()) {
				return;
			}
			List<String> lines = wrapText(sanitize(text.trim()), pageW - MARGIN * 2, fs);
			for (String ln : lines) {
				ensurePortraitSpace(LEAD_BODY);
				cs.setFont(font, fs);
				cs.beginText();
				cs.newLineAtOffset(MARGIN, y);
				cs.showText(ln);
				cs.endText();
				y -= LEAD_BODY - 1;
			}
			y -= 4;
		}

		private List<String> wrapText(String text, float maxWidthPt, float fs) throws IOException {
			String cleaned = sanitize(text == null ? "" : text);
			if (cleaned.isBlank()) {
				return List.of("");
			}
			List<String> out = new ArrayList<>();
			String[] words = cleaned.split("\\s+");
			StringBuilder line = new StringBuilder();
			for (String w : words) {
				if (w.isEmpty()) {
					continue;
				}
				String trial = line.isEmpty() ? w : line + " " + w;
				float tw = font.getStringWidth(trial) / 1000f * fs;
				if (tw > maxWidthPt && !line.isEmpty()) {
					out.add(line.toString());
					line = new StringBuilder(w);
				} else {
					line = new StringBuilder(trial);
				}
			}
			if (!line.isEmpty()) {
				out.add(line.toString());
			}
			List<String> finalLines = new ArrayList<>();
			for (String ln : out) {
				finalLines.addAll(hardWrapLine(ln, maxWidthPt, fs));
			}
			return finalLines.isEmpty() ? List.of("") : finalLines;
		}

		/** Parte líneas que sigan excediendo el ancho (palabras largas o números sin espacios). */
		private List<String> hardWrapLine(String line, float maxW, float fs) throws IOException {
			if (line.isEmpty()) {
				return List.of("");
			}
			float w = font.getStringWidth(line) / 1000f * fs;
			if (w <= maxW || maxW < 8f) {
				return List.of(line);
			}
			List<String> parts = new ArrayList<>();
			int start = 0;
			while (start < line.length()) {
				int lo = start + 1;
				int hi = line.length();
				int best = start;
				while (lo <= hi) {
					int mid = (lo + hi) >>> 1;
					String sub = line.substring(start, mid);
					float tw = font.getStringWidth(sub) / 1000f * fs;
					if (tw <= maxW) {
						best = mid;
						lo = mid + 1;
					} else {
						hi = mid - 1;
					}
				}
				if (best <= start) {
					best = start + 1;
				}
				parts.add(line.substring(start, best));
				start = best;
			}
			return parts;
		}

		private void drawTableHeaderLandscape(String[] headers, float[] cols) throws IOException {
			float rowH = LEAD_TABLE + 6;
			float x = MARGIN;
			float sum = 0f;
			for (float c : cols) {
				sum += c;
			}
			cs.setNonStrokingColor(0.90f, 0.92f, 0.96f);
			cs.addRect(MARGIN, y - rowH + 3f, sum, rowH);
			cs.fill();
			cs.setNonStrokingColor(0f, 0f, 0f);
			cs.setFont(bold, 7f);
			for (int i = 0; i < headers.length; i++) {
				cs.beginText();
				cs.newLineAtOffset(x + 2f, y - rowH + 9f);
				cs.showText(sanitize(headers[i]));
				cs.endText();
				x += cols[i];
			}
			y -= rowH + 2f;
		}

		private void drawTableRowLandscape(float[] cols, String[] cells, float fs) throws IOException {
			float padTop = 5f;
			float padBottom = 5f;
			float lineHeight = fs + 5f;

			List<List<String>> wrappedCells = new ArrayList<>();
			int maxLines = 1;
			for (int i = 0; i < cells.length; i++) {
				float innerW = Math.max(10f, cols[i] - 4f);
				List<String> w = wrapText(cells[i] == null ? "" : cells[i], innerW, fs);
				wrappedCells.add(w);
				maxLines = Math.max(maxLines, w.size());
			}
			float blockH = padTop + maxLines * lineHeight + padBottom;
			float rowTop = y;
			float rowBottom = rowTop - blockH;

			for (int col = 0; col < cells.length; col++) {
				float cellX = MARGIN;
				for (int k = 0; k < col; k++) {
					cellX += cols[k];
				}
				float cw = cols[col];
				List<String> lines = wrappedCells.get(col);

				cs.saveGraphicsState();
				cs.addRect(cellX + 0.5f, rowBottom, cw - 1f, blockH);
				cs.clip();
				cs.setFont(font, fs);
				for (int li = 0; li < lines.size(); li++) {
					float baseline = rowTop - padTop - (li + 1) * lineHeight + fs * 0.22f;
					cs.beginText();
					cs.newLineAtOffset(cellX + 2f, baseline);
					cs.showText(lines.get(li));
					cs.endText();
				}
				cs.restoreGraphicsState();
			}
			y = rowBottom - 6f;
		}

		/**
		 * Helvetica estándar solo admite WinAnsi; el texto del dominio trae Σ, −, ·, →, etc.
		 * Normalizamos a ASCII / latin1 seguro antes del filtro.
		 */
		private static String normalizeUnicodeForPdf(String s) {
			if (s == null || s.isEmpty()) {
				return "";
			}
			StringBuilder t = new StringBuilder(s.length() + 8);
			for (int i = 0; i < s.length(); i++) {
				char c = s.charAt(i);
				switch (c) {
					case '\u00B7' -> t.append(' '); // punto medio ·
					case '\u2013', '\u2014', '\u2015', '\u2212', '\uFE58', '\uFE63', '\uFF0D' -> t.append('-'); // guiones / menos
					case '\u00A0', '\u202F', '\u2007' -> t.append(' '); // espacios raros
					case '\u2026' -> t.append("..."); // …
					case '\u03A3' -> t.append("Sum"); // Σ
					case '\u03C3' -> t.append("sum"); // σ
					case '\u0394' -> t.append("Delta"); // Δ
					case '\u03B4' -> t.append("delta"); // δ
					case '\u00B1' -> t.append("+/-"); // ±
					case '\u2192' -> t.append("->"); // →
					case '\u2264' -> t.append("<=");
					case '\u2265' -> t.append(">=");
					case '\u20AC' -> t.append("EUR");
					default -> t.append(c);
				}
			}
			return t.toString();
		}

		private static String sanitize(String s) {
			if (s == null) {
				return "";
			}
			String n = normalizeUnicodeForPdf(s);
			StringBuilder b = new StringBuilder(n.length());
			for (int i = 0; i < n.length(); i++) {
				char c = n.charAt(i);
				if (c >= 32 && c <= 126 || c == 'ñ' || c == 'Ñ' || c == 'á' || c == 'é' || c == 'í' || c == 'ó'
						|| c == 'ú' || c == 'Á' || c == 'É' || c == 'Í' || c == 'Ó' || c == 'Ú' || c == 'ü' || c == 'Ü'
						|| c == '¿' || c == '¡' || c == 'ç' || c == 'Ç') {
					b.append(c);
				} else if (c == '\n' || c == '\r') {
					b.append(' ');
				} else {
					b.append('?');
				}
			}
			return b.toString();
		}

		private static String clip(String s, int maxChars) {
			if (s == null || s.isBlank()) {
				return "";
			}
			String t = s.trim();
			return t.length() <= maxChars ? t : t.substring(0, maxChars - 1) + "...";
		}

		private static String fmtFecha(LocalDate d) {
			return d == null ? "" : d.format(FECHA);
		}

		private static String fmtMoney(BigDecimal bd) {
			if (bd == null) {
				return "";
			}
			return bd.setScale(2, RoundingMode.HALF_UP).toPlainString();
		}

		private static String formatValue(Object value) {
			if (value == null) {
				return "-";
			}
			if (value instanceof BigDecimal bd) {
				return bd.stripTrailingZeros().toPlainString();
			}
			if (value instanceof Boolean b) {
				return b ? "Sí" : "No";
			}
			return value.toString();
		}

		private static String nullToDash(String s) {
			return s == null || s.isBlank() ? "-" : s;
		}

		private static String sessionStatusEs(String status) {
			if (status == null || status.isBlank()) {
				return "-";
			}
			return switch (status) {
				case "IMPORTED" -> "Importada";
				case "RECONCILED" -> "Conciliada";
				case "CLOSED" -> "Cerrada";
				default -> status;
			};
		}

		private static Map<Long, MovimientoDto> indexById(List<MovimientoDto> list) {
			return list.stream().collect(Collectors.toMap(MovimientoDto::id, m -> m, (a, b) -> a));
		}

		private static String pairKindLabelEs(String pairKind) {
			if (pairKind == null || pairKind.isBlank()) {
				return "";
			}
			return switch (pairKind) {
				case "EXACT" -> "Coincidente";
				case "AMOUNT_GAP" -> "Brecha importe";
				case "OPPOSITE_SIGN" -> "Signo opuesto";
				default -> pairKind;
			};
		}

		private static String matchSourceLabel(String matchSource) {
			if (matchSource == null) {
				return "";
			}
			return switch (matchSource) {
				case "MANUAL" -> "Manual";
				case "AUTO" -> "Automático";
				default -> matchSource;
			};
		}
	}
}
