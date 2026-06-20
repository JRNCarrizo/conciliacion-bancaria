package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.config.SecurityUtils;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.DeferMovementRequestDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.DeferredMovementDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.IncorporateDeferredRequestDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.IncorporateDeferredResultDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.DeferredMovement;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.DeferredMovementStatus;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PendingMovementSide;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionAuditEventType;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionStatus;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.BankTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.CompanyTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.DeferredMovementRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.PendingMovementCommentRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationPairRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;

@Service
public class ConciliacionDeferredMovementService {

	private final ReconciliationSessionRepository sessionRepository;
	private final BankTransactionRepository bankTransactionRepository;
	private final CompanyTransactionRepository companyTransactionRepository;
	private final ReconciliationPairRepository reconciliationPairRepository;
	private final DeferredMovementRepository deferredMovementRepository;
	private final PendingMovementCommentRepository pendingMovementCommentRepository;
	private final MovementAttachmentService movementAttachmentService;
	private final ConciliacionManualPairService manualPairService;
	private final SessionAuditService sessionAuditService;

	public ConciliacionDeferredMovementService(ReconciliationSessionRepository sessionRepository,
			BankTransactionRepository bankTransactionRepository,
			CompanyTransactionRepository companyTransactionRepository,
			ReconciliationPairRepository reconciliationPairRepository,
			DeferredMovementRepository deferredMovementRepository,
			PendingMovementCommentRepository pendingMovementCommentRepository,
			MovementAttachmentService movementAttachmentService,
			ConciliacionManualPairService manualPairService,
			SessionAuditService sessionAuditService) {
		this.sessionRepository = sessionRepository;
		this.bankTransactionRepository = bankTransactionRepository;
		this.companyTransactionRepository = companyTransactionRepository;
		this.reconciliationPairRepository = reconciliationPairRepository;
		this.deferredMovementRepository = deferredMovementRepository;
		this.pendingMovementCommentRepository = pendingMovementCommentRepository;
		this.movementAttachmentService = movementAttachmentService;
		this.manualPairService = manualPairService;
		this.sessionAuditService = sessionAuditService;
	}

	@Transactional(readOnly = true)
	public List<DeferredMovementDto> listAvailable() {
		return deferredMovementRepository.findByStatusOrderByExcludedAtAsc(DeferredMovementStatus.AVAILABLE).stream()
				.map(this::toDto)
				.toList();
	}

	@Transactional(readOnly = true)
	public List<DeferredMovementDto> listAvailableForSession(long sessionId) {
		requireSession(sessionId);
		return deferredMovementRepository
				.findByStatusAndSourceSession_IdNotOrderByExcludedAtAsc(DeferredMovementStatus.AVAILABLE, sessionId)
				.stream()
				.map(this::toDto)
				.toList();
	}

	@Transactional(readOnly = true)
	public long countAvailable() {
		return deferredMovementRepository.countByStatus(DeferredMovementStatus.AVAILABLE);
	}

	@Transactional(readOnly = true)
	public long countAvailableForSession(long sessionId) {
		requireSession(sessionId);
		return deferredMovementRepository.countByStatusAndSourceSession_IdNot(DeferredMovementStatus.AVAILABLE,
				sessionId);
	}

	@Transactional(readOnly = true)
	public List<DeferredMovementDto> listFromSession(long sessionId) {
		requireSession(sessionId);
		return deferredMovementRepository.findBySourceSession_IdOrderByExcludedAtDesc(sessionId).stream()
				.map(this::toDto)
				.toList();
	}

	@Transactional(readOnly = true)
	public List<DeferredMovementDto> listIntoSession(long sessionId) {
		requireSession(sessionId);
		return deferredMovementRepository.findByConsumedSession_IdOrderByConsumedAtDesc(sessionId).stream()
				.map(this::toDto)
				.toList();
	}

	@Transactional(readOnly = true)
	public Map<Long, DeferredMovementDto> incorporatedByTransactionId(long sessionId) {
		requireSession(sessionId);
		Map<Long, DeferredMovementDto> map = new HashMap<>();
		for (DeferredMovement d : deferredMovementRepository
				.findByConsumedSession_IdOrderByConsumedAtDesc(sessionId)) {
			if (d.getCreatedTransactionId() != null) {
				map.put(d.getCreatedTransactionId(), toDto(d));
			}
		}
		return map;
	}

	@Transactional
	public DeferredMovementDto defer(long sessionId, DeferMovementRequestDto req) {
		ReconciliationSession session = requireOpenSession(sessionId);
		PendingMovementSide side = parseSide(req.side());
		long txId = req.transactionId();
		DeferredMovement deferred;
		if (side == PendingMovementSide.BANK) {
			BankTransaction tx = bankTransactionRepository.findByIdAndSession_Id(txId, sessionId)
					.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movimiento de banco no encontrado"));
			ensureUnmatched(side, txId);
			deferred = snapshotFromBank(tx, session, req.note());
			deferredMovementRepository.save(deferred);
			removeBankTransaction(sessionId, txId);
		} else {
			CompanyTransaction tx = companyTransactionRepository.findByIdAndSession_Id(txId, sessionId)
					.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movimiento de empresa no encontrado"));
			ensureUnmatched(side, txId);
			deferred = snapshotFromCompany(tx, session, req.note());
			deferredMovementRepository.save(deferred);
			removeCompanyTransaction(sessionId, txId);
		}
		String sideLabel = side == PendingMovementSide.BANK ? "banco" : "empresa";
		sessionAuditService.append(sessionId, SessionAuditEventType.DEFER_MOVEMENT,
				String.format("Diferido %s · ID origen %d · diferido #%d", sideLabel, txId, deferred.getId()));
		return toDto(deferred);
	}

	@Transactional
	public IncorporateDeferredResultDto incorporate(long sessionId, IncorporateDeferredRequestDto req) {
		ReconciliationSession session = requireOpenSession(sessionId);
		if (req.deferredIds() == null || req.deferredIds().isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indicá al menos un diferido para incorporar.");
		}
		List<String> warnings = new ArrayList<>();
		List<DeferredMovementDto> incorporated = new ArrayList<>();
		int added = 0;
		for (Long deferredId : req.deferredIds()) {
			if (deferredId == null) {
				continue;
			}
			DeferredMovement d = deferredMovementRepository.findById(deferredId)
					.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
							"Diferido no encontrado: " + deferredId));
			if (d.getStatus() != DeferredMovementStatus.AVAILABLE) {
				warnings.add("Diferido #" + deferredId + " ya no está disponible.");
				continue;
			}
			if (d.getSourceSession().getId().equals(sessionId)) {
				warnings.add("Diferido #" + deferredId
						+ " fue enviado desde esta sesión; incorporalo en otra conciliación.");
				continue;
			}
			if (fingerprintExistsInSession(sessionId, d)) {
				warnings.add("Diferido #" + deferredId + " coincide con un movimiento ya importado en esta sesión.");
				continue;
			}
			long createdId = createTransactionFromDeferred(session, d);
			d.setStatus(DeferredMovementStatus.CONSUMED);
			d.setConsumedSession(session);
			d.setConsumedAt(Instant.now());
			d.setCreatedTransactionId(createdId);
			deferredMovementRepository.save(d);
			incorporated.add(toDto(d));
			added++;
		}
		if (added > 0) {
			sessionAuditService.append(sessionId, SessionAuditEventType.INCORPORATE_DEFERRED,
					"Incorporados " + added + " diferido(s)");
		}
		return new IncorporateDeferredResultDto(added, warnings, incorporated);
	}

	@Transactional
	public void restore(long deferredId) {
		DeferredMovement d = deferredMovementRepository.findByIdAndStatus(deferredId, DeferredMovementStatus.AVAILABLE)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
						"Diferido no encontrado o ya no está disponible."));
		ReconciliationSession source = d.getSourceSession();
		if (source.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La sesión origen está cerrada; no se puede restaurar el diferido.");
		}
		long sessionId = source.getId();
		if (fingerprintExistsInSession(sessionId, d)) {
			throw new ResponseStatusException(HttpStatus.CONFLICT,
					"Ya existe un movimiento con la misma huella en la sesión origen.");
		}
		if (d.getMovementSide() == PendingMovementSide.BANK) {
			BankTransaction tx = new BankTransaction();
			tx.setSession(source);
			applyDeferredToBank(tx, d);
			bankTransactionRepository.save(tx);
		} else {
			CompanyTransaction tx = new CompanyTransaction();
			tx.setSession(source);
			applyDeferredToCompany(tx, d);
			companyTransactionRepository.save(tx);
		}
		deferredMovementRepository.delete(d);
		String sideLabel = d.getMovementSide() == PendingMovementSide.BANK ? "banco" : "empresa";
		sessionAuditService.append(sessionId, SessionAuditEventType.RESTORE_DEFERRED,
				String.format("Restaurado diferido #%d (%s)", deferredId, sideLabel));
	}

	private ReconciliationSession requireSession(long sessionId) {
		return sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
	}

	private ReconciliationSession requireOpenSession(long sessionId) {
		ReconciliationSession session = requireSession(sessionId);
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La conciliación está cerrada; no se pueden modificar movimientos.");
		}
		return session;
	}

	private void ensureUnmatched(PendingMovementSide side, long txId) {
		boolean paired = side == PendingMovementSide.BANK
				? reconciliationPairRepository.existsByBankTransaction_Id(txId)
				: reconciliationPairRepository.existsByCompanyTransaction_Id(txId);
		if (paired) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Solo se pueden diferir movimientos pendientes (sin par).");
		}
	}

	private void removeBankTransaction(long sessionId, long txId) {
		manualPairService.unlinkPairForMovementSilent(sessionId, PendingMovementSide.BANK, txId);
		cleanupMovementArtifacts(sessionId, PendingMovementSide.BANK, txId);
		BankTransaction tx = bankTransactionRepository.findByIdAndSession_Id(txId, sessionId)
				.orElseThrow(() -> new IllegalStateException("Movimiento de banco no encontrado: " + txId));
		bankTransactionRepository.delete(tx);
	}

	private void removeCompanyTransaction(long sessionId, long txId) {
		manualPairService.unlinkPairForMovementSilent(sessionId, PendingMovementSide.COMPANY, txId);
		cleanupMovementArtifacts(sessionId, PendingMovementSide.COMPANY, txId);
		CompanyTransaction tx = companyTransactionRepository.findByIdAndSession_Id(txId, sessionId)
				.orElseThrow(() -> new IllegalStateException("Movimiento de empresa no encontrado: " + txId));
		companyTransactionRepository.delete(tx);
	}

	private void cleanupMovementArtifacts(long sessionId, PendingMovementSide side, long txId) {
		movementAttachmentService.deleteAllForMovement(sessionId, side, txId);
		pendingMovementCommentRepository.deleteBySession_IdAndMovementSideAndMovementId(sessionId, side, txId);
	}

	private static DeferredMovement snapshotFromBank(BankTransaction tx, ReconciliationSession session, String note) {
		DeferredMovement d = new DeferredMovement();
		d.setMovementSide(PendingMovementSide.BANK);
		d.setTxDate(tx.getTxDate());
		d.setAmount(tx.getAmount());
		d.setReference(tx.getReference());
		d.setDescription(tx.getDescription());
		d.setPendingClassification(tx.getPendingClassification());
		d.setContentFingerprint(tx.getContentFingerprint());
		d.setSourceSession(session);
		d.setSourceTransactionId(tx.getId());
		d.setExcludedBy(SecurityUtils.currentUsername());
		d.setNote(trimNote(note));
		d.setStatus(DeferredMovementStatus.AVAILABLE);
		return d;
	}

	private static DeferredMovement snapshotFromCompany(CompanyTransaction tx, ReconciliationSession session,
			String note) {
		DeferredMovement d = new DeferredMovement();
		d.setMovementSide(PendingMovementSide.COMPANY);
		d.setTxDate(tx.getTxDate());
		d.setAmount(tx.getAmount());
		d.setAccountingAmount(tx.getAccountingAmount());
		d.setReference(tx.getReference());
		d.setDescription(tx.getDescription());
		d.setPendingClassification(tx.getPendingClassification());
		d.setContentFingerprint(tx.getContentFingerprint());
		d.setSourceSession(session);
		d.setSourceTransactionId(tx.getId());
		d.setExcludedBy(SecurityUtils.currentUsername());
		d.setNote(trimNote(note));
		d.setStatus(DeferredMovementStatus.AVAILABLE);
		return d;
	}

	private long createTransactionFromDeferred(ReconciliationSession session, DeferredMovement d) {
		if (d.getMovementSide() == PendingMovementSide.BANK) {
			BankTransaction tx = new BankTransaction();
			tx.setSession(session);
			applyDeferredToBank(tx, d);
			bankTransactionRepository.save(tx);
			return tx.getId();
		}
		CompanyTransaction tx = new CompanyTransaction();
		tx.setSession(session);
		applyDeferredToCompany(tx, d);
		companyTransactionRepository.save(tx);
		return tx.getId();
	}

	private static void applyDeferredToBank(BankTransaction tx, DeferredMovement d) {
		tx.setTxDate(d.getTxDate());
		tx.setAmount(d.getAmount());
		tx.setReference(d.getReference());
		tx.setDescription(d.getDescription());
		tx.setPendingClassification(d.getPendingClassification());
		tx.setContentFingerprint(d.getContentFingerprint());
	}

	private static void applyDeferredToCompany(CompanyTransaction tx, DeferredMovement d) {
		tx.setTxDate(d.getTxDate());
		tx.setAmount(d.getAmount());
		tx.setAccountingAmount(d.getAccountingAmount());
		tx.setReference(d.getReference());
		tx.setDescription(d.getDescription());
		tx.setPendingClassification(d.getPendingClassification());
		tx.setContentFingerprint(d.getContentFingerprint());
	}

	private boolean fingerprintExistsInSession(long sessionId, DeferredMovement d) {
		String fp = d.getContentFingerprint();
		if (fp == null || fp.isBlank()) {
			return false;
		}
		return d.getMovementSide() == PendingMovementSide.BANK
				? bankTransactionRepository.existsBySession_IdAndContentFingerprint(sessionId, fp)
				: companyTransactionRepository.existsBySession_IdAndContentFingerprint(sessionId, fp);
	}

	private static PendingMovementSide parseSide(String side) {
		if (side == null) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indicá el lado (bank o company).");
		}
		return switch (side.trim().toLowerCase(Locale.ROOT)) {
			case "bank", "banco" -> PendingMovementSide.BANK;
			case "company", "empresa" -> PendingMovementSide.COMPANY;
			default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lado inválido: " + side);
		};
	}

	private static String trimNote(String note) {
		if (note == null) {
			return null;
		}
		String t = note.trim();
		return t.isEmpty() ? null : t;
	}

	private DeferredMovementDto toDto(DeferredMovement d) {
		ReconciliationSession source = d.getSourceSession();
		String label = sessionLabel(source);
		ReconciliationSession consumed = d.getConsumedSession();
		Long consumedSessionId = consumed != null ? consumed.getId() : null;
		String consumedLabel = consumed != null ? sessionLabel(consumed) : null;
		return new DeferredMovementDto(d.getId(),
				d.getMovementSide() == PendingMovementSide.BANK ? "bank" : "company",
				d.getTxDate(),
				d.getAmount(),
				d.getAccountingAmount(),
				d.getReference(),
				d.getDescription(),
				d.getPendingClassification(),
				source.getId(),
				label,
				d.getSourceTransactionId(),
				d.getExcludedAt(),
				d.getExcludedBy(),
				d.getNote(),
				d.getStatus().name(),
				consumedSessionId,
				d.getCreatedTransactionId(),
				sideFileName(source, d.getMovementSide()),
				consumedLabel);
	}

	private static String sideFileName(ReconciliationSession session, PendingMovementSide side) {
		String name = side == PendingMovementSide.BANK ? session.getSourceBankFileName()
				: session.getSourceCompanyFileName();
		if (name == null || name.isBlank()) {
			return null;
		}
		return name.trim();
	}

	private static String sessionLabel(ReconciliationSession s) {
		if (s.getDisplayName() != null && !s.getDisplayName().isBlank()) {
			return s.getDisplayName().trim();
		}
		return "Sesión #" + s.getId();
	}
}
