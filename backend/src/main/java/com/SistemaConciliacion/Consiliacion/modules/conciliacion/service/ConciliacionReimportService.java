package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ImportFileSummaryDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ImportLayoutDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ReimportPreviewDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ReimportResultDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PendingMovementSide;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionAuditEventType;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionStatus;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.BancoWorkbookParser;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.BankGridLayout;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.CompanyGridLayout;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.PlataformaWorkbookParser;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.BankTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.CompanyTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.PendingMovementCommentRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationPairRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.TransactionMergePlanner.ExistingRow;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.TransactionMergePlanner.MergePlan;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.TransactionMergePlanner.RowUpdate;

@Service
public class ConciliacionReimportService {

	private static final int MAX_SOURCE_NAME_LEN = 255;

	private final ReconciliationSessionRepository sessionRepository;
	private final BankTransactionRepository bankTransactionRepository;
	private final CompanyTransactionRepository companyTransactionRepository;
	private final ReconciliationPairRepository reconciliationPairRepository;
	private final PendingMovementCommentRepository pendingMovementCommentRepository;
	private final BancoWorkbookParser bancoWorkbookParser;
	private final PlataformaWorkbookParser plataformaWorkbookParser;
	private final ConciliacionManualPairService manualPairService;
	private final MovementMatchService movementMatchService;
	private final MovementAttachmentService movementAttachmentService;
	private final SessionAuditService sessionAuditService;

	public ConciliacionReimportService(ReconciliationSessionRepository sessionRepository,
			BankTransactionRepository bankTransactionRepository,
			CompanyTransactionRepository companyTransactionRepository,
			ReconciliationPairRepository reconciliationPairRepository,
			PendingMovementCommentRepository pendingMovementCommentRepository,
			BancoWorkbookParser bancoWorkbookParser, PlataformaWorkbookParser plataformaWorkbookParser,
			ConciliacionManualPairService manualPairService, MovementMatchService movementMatchService,
			MovementAttachmentService movementAttachmentService,
			SessionAuditService sessionAuditService) {
		this.sessionRepository = sessionRepository;
		this.bankTransactionRepository = bankTransactionRepository;
		this.companyTransactionRepository = companyTransactionRepository;
		this.reconciliationPairRepository = reconciliationPairRepository;
		this.pendingMovementCommentRepository = pendingMovementCommentRepository;
		this.bancoWorkbookParser = bancoWorkbookParser;
		this.plataformaWorkbookParser = plataformaWorkbookParser;
		this.manualPairService = manualPairService;
		this.movementMatchService = movementMatchService;
		this.movementAttachmentService = movementAttachmentService;
		this.sessionAuditService = sessionAuditService;
	}

	@Transactional(readOnly = true)
	public ReimportPreviewDto preview(long sessionId, PendingMovementSide side, List<MultipartFile> files,
			ImportLayoutDto layout) throws IOException {
		PreparedMerge prepared = prepare(sessionId, side, files, layout);
		int pairsToUnlink = countPairsToUnlink(sessionId, side, prepared.plan());
		return new ReimportPreviewDto(side.name(), prepared.plan().unchangedCount(), prepared.plan().addedCount(),
				prepared.plan().updatedCount(), prepared.plan().removedCount(), pairsToUnlink);
	}

	@Transactional
	public ReimportResultDto apply(long sessionId, PendingMovementSide side, List<MultipartFile> files,
			ImportLayoutDto layout) throws IOException {
		PreparedMerge prepared = prepare(sessionId, side, files, layout);
		ReconciliationSession session = prepared.session();
		MergePlan plan = prepared.plan();
		int pairsUnlinked = 0;

		if (side == PendingMovementSide.BANK) {
			pairsUnlinked += applyBankPlan(session, plan);
			session.setSourceBankFileName(prepared.sourceFileName());
			session.setBankImportFileSummaries(prepared.fileSummaries());
		} else {
			pairsUnlinked += applyCompanyPlan(session, plan);
			session.setSourceCompanyFileName(prepared.sourceFileName());
			session.setCompanyImportFileSummaries(prepared.fileSummaries());
		}
		sessionRepository.save(session);

		String auditDetail = String.format("%s · +%d · ~%d · −%d · sin cambio %d · pares desvinculados %d · %s",
				sideLabel(side), plan.addedCount(), plan.updatedCount(), plan.removedCount(), plan.unchangedCount(),
				pairsUnlinked, prepared.sourceFileName());
		sessionAuditService.append(sessionId, SessionAuditEventType.REIMPORT, auditDetail);

		return new ReimportResultDto(side.name(), plan.unchangedCount(), plan.addedCount(), plan.updatedCount(),
				plan.removedCount(), pairsUnlinked, bankTransactionRepository.countBySession_Id(sessionId),
				companyTransactionRepository.countBySession_Id(sessionId), prepared.sourceFileName());
	}

	private record PreparedMerge(ReconciliationSession session, MergePlan plan, String sourceFileName,
			List<ImportFileSummaryDto> fileSummaries) {
	}

	private record ParsedFiles(List<ImportRowSnapshot> rows, List<ImportFileSummaryDto> summaries) {
	}

	private PreparedMerge prepare(long sessionId, PendingMovementSide side, List<MultipartFile> files,
			ImportLayoutDto layout) throws IOException {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La conciliación está cerrada; no se puede actualizar el archivo.");
		}
		List<MultipartFile> parts = nonEmptyParts(files, side);
		String sourceFileName = joinFileNames(parts);
		ParsedFiles parsed = parseSnapshots(side, parts, layout);
		List<ExistingRow> existingRows = loadExistingRows(sessionId, side);
		MergePlan plan = TransactionMergePlanner.plan(existingRows, parsed.rows());
		return new PreparedMerge(session, plan, sourceFileName, parsed.summaries());
	}

	private List<ExistingRow> loadExistingRows(long sessionId, PendingMovementSide side) {
		if (side == PendingMovementSide.BANK) {
			List<BankTransaction> rows = bankTransactionRepository.findBySession_IdOrderByTxDateAscIdAsc(sessionId);
			backfillBankFingerprints(rows);
			return rows.stream()
					.map(tx -> new ExistingRow(tx.getId(), tx.getContentFingerprint(),
							TransactionFingerprint.correctionKey(tx.getTxDate(), tx.getReference(), tx.getDescription())))
					.toList();
		}
		List<CompanyTransaction> rows = companyTransactionRepository.findBySession_IdOrderByTxDateAscIdAsc(sessionId);
		backfillCompanyFingerprints(rows);
		return rows.stream()
				.map(tx -> new ExistingRow(tx.getId(), tx.getContentFingerprint(),
						TransactionFingerprint.correctionKey(tx.getTxDate(), tx.getReference(), tx.getDescription())))
				.toList();
	}

	private void backfillBankFingerprints(List<BankTransaction> rows) {
		List<BankTransaction> dirty = new ArrayList<>();
		for (BankTransaction tx : rows) {
			if (tx.getContentFingerprint() == null || tx.getContentFingerprint().isBlank()) {
				tx.setContentFingerprint(TransactionFingerprint.forBank(tx));
				dirty.add(tx);
			}
		}
		if (!dirty.isEmpty()) {
			bankTransactionRepository.saveAll(dirty);
		}
	}

	private void backfillCompanyFingerprints(List<CompanyTransaction> rows) {
		List<CompanyTransaction> dirty = new ArrayList<>();
		for (CompanyTransaction tx : rows) {
			if (tx.getContentFingerprint() == null || tx.getContentFingerprint().isBlank()) {
				tx.setContentFingerprint(TransactionFingerprint.forCompany(tx));
				dirty.add(tx);
			}
		}
		if (!dirty.isEmpty()) {
			companyTransactionRepository.saveAll(dirty);
		}
	}

	private ParsedFiles parseSnapshots(PendingMovementSide side, List<MultipartFile> files, ImportLayoutDto layout)
			throws IOException {
		List<ImportRowSnapshot> all = new ArrayList<>();
		List<ImportFileSummaryDto> summaries = new ArrayList<>();
		if (side == PendingMovementSide.BANK) {
			BankGridLayout bankLayout = ImportLayoutResolver.resolveBank(layout);
			bankLayout.validate();
			for (MultipartFile file : files) {
				List<ImportRowSnapshot> rows = parseBankSnapshots(file, bankLayout);
				all.addAll(rows);
				summaries.add(new ImportFileSummaryDto(displayFileName(file), rows.size()));
			}
		} else {
			CompanyGridLayout companyLayout = ImportLayoutResolver.resolveCompany(layout);
			companyLayout.validate();
			for (MultipartFile file : files) {
				List<ImportRowSnapshot> rows = parseCompanySnapshots(file, companyLayout);
				all.addAll(rows);
				summaries.add(new ImportFileSummaryDto(displayFileName(file), rows.size()));
			}
		}
		if (all.isEmpty()) {
			throw new IllegalArgumentException("No se encontraron movimientos en el archivo enviado.");
		}
		return new ParsedFiles(all, summaries);
	}

	private List<ImportRowSnapshot> parseBankSnapshots(MultipartFile file, BankGridLayout layout) throws IOException {
		try (InputStream is = file.getInputStream(); Workbook wb = WorkbookFactory.create(is)) {
			Sheet sheet = sheetAt(wb, layout.sheetIndex());
			return bancoWorkbookParser.parseSnapshots(sheet, layout);
		}
	}

	private List<ImportRowSnapshot> parseCompanySnapshots(MultipartFile file, CompanyGridLayout layout)
			throws IOException {
		try (InputStream is = file.getInputStream(); Workbook wb = WorkbookFactory.create(is)) {
			Sheet sheet = sheetAt(wb, layout.sheetIndex());
			return plataformaWorkbookParser.parseSnapshots(sheet, layout);
		}
	}

	private int applyBankPlan(ReconciliationSession session, MergePlan plan) {
		int pairsUnlinked = 0;
		for (Long id : plan.deleteIds()) {
			pairsUnlinked += removeBankTransaction(session.getId(), id);
		}
		for (RowUpdate update : plan.updates()) {
			pairsUnlinked += updateBankTransaction(session.getId(), update);
		}
		if (!plan.inserts().isEmpty()) {
			List<BankTransaction> inserts = new ArrayList<>();
			for (ImportRowSnapshot snap : plan.inserts()) {
				inserts.add(newBankTransaction(session, snap));
			}
			bankTransactionRepository.saveAll(inserts);
		}
		return pairsUnlinked;
	}

	private int applyCompanyPlan(ReconciliationSession session, MergePlan plan) {
		int pairsUnlinked = 0;
		for (Long id : plan.deleteIds()) {
			pairsUnlinked += removeCompanyTransaction(session.getId(), id);
		}
		for (RowUpdate update : plan.updates()) {
			pairsUnlinked += updateCompanyTransaction(session.getId(), update);
		}
		if (!plan.inserts().isEmpty()) {
			List<CompanyTransaction> inserts = new ArrayList<>();
			for (ImportRowSnapshot snap : plan.inserts()) {
				inserts.add(newCompanyTransaction(session, snap));
			}
			companyTransactionRepository.saveAll(inserts);
		}
		return pairsUnlinked;
	}

	private int removeBankTransaction(long sessionId, long txId) {
		int pairs = manualPairService.unlinkAnyForMovementSilent(sessionId, PendingMovementSide.BANK, txId) ? 1 : 0;
		cleanupMovementArtifacts(sessionId, PendingMovementSide.BANK, txId);
		BankTransaction tx = bankTransactionRepository.findByIdAndSession_Id(txId, sessionId)
				.orElseThrow(() -> new IllegalStateException("Movimiento de banco no encontrado: " + txId));
		bankTransactionRepository.delete(tx);
		return pairs;
	}

	private int removeCompanyTransaction(long sessionId, long txId) {
		int pairs = manualPairService.unlinkAnyForMovementSilent(sessionId, PendingMovementSide.COMPANY, txId) ? 1
				: 0;
		cleanupMovementArtifacts(sessionId, PendingMovementSide.COMPANY, txId);
		CompanyTransaction tx = companyTransactionRepository.findByIdAndSession_Id(txId, sessionId)
				.orElseThrow(() -> new IllegalStateException("Movimiento de empresa no encontrado: " + txId));
		companyTransactionRepository.delete(tx);
		return pairs;
	}

	private int updateBankTransaction(long sessionId, RowUpdate update) {
		int pairs = 0;
		if (movementMatchService.isBankTransactionMatched(update.existingId())) {
			pairs = manualPairService.unlinkAnyForMovementSilent(sessionId, PendingMovementSide.BANK,
					update.existingId()) ? 1 : 0;
		}
		BankTransaction tx = bankTransactionRepository.findByIdAndSession_Id(update.existingId(), sessionId)
				.orElseThrow(() -> new IllegalStateException("Movimiento de banco no encontrado: " + update.existingId()));
		applySnapshotToBank(tx, update.newData());
		bankTransactionRepository.save(tx);
		return pairs;
	}

	private int updateCompanyTransaction(long sessionId, RowUpdate update) {
		int pairs = 0;
		if (movementMatchService.isCompanyTransactionMatched(update.existingId())) {
			pairs = manualPairService.unlinkAnyForMovementSilent(sessionId, PendingMovementSide.COMPANY,
					update.existingId()) ? 1 : 0;
		}
		CompanyTransaction tx = companyTransactionRepository.findByIdAndSession_Id(update.existingId(), sessionId)
				.orElseThrow(
						() -> new IllegalStateException("Movimiento de empresa no encontrado: " + update.existingId()));
		applySnapshotToCompany(tx, update.newData());
		companyTransactionRepository.save(tx);
		return pairs;
	}

	private void cleanupMovementArtifacts(long sessionId, PendingMovementSide side, long txId) {
		movementAttachmentService.deleteAllForMovement(sessionId, side, txId);
		pendingMovementCommentRepository.deleteBySession_IdAndMovementSideAndMovementId(sessionId, side, txId);
	}

	private static BankTransaction newBankTransaction(ReconciliationSession session, ImportRowSnapshot snap) {
		BankTransaction tx = new BankTransaction();
		tx.setSession(session);
		applySnapshotToBank(tx, snap);
		return tx;
	}

	private static CompanyTransaction newCompanyTransaction(ReconciliationSession session, ImportRowSnapshot snap) {
		CompanyTransaction tx = new CompanyTransaction();
		tx.setSession(session);
		applySnapshotToCompany(tx, snap);
		return tx;
	}

	private static void applySnapshotToBank(BankTransaction tx, ImportRowSnapshot snap) {
		tx.setTxDate(snap.txDate());
		tx.setAmount(snap.amount());
		tx.setReference(snap.reference());
		tx.setDescription(snap.description());
		tx.setContentFingerprint(snap.contentFingerprint());
	}

	private static void applySnapshotToCompany(CompanyTransaction tx, ImportRowSnapshot snap) {
		tx.setTxDate(snap.txDate());
		tx.setAmount(snap.amount());
		tx.setAccountingAmount(snap.accountingAmount());
		tx.setReference(snap.reference());
		tx.setDescription(snap.description());
		tx.setContentFingerprint(snap.contentFingerprint());
	}

	private int countPairsToUnlink(long sessionId, PendingMovementSide side, MergePlan plan) {
		Set<Long> txIds = new HashSet<>();
		txIds.addAll(plan.deleteIds());
		for (RowUpdate u : plan.updates()) {
			txIds.add(u.existingId());
		}
		int count = 0;
		for (Long txId : txIds) {
			boolean linked = side == PendingMovementSide.BANK
					? movementMatchService.isBankTransactionMatched(txId)
					: movementMatchService.isCompanyTransactionMatched(txId);
			if (linked) {
				count++;
			}
		}
		return count;
	}

	private static List<MultipartFile> nonEmptyParts(List<MultipartFile> files, PendingMovementSide side) {
		if (files == null || files.isEmpty()) {
			throw new IllegalArgumentException("Falta el archivo de " + sideLabel(side) + ".");
		}
		List<MultipartFile> out = files.stream().filter(f -> f != null && !f.isEmpty()).collect(Collectors.toList());
		if (out.isEmpty()) {
			throw new IllegalArgumentException("Falta el archivo de " + sideLabel(side) + ".");
		}
		return out;
	}

	private static String sideLabel(PendingMovementSide side) {
		return side == PendingMovementSide.BANK ? "banco" : "empresa";
	}

	private static String joinFileNames(List<MultipartFile> files) {
		List<String> names = files.stream().map(MultipartFile::getOriginalFilename).filter(n -> n != null && !n.isBlank())
				.toList();
		if (names.isEmpty()) {
			return "—";
		}
		if (names.size() == 1) {
			return truncate(names.get(0), MAX_SOURCE_NAME_LEN);
		}
		String joined = String.join("; ", names);
		return truncate(names.size() + " archivos: " + joined, MAX_SOURCE_NAME_LEN);
	}

	private static String truncate(String s, int max) {
		if (s.length() <= max) {
			return s;
		}
		return s.substring(0, max - 1) + "…";
	}

	private static Sheet sheetAt(Workbook wb, int index) {
		if (wb.getNumberOfSheets() < 1) {
			throw new IllegalArgumentException("El libro no tiene hojas.");
		}
		if (index < 0 || index >= wb.getNumberOfSheets()) {
			throw new IllegalArgumentException(
					"Índice de hoja inválido: " + index + " (el libro tiene " + wb.getNumberOfSheets() + " hoja(s)).");
		}
		return wb.getSheetAt(index);
	}

	private static String displayFileName(MultipartFile file) {
		String name = file.getOriginalFilename();
		if (name == null || name.isBlank()) {
			return "archivo";
		}
		return name;
	}

	public static PendingMovementSide parseSide(String raw) {
		if (raw == null || raw.isBlank()) {
			throw new IllegalArgumentException("Parámetro side obligatorio: bank o company.");
		}
		String norm = raw.trim().toUpperCase(Locale.ROOT);
		return switch (norm) {
			case "BANK", "BANCO" -> PendingMovementSide.BANK;
			case "COMPANY", "EMPRESA", "PLATAFORMA" -> PendingMovementSide.COMPANY;
			default -> throw new IllegalArgumentException("side inválido: use bank o company.");
		};
	}
}
