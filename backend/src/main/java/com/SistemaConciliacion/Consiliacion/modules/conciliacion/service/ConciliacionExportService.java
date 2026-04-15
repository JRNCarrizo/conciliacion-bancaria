package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ConciliacionStatsDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.MovimientoDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ParDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionDetailDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionHeaderDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationPair;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.BankTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.CompanyTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationPairRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;

@Service
public class ConciliacionExportService {

	private final ReconciliationSessionRepository sessionRepository;
	private final BankTransactionRepository bankTransactionRepository;
	private final CompanyTransactionRepository companyTransactionRepository;
	private final ReconciliationPairRepository reconciliationPairRepository;
	private final ConciliacionSessionService conciliacionSessionService;

	public ConciliacionExportService(ReconciliationSessionRepository sessionRepository,
			BankTransactionRepository bankTransactionRepository,
			CompanyTransactionRepository companyTransactionRepository,
			ReconciliationPairRepository reconciliationPairRepository,
			ConciliacionSessionService conciliacionSessionService) {
		this.sessionRepository = sessionRepository;
		this.bankTransactionRepository = bankTransactionRepository;
		this.companyTransactionRepository = companyTransactionRepository;
		this.reconciliationPairRepository = reconciliationPairRepository;
		this.conciliacionSessionService = conciliacionSessionService;
	}

	public enum ExportKind {
		PAIRS,
		PENDING
	}

	@Transactional(readOnly = true)
	public byte[] exportCsv(long sessionId, ExportKind kind) {
		sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));

		String csv = switch (kind) {
			case PAIRS -> buildPairsCsv(sessionId);
			case PENDING -> buildPendingCsv(sessionId);
		};
		byte[] bom = new byte[] { (byte) 0xEF, (byte) 0xBB, (byte) 0xBF };
		byte[] body = csv.getBytes(StandardCharsets.UTF_8);
		byte[] out = new byte[bom.length + body.length];
		System.arraycopy(bom, 0, out, 0, bom.length);
		System.arraycopy(body, 0, out, bom.length, body.length);
		return out;
	}

	/**
	 * Libro Excel multipágina: Resumen (KPIs como en pantalla), Conciliados (pares), Pendientes banco,
	 * Pendientes empresa, Detalle completo (todos los movimientos con estado).
	 */
	@Transactional(readOnly = true)
	public byte[] exportExcel(long sessionId) {
		SessionDetailDto d = conciliacionSessionService.getSessionDetail(sessionId);
		try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
			writeResumenSheet(wb, d);
			writeConciliadosSheet(wb, d);
			writePendientesBancoSheet(wb, d.unmatchedBankTransactions());
			writePendientesEmpresaSheet(wb, d.unmatchedCompanyTransactions());
			writeDetalleCompletoSheet(wb, d);
			wb.write(bos);
			return bos.toByteArray();
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	private static final DateTimeFormatter EXP_FECHA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

	private static String fmtFecha(LocalDate d) {
		return d == null ? "" : d.format(EXP_FECHA);
	}

	private static void writeResumenSheet(XSSFWorkbook wb, SessionDetailDto d) {
		Sheet sh = wb.createSheet("Resumen");
		SessionHeaderDto h = d.session();
		ConciliacionStatsDto s = d.stats();
		int r = 0;
		Row row0 = sh.createRow(r++);
		row0.createCell(0).setCellValue("Conciliación bancaria — sesión " + h.id());
		r++;
		addKv(sh, r++, "Creada", String.valueOf(h.createdAt()));
		addKv(sh, r++, "Estado de la sesión", sessionStatusEs(h.status()));
		addKv(sh, r++, "Archivo banco", nullToDash(h.sourceBankFileName()));
		addKv(sh, r++, "Archivo empresa", nullToDash(h.sourceCompanyFileName()));
		r++;
		addKv(sh, r++, "Saldo inicial banco (declarado)", h.openingBankBalance());
		addKv(sh, r++, "Saldo final banco (declarado)", h.closingBankBalance());
		addKv(sh, r++, "Saldo inicial empresa (declarado)", h.openingCompanyBalance());
		addKv(sh, r++, "Saldo final empresa (declarado)", h.closingCompanyBalance());
		r++;
		addKv(sh, r++, "Σ importes extracto (banco, control)", s.sumBank());
		addKv(sh, r++, "Σ plataforma — conciliación (debe−haber, alineado extracto)", s.sumCompany());
		addKv(sh, r++, "Σ plataforma — neto contable (haber−debe por línea, libro)", s.sumCompanyAccounting());
		addKv(sh, r++, "Diferencia total (banco − empresa conciliación)", s.differenceTotal());
		addKv(sh, r++, "Δ pares (Σ banco en pares − Σ empresa en pares)", s.reconciledPairDelta());
		addKv(sh, r++, "Efecto neto pendientes (Σ pend. banco − Σ pend. empresa)", s.pendingNetDifference());
		addKv(sh, r++, "Descomposición OK (algebra)", s.differenceDecompositionOk());
		addKv(sh, r++, "Estado del reporte", s.reconciliationStatus());
		addKv(sh, r++, "Detalle estado", s.reconciliationStatusDetail());
		addKv(sh, r++, "Saldo ajustado (final extracto + Σ pend. emp. − Σ pend. banco)", s.adjustedBalanceFromBank());
		addKv(sh, r++, "Diferencia (ajustado extracto − saldo final empresa)", s.adjustedVsCompanyClosing());
		addKv(sh, r++, "Auditoría: cierre extracto ↔ libro conforme (ambos saldos finales)", s.auditCierreCuadrado());
		r++;
		addKv(sh, r++, "Pares: idénticos ±tol / con brecha / signo opuesto",
				s.pairsExactAmountCount() + " / " + s.pairsWithAmountGapCount() + " / " + s.pairsOppositeSignCount());
		addKv(sh, r++, "Pares conciliados (cantidad)", s.matchedPairs());
		addKv(sh, r++, "Suma importes conciliados (lado banco)", s.sumReconciledBank());
		addKv(sh, r++, "Suma importes conciliados (lado empresa)", s.sumReconciledCompany());
		r++;
		addKv(sh, r++, "Suma pendientes banco", s.sumPendingBank());
		addKv(sh, r++, "Suma pendientes empresa", s.sumPendingCompany());
		r++;
		addKv(sh, r++, "Movimientos banco / empresa (filas)", s.bankRowCount() + " / " + s.companyRowCount());
		addKv(sh, r++, "Pendientes banco / empresa (filas)", s.unmatchedBankCount() + " / " + s.unmatchedCompanyCount());
		addKv(sh, r++, "% mov. conciliados (banco)", s.pctRowsReconciledBank());
		addKv(sh, r++, "% mov. conciliados (empresa)", s.pctRowsReconciledCompany());
		r++;
		row0 = sh.createRow(r++);
		row0.createCell(0).setCellValue("Explicación de la diferencia");
		for (String line : s.differenceExplanation()) {
			Row er = sh.createRow(r++);
			er.createCell(0).setCellValue(line);
		}
		for (int c = 0; c < 2; c++) {
			sh.autoSizeColumn(c);
		}
	}

	private static void addKv(Sheet sh, int rowIndex, String key, Object value) {
		Row row = sh.createRow(rowIndex);
		row.createCell(0).setCellValue(key);
		Cell c1 = row.createCell(1);
		if (value == null) {
			c1.setCellValue("—");
		} else if (value instanceof BigDecimal bd) {
			c1.setCellValue(bd.doubleValue());
		} else if (value instanceof Boolean b) {
			c1.setCellValue(b);
		} else if (value instanceof Number n) {
			c1.setCellValue(n.doubleValue());
		} else {
			c1.setCellValue(value.toString());
		}
	}

	private static String nullToDash(String s) {
		return s == null || s.isBlank() ? "—" : s;
	}

	private static String sessionStatusEs(String status) {
		if (status == null || status.isBlank()) {
			return "—";
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

	private static void writeConciliadosSheet(XSSFWorkbook wb, SessionDetailDto d) {
		Sheet sh = wb.createSheet("Conciliados");
		String[] headers = { "Fecha banco", "Fecha empresa", "ID par", "ID banco", "ID empresa", "Ref. banco",
				"Descripción banco", "Ref. empresa", "Descripción empresa", "Importe banco", "Importe empresa",
				"Neto contable (empresa)", "Estado del par", "Match" };
		Row h = sh.createRow(0);
		for (int i = 0; i < headers.length; i++) {
			h.createCell(i).setCellValue(headers[i]);
		}
		Map<Long, MovimientoDto> bankMap = indexById(d.bankTransactions());
		Map<Long, MovimientoDto> compMap = indexById(d.companyTransactions());
		List<ParDto> pairs = new ArrayList<>(d.pairs());
		pairs.sort(Comparator.comparing(ParDto::bankDate).thenComparing(ParDto::pairId));
		int r = 1;
		for (ParDto p : pairs) {
			MovimientoDto b = bankMap.get(p.bankTxId());
			MovimientoDto c = compMap.get(p.companyTxId());
			if (b == null || c == null) {
				continue;
			}
			Row row = sh.createRow(r++);
			int col = 0;
			row.createCell(col++).setCellValue(fmtFecha(b.txDate()));
			row.createCell(col++).setCellValue(fmtFecha(c.txDate()));
			row.createCell(col++).setCellValue(p.pairId());
			row.createCell(col++).setCellValue(b.id());
			row.createCell(col++).setCellValue(c.id());
			row.createCell(col++).setCellValue(emptyToBlank(b.reference()));
			row.createCell(col++).setCellValue(emptyToBlank(b.description()));
			row.createCell(col++).setCellValue(emptyToBlank(c.reference()));
			row.createCell(col++).setCellValue(emptyToBlank(c.description()));
			row.createCell(col++).setCellValue(b.amount().doubleValue());
			row.createCell(col++).setCellValue(c.amount().doubleValue());
			BigDecimal acc = c.accountingAmount();
			BigDecimal neto = acc != null ? acc : c.amount().negate();
			row.createCell(col++).setCellValue(neto.doubleValue());
			row.createCell(col++).setCellValue(pairKindLabelEs(p.pairKind()));
			row.createCell(col++).setCellValue(matchSourceLabel(p.matchSource()));
		}
		for (int i = 0; i < headers.length; i++) {
			sh.autoSizeColumn(i);
		}
	}

	private static String emptyToBlank(String s) {
		return s == null || s.isBlank() ? "" : s;
	}

	private static String pairKindLabelEs(String pairKind) {
		if (pairKind == null || pairKind.isBlank()) {
			return "";
		}
		return switch (pairKind) {
			case "EXACT" -> "Coincidente";
			case "AMOUNT_GAP" -> "Brecha de importe";
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

	private static void writePendientesBancoSheet(XSSFWorkbook wb, List<MovimientoDto> bank) {
		Sheet sh = wb.createSheet("Pendientes banco");
		String[] headers = { "ID", "Fecha", "Importe", "Referencia", "Descripción", "Clasificación", "Duplicado",
				"Match sugerido (ID)", "Match sugerido (texto)", "Nº comentarios" };
		Row h = sh.createRow(0);
		for (int i = 0; i < headers.length; i++) {
			h.createCell(i).setCellValue(headers[i]);
		}
		List<MovimientoDto> rows = new ArrayList<>(bank);
		rows.sort(Comparator.comparing(MovimientoDto::txDate).thenComparing(MovimientoDto::id));
		int r = 1;
		for (MovimientoDto m : rows) {
			writePendienteBancoRow(sh.createRow(r++), m);
		}
		for (int i = 0; i < headers.length; i++) {
			sh.autoSizeColumn(i);
		}
	}

	private static void writePendienteBancoRow(Row row, MovimientoDto m) {
		int col = 0;
		row.createCell(col++).setCellValue(m.id());
		row.createCell(col++).setCellValue(fmtFecha(m.txDate()));
		row.createCell(col++).setCellValue(m.amount().doubleValue());
		row.createCell(col++).setCellValue(emptyToBlank(m.reference()));
		row.createCell(col++).setCellValue(emptyToBlank(m.description()));
		row.createCell(col++).setCellValue(emptyToBlank(m.pendingClassification()));
		row.createCell(col++).setCellValue(m.duplicateInFile() ? "Sí" : "No");
		row.createCell(col++).setCellValue(m.fuzzyCounterpartId() == null ? "" : String.valueOf(m.fuzzyCounterpartId()));
		row.createCell(col++).setCellValue(emptyToBlank(m.fuzzyHint()));
		row.createCell(col++).setCellValue(m.commentCount());
	}

	private static void writePendientesEmpresaSheet(XSSFWorkbook wb, List<MovimientoDto> comp) {
		Sheet sh = wb.createSheet("Pendientes empresa");
		String[] headers = { "ID", "Fecha", "Importe (conciliación)", "Neto contable", "Referencia", "Descripción",
				"Clasificación", "Duplicado", "Match sugerido (ID)", "Match sugerido (texto)", "Nº comentarios" };
		Row h = sh.createRow(0);
		for (int i = 0; i < headers.length; i++) {
			h.createCell(i).setCellValue(headers[i]);
		}
		List<MovimientoDto> rows = new ArrayList<>(comp);
		rows.sort(Comparator.comparing(MovimientoDto::txDate).thenComparing(MovimientoDto::id));
		int r = 1;
		for (MovimientoDto m : rows) {
			writePendienteEmpresaRow(sh.createRow(r++), m);
		}
		for (int i = 0; i < headers.length; i++) {
			sh.autoSizeColumn(i);
		}
	}

	private static void writePendienteEmpresaRow(Row row, MovimientoDto m) {
		int col = 0;
		row.createCell(col++).setCellValue(m.id());
		row.createCell(col++).setCellValue(fmtFecha(m.txDate()));
		row.createCell(col++).setCellValue(m.amount().doubleValue());
		BigDecimal acc = m.accountingAmount();
		BigDecimal neto = acc != null ? acc : m.amount().negate();
		row.createCell(col++).setCellValue(neto.doubleValue());
		row.createCell(col++).setCellValue(emptyToBlank(m.reference()));
		row.createCell(col++).setCellValue(emptyToBlank(m.description()));
		row.createCell(col++).setCellValue(emptyToBlank(m.pendingClassification()));
		row.createCell(col++).setCellValue(m.duplicateInFile() ? "Sí" : "No");
		row.createCell(col++).setCellValue(m.fuzzyCounterpartId() == null ? "" : String.valueOf(m.fuzzyCounterpartId()));
		row.createCell(col++).setCellValue(emptyToBlank(m.fuzzyHint()));
		row.createCell(col++).setCellValue(m.commentCount());
	}

	private record ExportDetLine(MovimientoDto mov, boolean bankSide) {
	}

	private static void writeDetalleCompletoSheet(XSSFWorkbook wb, SessionDetailDto d) {
		Sheet sh = wb.createSheet("Detalle completo");
		String[] headers = { "ID", "Fecha", "Origen", "Referencia", "Descripción", "Importe (conciliación)",
				"Neto contable", "Estado", "ID par", "Match", "Nº comentarios" };
		Row h = sh.createRow(0);
		for (int i = 0; i < headers.length; i++) {
			h.createCell(i).setCellValue(headers[i]);
		}
		Map<Long, Long> bankToPair = new HashMap<>();
		Map<Long, Long> companyToPair = new HashMap<>();
		Map<Long, String> pairMatch = new HashMap<>();
		for (ParDto p : d.pairs()) {
			bankToPair.put(p.bankTxId(), p.pairId());
			companyToPair.put(p.companyTxId(), p.pairId());
			pairMatch.put(p.pairId(), p.matchSource());
		}
		List<ExportDetLine> lines = new ArrayList<>();
		for (MovimientoDto m : d.bankTransactions()) {
			lines.add(new ExportDetLine(m, true));
		}
		for (MovimientoDto m : d.companyTransactions()) {
			lines.add(new ExportDetLine(m, false));
		}
		lines.sort(Comparator.comparing((ExportDetLine x) -> x.mov().txDate()).thenComparing(x -> x.bankSide() ? 0 : 1)
				.thenComparing(x -> x.mov().id()));
		int r = 1;
		for (ExportDetLine line : lines) {
			MovimientoDto m = line.mov();
			boolean bank = line.bankSide();
			Row row = sh.createRow(r++);
			int col = 0;
			row.createCell(col++).setCellValue(m.id());
			row.createCell(col++).setCellValue(fmtFecha(m.txDate()));
			row.createCell(col++).setCellValue(bank ? "Banco" : "Empresa");
			row.createCell(col++).setCellValue(emptyToBlank(m.reference()));
			row.createCell(col++).setCellValue(emptyToBlank(m.description()));
			row.createCell(col++).setCellValue(m.amount().doubleValue());
			if (bank) {
				row.createCell(col++).setCellValue("");
			} else {
				BigDecimal acc = m.accountingAmount();
				BigDecimal neto = acc != null ? acc : m.amount().negate();
				row.createCell(col++).setCellValue(neto.doubleValue());
			}
			Long pairId = bank ? bankToPair.get(m.id()) : companyToPair.get(m.id());
			if (pairId != null) {
				row.createCell(col++).setCellValue("Conciliado");
				row.createCell(col++).setCellValue(pairId);
				row.createCell(col++).setCellValue(matchSourceLabel(pairMatch.get(pairId)));
			} else {
				row.createCell(col++).setCellValue(bank ? "Pendiente banco" : "Pendiente empresa");
				row.createCell(col++).setCellValue("");
				row.createCell(col++).setCellValue("");
			}
			row.createCell(col++).setCellValue(m.commentCount());
		}
		for (int i = 0; i < headers.length; i++) {
			sh.autoSizeColumn(i);
		}
	}

	private String buildPairsCsv(long sessionId) {
		List<ReconciliationPair> pairs = reconciliationPairRepository.findAllWithPartiesBySessionId(sessionId);
		StringBuilder sb = new StringBuilder();
		sb.append(String.join(",",
				"tipo_match", "id_par", "id_banco", "fecha_banco", "importe_banco", "ref_banco", "desc_banco",
				"id_empresa", "fecha_empresa", "importe_empresa_conciliacion", "neto_contable_haber_menos_debe",
				"ref_empresa", "desc_empresa")).append('\n');
		for (ReconciliationPair p : pairs) {
			BankTransaction b = p.getBankTransaction();
			CompanyTransaction c = p.getCompanyTransaction();
			BigDecimal acc = c.getAccountingAmount();
			String neto = acc != null ? acc.toPlainString() : c.getAmount().negate().toPlainString();
			sb.append(csvRow(p.getMatchSource().name(), String.valueOf(p.getId()), String.valueOf(b.getId()),
					String.valueOf(b.getTxDate()), b.getAmount().toPlainString(), csvCell(b.getReference()),
					csvCell(b.getDescription()), String.valueOf(c.getId()), String.valueOf(c.getTxDate()),
					c.getAmount().toPlainString(), neto, csvCell(c.getReference()), csvCell(c.getDescription())))
					.append('\n');
		}
		return sb.toString();
	}

	private String buildPendingCsv(long sessionId) {
		List<BankTransaction> banks = bankTransactionRepository.findBySession_IdOrderByTxDateAscIdAsc(sessionId);
		List<CompanyTransaction> companies = companyTransactionRepository
				.findBySession_IdOrderByTxDateAscIdAsc(sessionId);
		List<ReconciliationPair> pairs = reconciliationPairRepository.findAllWithPartiesBySessionId(sessionId);

		Set<Long> matchedBank = pairs.stream().map(p -> p.getBankTransaction().getId()).collect(Collectors.toSet());
		Set<Long> matchedCompany = pairs.stream().map(p -> p.getCompanyTransaction().getId())
				.collect(Collectors.toSet());

		StringBuilder sb = new StringBuilder();
		sb.append(String.join(",", "lado", "id", "fecha", "importe_conciliacion", "neto_contable_haber_menos_debe",
				"referencia", "descripcion", "clasificacion")).append('\n');
		for (BankTransaction b : banks) {
			if (!matchedBank.contains(b.getId())) {
				String cls = b.getPendingClassification() == null ? "" : b.getPendingClassification().name();
				sb.append(csvRow("BANCO", String.valueOf(b.getId()), String.valueOf(b.getTxDate()),
						b.getAmount().toPlainString(), "", csvCell(b.getReference()), csvCell(b.getDescription()), cls))
						.append('\n');
			}
		}
		for (CompanyTransaction c : companies) {
			if (!matchedCompany.contains(c.getId())) {
				String cls = c.getPendingClassification() == null ? "" : c.getPendingClassification().name();
				BigDecimal acc = c.getAccountingAmount();
				String neto = acc != null ? acc.toPlainString() : c.getAmount().negate().toPlainString();
				sb.append(csvRow("EMPRESA", String.valueOf(c.getId()), String.valueOf(c.getTxDate()),
						c.getAmount().toPlainString(), neto, csvCell(c.getReference()), csvCell(c.getDescription()), cls))
						.append('\n');
			}
		}
		return sb.toString();
	}

	private static String csvRow(String... cells) {
		StringBuilder line = new StringBuilder();
		for (int i = 0; i < cells.length; i++) {
			if (i > 0) {
				line.append(',');
			}
			line.append(csvCell(cells[i]));
		}
		return line.toString();
	}

	private static String csvCell(String s) {
		if (s == null) {
			return "";
		}
		if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
			return "\"" + s.replace("\"", "\"\"") + "\"";
		}
		return s;
	}
}
