package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;
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
	 * Libro Excel con hojas Resumen (totales y KPIs), Pares y Pendientes.
	 */
	@Transactional(readOnly = true)
	public byte[] exportExcel(long sessionId) {
		SessionDetailDto d = conciliacionSessionService.getSessionDetail(sessionId);
		try (XSSFWorkbook wb = new XSSFWorkbook(); ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
			writeResumenSheet(wb, d);
			writePairsSheet(wb, reconciliationPairRepository.findAllWithPartiesBySessionId(sessionId));
			writePendingSheetFromDto(wb, d.unmatchedBankTransactions(), d.unmatchedCompanyTransactions());
			wb.write(bos);
			return bos.toByteArray();
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
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
		addKv(sh, r++, "Estado", h.status());
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

	private static void writePairsSheet(XSSFWorkbook wb, List<ReconciliationPair> pairs) {
		Sheet sh = wb.createSheet("Pares");
		String[] headers = { "tipo_match", "id_par", "id_banco", "fecha_banco", "importe_banco", "ref_banco",
				"desc_banco", "id_empresa", "fecha_empresa", "importe_empresa_conciliacion", "neto_contable_haber_menos_debe",
				"ref_empresa", "desc_empresa" };
		Row h = sh.createRow(0);
		for (int i = 0; i < headers.length; i++) {
			h.createCell(i).setCellValue(headers[i]);
		}
		int r = 1;
		for (ReconciliationPair p : pairs) {
			BankTransaction b = p.getBankTransaction();
			CompanyTransaction c = p.getCompanyTransaction();
			Row row = sh.createRow(r++);
			int col = 0;
			row.createCell(col++).setCellValue(p.getMatchSource().name());
			row.createCell(col++).setCellValue(p.getId());
			row.createCell(col++).setCellValue(b.getId());
			row.createCell(col++).setCellValue(b.getTxDate().toString());
			row.createCell(col++).setCellValue(b.getAmount().doubleValue());
			row.createCell(col++).setCellValue(b.getReference() == null ? "" : b.getReference());
			row.createCell(col++).setCellValue(b.getDescription() == null ? "" : b.getDescription());
			row.createCell(col++).setCellValue(c.getId());
			row.createCell(col++).setCellValue(c.getTxDate().toString());
			row.createCell(col++).setCellValue(c.getAmount().doubleValue());
			BigDecimal acc = c.getAccountingAmount();
			row.createCell(col++).setCellValue(acc != null ? acc.doubleValue() : c.getAmount().negate().doubleValue());
			row.createCell(col++).setCellValue(c.getReference() == null ? "" : c.getReference());
			row.createCell(col++).setCellValue(c.getDescription() == null ? "" : c.getDescription());
		}
		for (int i = 0; i < headers.length; i++) {
			sh.autoSizeColumn(i);
		}
	}

	private static void writePendingSheetFromDto(XSSFWorkbook wb, List<MovimientoDto> bank, List<MovimientoDto> comp) {
		Sheet sh = wb.createSheet("Pendientes");
		String[] headers = { "lado", "id", "fecha", "importe_conciliacion", "neto_contable_haber_menos_debe",
				"referencia", "descripcion", "clasificacion" };
		Row h = sh.createRow(0);
		for (int i = 0; i < headers.length; i++) {
			h.createCell(i).setCellValue(headers[i]);
		}
		int r = 1;
		for (MovimientoDto m : bank) {
			r = writeMovRow(sh, r, "BANCO", m);
		}
		for (MovimientoDto m : comp) {
			r = writeMovRow(sh, r, "EMPRESA", m);
		}
		for (int i = 0; i < headers.length; i++) {
			sh.autoSizeColumn(i);
		}
	}

	private static int writeMovRow(Sheet sh, int r, String lado, MovimientoDto m) {
		Row row = sh.createRow(r);
		row.createCell(0).setCellValue(lado);
		row.createCell(1).setCellValue(m.id());
		row.createCell(2).setCellValue(m.txDate().toString());
		row.createCell(3).setCellValue(m.amount().doubleValue());
		BigDecimal acc = m.accountingAmount();
		if ("BANCO".equals(lado)) {
			row.createCell(4).setCellValue("");
		} else {
			BigDecimal neto = acc != null ? acc : m.amount().negate();
			row.createCell(4).setCellValue(neto.doubleValue());
		}
		row.createCell(5).setCellValue(m.reference() == null ? "" : m.reference());
		row.createCell(6).setCellValue(m.description() == null ? "" : m.description());
		row.createCell(7).setCellValue(m.pendingClassification() == null ? "" : m.pendingClassification());
		return r + 1;
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
