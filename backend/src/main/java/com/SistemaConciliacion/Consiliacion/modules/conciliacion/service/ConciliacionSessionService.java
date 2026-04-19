package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ClassificationUpdateDto;
import com.SistemaConciliacion.Consiliacion.config.SecurityUtils;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.CommentCreateDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ConciliacionStatsDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.MovimientoDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.PendingCommentDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ParDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionBalancesDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionDetailDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionHeaderDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionSummaryDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PendingMovementComment;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PendingMovementSide;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationPair;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationPairComment;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionAuditEventType;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionStatus;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.BankTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.CompanyTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.MovementAttachmentRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.PairAttachmentRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.PendingMovementCommentRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationPairCommentRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationPairRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;

@Service
public class ConciliacionSessionService {

	private static final BigDecimal EPS = new BigDecimal("0.02");

	private final ReconciliationSessionRepository sessionRepository;
	private final BankTransactionRepository bankTransactionRepository;
	private final CompanyTransactionRepository companyTransactionRepository;
	private final ReconciliationPairRepository reconciliationPairRepository;
	private final PendingMovementCommentRepository pendingMovementCommentRepository;
	private final MovementAttachmentRepository movementAttachmentRepository;
	private final PairAttachmentRepository pairAttachmentRepository;
	private final ReconciliationPairCommentRepository reconciliationPairCommentRepository;
	private final SessionAuditService sessionAuditService;

	public ConciliacionSessionService(ReconciliationSessionRepository sessionRepository,
			BankTransactionRepository bankTransactionRepository,
			CompanyTransactionRepository companyTransactionRepository,
			ReconciliationPairRepository reconciliationPairRepository,
			PendingMovementCommentRepository pendingMovementCommentRepository,
			MovementAttachmentRepository movementAttachmentRepository,
			PairAttachmentRepository pairAttachmentRepository,
			ReconciliationPairCommentRepository reconciliationPairCommentRepository,
			SessionAuditService sessionAuditService) {
		this.sessionRepository = sessionRepository;
		this.bankTransactionRepository = bankTransactionRepository;
		this.companyTransactionRepository = companyTransactionRepository;
		this.reconciliationPairRepository = reconciliationPairRepository;
		this.pendingMovementCommentRepository = pendingMovementCommentRepository;
		this.movementAttachmentRepository = movementAttachmentRepository;
		this.pairAttachmentRepository = pairAttachmentRepository;
		this.reconciliationPairCommentRepository = reconciliationPairCommentRepository;
		this.sessionAuditService = sessionAuditService;
	}

	@Transactional(readOnly = true)
	public Page<SessionSummaryDto> listSessions(Pageable pageable) {
		return sessionRepository.findAllByOrderByCreatedAtDesc(pageable).map(this::toSummary);
	}

	private SessionSummaryDto toSummary(ReconciliationSession s) {
		long bid = s.getId();
		long bankCount = bankTransactionRepository.countBySession_Id(bid);
		long companyCount = companyTransactionRepository.countBySession_Id(bid);
		long matched = reconciliationPairRepository.countBySession_Id(bid);
		return new SessionSummaryDto(bid, s.getCreatedAt(), s.getSourceBankFileName(), s.getSourceCompanyFileName(),
				s.getStatus().name(), bankCount, companyCount, matched);
	}

	@Transactional(readOnly = true)
	public SessionDetailDto getSessionDetail(long sessionId) {
		return getSessionDetail(sessionId, false);
	}

	@Transactional(readOnly = true)
	public SessionDetailDto getSessionDetail(long sessionId, boolean recordAccess) {
		ReconciliationSession s = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		List<BankTransaction> banks = bankTransactionRepository.findBySession_IdOrderByTxDateAscIdAsc(sessionId);
		List<CompanyTransaction> companies = companyTransactionRepository
				.findBySession_IdOrderByTxDateAscIdAsc(sessionId);
		List<ReconciliationPair> pairs = reconciliationPairRepository.findAllWithPartiesBySessionId(sessionId);

		Set<Long> matchedBankIds = new HashSet<>();
		Set<Long> matchedCompanyIds = new HashSet<>();
		for (ReconciliationPair p : pairs) {
			matchedBankIds.add(p.getBankTransaction().getId());
			matchedCompanyIds.add(p.getCompanyTransaction().getId());
		}

		Set<Long> duplicateBankIds = duplicateIdsBank(banks);
		Set<Long> duplicateCompanyIds = duplicateIdsCompany(companies);

		Map<Long, String> classificationByMatchedBankTxId = new HashMap<>();
		Map<Long, String> classificationByMatchedCompanyTxId = new HashMap<>();
		for (ReconciliationPair p : pairs) {
			String cl = p.getClassification();
			classificationByMatchedBankTxId.put(p.getBankTransaction().getId(), cl);
			classificationByMatchedCompanyTxId.put(p.getCompanyTransaction().getId(), cl);
		}

		List<BankTransaction> unmatchedBankEntities = banks.stream().filter(t -> !matchedBankIds.contains(t.getId()))
				.toList();
		List<CompanyTransaction> unmatchedCompanyEntities = companies.stream()
				.filter(t -> !matchedCompanyIds.contains(t.getId())).toList();

		Map<Long, Long> fuzzyBankToCompany = computeFuzzyCandidatesBankToCompany(unmatchedBankEntities,
				unmatchedCompanyEntities);
		Map<Long, Long> fuzzyCompanyToBank = invertFuzzyMap(fuzzyBankToCompany);

		Map<String, Long> commentCounts = commentCountMap(sessionId);
		Map<String, Long> attachmentCounts = attachmentCountMap(sessionId);
		Map<Long, Long> pairAttachmentCounts = pairAttachmentCountMap(sessionId);
		Map<Long, Long> pairCommentCounts = pairCommentCountMap(sessionId);

		List<MovimientoDto> bankDtos = banks.stream()
				.map(t -> toBankMov(t, duplicateBankIds.contains(t.getId()), null, null,
						commentCounts.getOrDefault(commentKey(PendingMovementSide.BANK, t.getId()), 0L),
						attachmentCounts.getOrDefault(commentKey(PendingMovementSide.BANK, t.getId()), 0L),
						classificationDisplayForBank(t, classificationByMatchedBankTxId)))
				.toList();
		List<MovimientoDto> companyDtos = companies.stream()
				.map(c -> toCompanyMov(c, duplicateCompanyIds.contains(c.getId()), null, null,
						commentCounts.getOrDefault(commentKey(PendingMovementSide.COMPANY, c.getId()), 0L),
						attachmentCounts.getOrDefault(commentKey(PendingMovementSide.COMPANY, c.getId()), 0L),
						classificationDisplayForCompany(c, classificationByMatchedCompanyTxId)))
				.toList();
		List<MovimientoDto> unmatchedBank = unmatchedBankEntities.stream()
				.map(t -> toBankMov(t, duplicateBankIds.contains(t.getId()), fuzzyBankToCompany.get(t.getId()),
						fuzzyBankToCompany.containsKey(t.getId())
								? fuzzyHint("empresa", fuzzyBankToCompany.get(t.getId()))
								: null,
						commentCounts.getOrDefault(commentKey(PendingMovementSide.BANK, t.getId()), 0L),
						attachmentCounts.getOrDefault(commentKey(PendingMovementSide.BANK, t.getId()), 0L),
						classificationDisplayForBank(t, classificationByMatchedBankTxId)))
				.toList();
		List<MovimientoDto> unmatchedCompany = unmatchedCompanyEntities.stream()
				.map(c -> toCompanyMov(c, duplicateCompanyIds.contains(c.getId()), fuzzyCompanyToBank.get(c.getId()),
						fuzzyCompanyToBank.containsKey(c.getId())
								? fuzzyHint("banco", fuzzyCompanyToBank.get(c.getId()))
								: null,
						commentCounts.getOrDefault(commentKey(PendingMovementSide.COMPANY, c.getId()), 0L),
						attachmentCounts.getOrDefault(commentKey(PendingMovementSide.COMPANY, c.getId()), 0L),
						classificationDisplayForCompany(c, classificationByMatchedCompanyTxId)))
				.toList();
		BigDecimal gapThreshold = amountGapClassificationThreshold(s);
		List<ParDto> parDtos = pairs.stream()
				.map((ReconciliationPair p) -> toPar(p, gapThreshold,
						pairAttachmentCounts.getOrDefault(p.getId(), 0L),
						pairCommentCounts.getOrDefault(p.getId(), 0L)))
				.toList();

		ConciliacionStatsDto stats = buildStats(s, banks, companies, pairs, matchedBankIds, matchedCompanyIds,
				gapThreshold);

		if (recordAccess) {
			sessionAuditService.recordDetailAccess(sessionId);
		}

		return new SessionDetailDto(toHeader(s), bankDtos, companyDtos, unmatchedBank, unmatchedCompany, parDtos,
				stats);
	}

	@Transactional
	public SessionHeaderDto closeSession(long sessionId) {
		ReconciliationSession s = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (s.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La sesión ya está cerrada.");
		}
		s.setStatus(SessionStatus.CLOSED);
		sessionRepository.save(s);
		sessionAuditService.append(sessionId, SessionAuditEventType.CLOSE_SESSION, null);
		return toHeader(s);
	}

	@Transactional
	public SessionHeaderDto putBalances(long sessionId, SessionBalancesDto dto) {
		ReconciliationSession s = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (s.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La sesión está cerrada; los saldos no se pueden modificar.");
		}
		s.setOpeningBankBalance(dto.openingBankBalance());
		s.setClosingBankBalance(dto.closingBankBalance());
		s.setOpeningCompanyBalance(dto.openingCompanyBalance());
		s.setClosingCompanyBalance(dto.closingCompanyBalance());
		sessionRepository.save(s);
		sessionAuditService.append(sessionId, SessionAuditEventType.SAVE_BALANCES, null);
		return toHeader(s);
	}

	@Transactional
	public void putBankClassification(long sessionId, long bankTxId, ClassificationUpdateDto body) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La sesión está cerrada; la clasificación no se puede modificar.");
		}
		if (reconciliationPairRepository.existsByBankTransaction_Id(bankTxId)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Este movimiento está en un par conciliado; la clasificación es una sola por fila (usá el par).");
		}
		BankTransaction t = bankTransactionRepository.findByIdAndSession_Id(bankTxId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movimiento no encontrado"));
		t.setPendingClassification(normalizeClassification(body != null ? body.classification() : null));
		bankTransactionRepository.save(t);
	}

	@Transactional
	public void putCompanyClassification(long sessionId, long companyTxId, ClassificationUpdateDto body) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La sesión está cerrada; la clasificación no se puede modificar.");
		}
		if (reconciliationPairRepository.existsByCompanyTransaction_Id(companyTxId)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Este movimiento está en un par conciliado; la clasificación es una sola por fila (usá el par).");
		}
		CompanyTransaction t = companyTransactionRepository.findByIdAndSession_Id(companyTxId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movimiento no encontrado"));
		t.setPendingClassification(normalizeClassification(body != null ? body.classification() : null));
		companyTransactionRepository.save(t);
	}

	@Transactional
	public void putPairClassification(long sessionId, long pairId, ClassificationUpdateDto body) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La sesión está cerrada; la clasificación no se puede modificar.");
		}
		ReconciliationPair pair = reconciliationPairRepository.findByIdAndSession_Id(pairId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Par no encontrado"));
		pair.setClassification(normalizeClassification(body != null ? body.classification() : null));
		reconciliationPairRepository.save(pair);
	}

	@Transactional(readOnly = true)
	public List<PendingCommentDto> listPendingComments(long sessionId, PendingMovementSide side, long txId) {
		sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		return pendingMovementCommentRepository
				.findBySession_IdAndMovementSideAndMovementIdOrderByCreatedAtAsc(sessionId, side, txId).stream()
				.map(c -> new PendingCommentDto(c.getId(), c.getBody(), c.getCreatedAt(), c.getCreatedByUsername()))
				.toList();
	}

	@Transactional
	public PendingCommentDto addPendingComment(long sessionId, PendingMovementSide side, long txId,
			CommentCreateDto dto) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La sesión está cerrada; no se pueden agregar comentarios.");
		}
		String text = dto == null || dto.text() == null ? "" : dto.text().trim();
		if (text.isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El comentario no puede estar vacío.");
		}
		if (text.length() > 4000) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El comentario supera los 4000 caracteres.");
		}
		if (side == PendingMovementSide.BANK) {
			bankTransactionRepository.findByIdAndSession_Id(txId, sessionId).orElseThrow(
					() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movimiento no encontrado"));
		} else {
			companyTransactionRepository.findByIdAndSession_Id(txId, sessionId).orElseThrow(
					() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movimiento no encontrado"));
		}
		PendingMovementComment c = new PendingMovementComment();
		c.setSession(session);
		c.setMovementSide(side);
		c.setMovementId(txId);
		c.setBody(text);
		c.setCreatedAt(Instant.now());
		c.setCreatedByUsername(SecurityUtils.currentUsername());
		pendingMovementCommentRepository.save(c);
		return new PendingCommentDto(c.getId(), c.getBody(), c.getCreatedAt(), c.getCreatedByUsername());
	}

	@Transactional(readOnly = true)
	public List<PendingCommentDto> listPairComments(long sessionId, long pairId) {
		sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		reconciliationPairRepository.findByIdAndSession_Id(pairId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Par no encontrado"));
		return reconciliationPairCommentRepository.findBySession_IdAndPair_IdOrderByCreatedAtAsc(sessionId, pairId)
				.stream()
				.map(c -> new PendingCommentDto(c.getId(), c.getBody(), c.getCreatedAt(), c.getCreatedByUsername()))
				.toList();
	}

	@Transactional
	public PendingCommentDto addPairComment(long sessionId, long pairId, CommentCreateDto dto) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La sesión está cerrada; no se pueden agregar comentarios.");
		}
		ReconciliationPair pair = reconciliationPairRepository.findByIdAndSession_Id(pairId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Par no encontrado"));
		String text = dto == null || dto.text() == null ? "" : dto.text().trim();
		if (text.isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El comentario no puede estar vacío.");
		}
		if (text.length() > 4000) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El comentario supera los 4000 caracteres.");
		}
		ReconciliationPairComment c = new ReconciliationPairComment();
		c.setSession(session);
		c.setPair(pair);
		c.setBody(text);
		c.setCreatedAt(Instant.now());
		c.setCreatedByUsername(SecurityUtils.currentUsername());
		reconciliationPairCommentRepository.save(c);
		return new PendingCommentDto(c.getId(), c.getBody(), c.getCreatedAt(), c.getCreatedByUsername());
	}

	private static final int MAX_CLASSIFICATION_LEN = 128;

	private static String normalizeClassification(String raw) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		String t = raw.trim();
		if (t.length() > MAX_CLASSIFICATION_LEN) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La clasificación supera los " + MAX_CLASSIFICATION_LEN + " caracteres.");
		}
		return t;
	}

	private SessionHeaderDto toHeader(ReconciliationSession s) {
		return new SessionHeaderDto(s.getId(), s.getCreatedAt(), s.getSourceBankFileName(),
				s.getSourceCompanyFileName(), s.getStatus().name(), s.getOpeningBankBalance(), s.getClosingBankBalance(),
				s.getOpeningCompanyBalance(), s.getClosingCompanyBalance(), s.getAmountTolerance(),
				s.getDateToleranceDays());
	}

	/**
	 * Umbral para EXACT vs AMOUNT_GAP: coincide con la última tolerancia de conciliación automática; si aún no
	 * hubo conciliación, EPS (0,02) como hasta ahora.
	 */
	private BigDecimal amountGapClassificationThreshold(ReconciliationSession s) {
		BigDecimal t = s.getAmountTolerance();
		if (t == null) {
			return EPS;
		}
		return t.setScale(4, RoundingMode.HALF_UP);
	}

	private ConciliacionStatsDto buildStats(ReconciliationSession session, List<BankTransaction> banks,
			List<CompanyTransaction> companies, List<ReconciliationPair> pairs, Set<Long> matchedBankIds,
			Set<Long> matchedCompanyIds, BigDecimal amountGapThreshold) {
		long bankRowCount = banks.size();
		long companyRowCount = companies.size();
		long matchedPairs = pairs.size();
		long unmatchedBankCount = bankRowCount - matchedPairs;
		long unmatchedCompanyCount = companyRowCount - matchedPairs;

		BigDecimal sumBank = sumBankAmounts(banks);
		BigDecimal sumCompany = sumCompanyAmounts(companies);
		BigDecimal sumCompanyAccounting = sumCompanyAccountingAmounts(companies);
		BigDecimal differenceTotal = sumBank.subtract(sumCompany);

		BigDecimal sumReconciledBank = pairs.stream().map(p -> p.getBankTransaction().getAmount())
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		BigDecimal sumReconciledCompany = pairs.stream().map(p -> p.getCompanyTransaction().getAmount())
				.reduce(BigDecimal.ZERO, BigDecimal::add);

		BigDecimal sumPendingBank = banks.stream().filter(t -> !matchedBankIds.contains(t.getId()))
				.map(BankTransaction::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
		BigDecimal sumPendingCompany = companies.stream().filter(t -> !matchedCompanyIds.contains(t.getId()))
				.map(CompanyTransaction::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

		BigDecimal pctRowsBank = rowReconciliationPct(bankRowCount, unmatchedBankCount);
		BigDecimal pctRowsCompany = rowReconciliationPct(companyRowCount, unmatchedCompanyCount);

		BigDecimal reconciledPairDelta = sumReconciledBank.subtract(sumReconciledCompany);
		BigDecimal pendingNetDifference = sumPendingBank.subtract(sumPendingCompany);
		long pairsExactAmountCount = 0;
		long pairsWithAmountGapCount = 0;
		long pairsOppositeSignCount = 0;
		for (ReconciliationPair p : pairs) {
			BigDecimal ba = p.getBankTransaction().getAmount();
			BigDecimal ca = p.getCompanyTransaction().getAmount();
			BigDecimal gap = ba.subtract(ca).abs();
			if (gap.compareTo(amountGapThreshold) <= 0) {
				pairsExactAmountCount++;
			} else {
				pairsWithAmountGapCount++;
			}
			if (ba.signum() != 0 && ca.signum() != 0 && ba.signum() != ca.signum()) {
				pairsOppositeSignCount++;
			}
		}
		// El Δ neto en pares puede ser ~0 aunque haya brechas que se compensan; el estado del reporte debe
		// reflejar también «al menos un par con |banco−empresa| por encima del umbral de la sesión».
		boolean pairAmountMismatch = reconciledPairDelta.abs().compareTo(EPS) >= 0
				|| pairsWithAmountGapCount > 0;
		BigDecimal recomposed = reconciledPairDelta.add(pendingNetDifference);
		boolean differenceDecompositionOk = differenceTotal.subtract(recomposed).abs().compareTo(EPS) < 0;

		BigDecimal closingBank = session.getClosingBankBalance();
		BigDecimal closingCompany = session.getClosingCompanyBalance();
		BigDecimal adjustedBalanceFromBank = null;
		BigDecimal adjustedVsCompanyClosing = null;
		boolean closingBalancesForCrossCheck = false;
		if (closingBank != null) {
			adjustedBalanceFromBank = closingBank.add(sumPendingCompany).subtract(sumPendingBank);
		}
		if (adjustedBalanceFromBank != null && closingCompany != null) {
			adjustedVsCompanyClosing = adjustedBalanceFromBank.subtract(closingCompany);
			closingBalancesForCrossCheck = true;
		}
		boolean auditCierreCuadrado = closingBalancesForCrossCheck && adjustedVsCompanyClosing != null
				&& adjustedVsCompanyClosing.abs().compareTo(EPS) < 0;

		StatusPick st = resolveReportStatus(differenceDecompositionOk, pairsOppositeSignCount, pairAmountMismatch,
				unmatchedBankCount, unmatchedCompanyCount, differenceTotal, adjustedVsCompanyClosing, auditCierreCuadrado);

		List<String> explanation = buildDifferenceExplanation(differenceTotal, reconciledPairDelta, pendingNetDifference,
				unmatchedBankCount, unmatchedCompanyCount, pairAmountMismatch, differenceDecompositionOk,
				adjustedBalanceFromBank, adjustedVsCompanyClosing, closingBank, closingCompany, sumCompanyAccounting,
				pairsExactAmountCount, pairsWithAmountGapCount, pairsOppositeSignCount, auditCierreCuadrado);

		return new ConciliacionStatsDto(bankRowCount, companyRowCount, matchedPairs, unmatchedBankCount,
				unmatchedCompanyCount, sumBank, sumCompany, differenceTotal, sumReconciledBank, sumReconciledCompany,
				sumPendingBank, sumPendingCompany, pctRowsBank, pctRowsCompany, reconciledPairDelta, pendingNetDifference,
				pairAmountMismatch, differenceDecompositionOk, st.code(), st.detail(), explanation, adjustedBalanceFromBank,
				adjustedVsCompanyClosing, closingBalancesForCrossCheck, sumCompanyAccounting, pairsExactAmountCount,
				pairsWithAmountGapCount, pairsOppositeSignCount, auditCierreCuadrado);
	}

	private record StatusPick(String code, String detail) {
	}

	private static StatusPick resolveReportStatus(boolean decompositionOk, long pairsOppositeSignCount,
			boolean pairMismatch, long unBank, long unCompany, BigDecimal differenceTotal,
			BigDecimal adjustedVsCompanyClosing, boolean auditCierreCuadrado) {
		if (!decompositionOk) {
			return new StatusPick("STRUCTURAL_ERROR",
					"La diferencia total no cuadra con pares + pendientes (posible error interno o datos corruptos).");
		}
		if (pairsOppositeSignCount > 0) {
			return new StatusPick("PAIR_SIGN_MISMATCH",
					"Hay pares con importes de signo opuesto; no es un emparejamiento válido para conciliación.");
		}
		if (pairMismatch) {
			return new StatusPick("PAIR_AMOUNT_MISMATCH",
					"Hay pares donde el importe banco y el de empresa no coinciden.");
		}
		if (adjustedVsCompanyClosing != null && adjustedVsCompanyClosing.abs().compareTo(EPS) >= 0) {
			return new StatusPick("BALANCE_CROSS_CHECK_FAIL",
					"Saldo ajustado desde extracto (y pendientes) no coincide con el saldo final empresa declarado.");
		}
		if (unBank > 0 || unCompany > 0) {
			return new StatusPick("PENDING_DIFFERENCES", "Quedan movimientos sin emparejar.");
		}
		if (differenceTotal.abs().compareTo(EPS) >= 0) {
			return new StatusPick("PENDING_DIFFERENCES", "Las sumas de importes de los archivos no coinciden.");
		}
		if (auditCierreCuadrado) {
			return new StatusPick("OK",
					"Sin pendientes y sumas alineadas. Cierre auditado: saldos finales extracto y libro conformes.");
		}
		return new StatusPick("OK", "Sin pendientes y sumas de importes alineadas.");
	}

	/**
	 * Importes en textos de explicación / export: 2 decimales (alineado al resumen ejecutivo en pantalla).
	 */
	private static String fmtAmount(BigDecimal v) {
		return v.setScale(2, RoundingMode.HALF_UP).toPlainString();
	}

	private static List<String> buildDifferenceExplanation(BigDecimal differenceTotal, BigDecimal reconciledPairDelta,
			BigDecimal pendingNetDifference, long unmatchedBankCount, long unmatchedCompanyCount, boolean pairMismatch,
			boolean decompositionOk, BigDecimal adjustedBalanceFromBank, BigDecimal adjustedVsCompanyClosing,
			BigDecimal closingBank, BigDecimal closingCompany, BigDecimal sumCompanyAccounting,
			long pairsExact, long pairsGap, long pairsOppSign, boolean auditCierreCuadrado) {
		List<String> lines = new ArrayList<>();
		lines.add("Diferencia total (Σ banco − Σ empresa conciliación en el período importado): "
				+ fmtAmount(differenceTotal));
		lines.add("Σ neto contable plataforma (haber − debe por línea, solo libro): " + fmtAmount(sumCompanyAccounting));
		lines.add("Pares: importes idénticos (±tolerancia): " + pairsExact + " · con brecha de importe: " + pairsGap
				+ " · signo opuesto banco/empresa: " + pairsOppSign);
		lines.add("Δ en pares conciliados (Σ banco − Σ empresa en importes de conciliación): "
				+ fmtAmount(reconciledPairDelta));
		lines.add("Efecto neto pendientes (Σ pend. banco − Σ pend. empresa): " + fmtAmount(pendingNetDifference));
		lines.add("Cantidad de pendientes: " + unmatchedBankCount + " en extracto, " + unmatchedCompanyCount
				+ " en plataforma.");
		if (!decompositionOk) {
			lines.add("Validación: la suma Δ pares + efecto pendientes no reproduce la diferencia total (revisar).");
		} else {
			lines.add("Validación algebraica: diferencia total = Δ pares + efecto pendientes (tolerancia redondeo).");
		}
		if (pairsOppSign > 0) {
			lines.add("Crítico: hay pares con signo opuesto; la conciliación exige mismo signo e igual magnitud.");
		}
		if (pairMismatch) {
			lines.add("Atención: Δ neto en pares distinto de cero o brechas de importe entre banco y empresa.");
		}
		if (closingBank != null) {
			lines.add("Saldo final extracto declarado: " + fmtAmount(closingBank)
					+ " → saldo ajustado (extracto + Σ pend. empresa − Σ pend. banco): "
					+ (adjustedBalanceFromBank != null ? fmtAmount(adjustedBalanceFromBank) : "—"));
		} else {
			lines.add("Saldo final extracto no cargado: indicá saldos abajo para el ajuste contable.");
		}
		if (closingCompany != null && adjustedVsCompanyClosing != null) {
			lines.add("Saldo final empresa declarado: " + fmtAmount(closingCompany) + " → diferencia vs saldo ajustado: "
					+ fmtAmount(adjustedVsCompanyClosing));
		}
		if (auditCierreCuadrado) {
			lines.add(
					"Auditoría: cierre conforme — saldo final extracto + ajuste por pendientes = saldo final libro (±tolerancia).");
		} else if (closingBank != null && closingCompany != null && adjustedVsCompanyClosing != null) {
			lines.add("Auditoría: revisar el puente entre saldo final extracto y saldo final empresa declarado.");
		} else if (closingBank == null || closingCompany == null) {
			lines.add(
					"Auditoría: declará saldo final banco y saldo final empresa para cerrar el circuito extracto ↔ libro.");
		}
		return List.copyOf(lines);
	}

	private static BigDecimal sumBankAmounts(List<BankTransaction> banks) {
		return banks.stream().map(BankTransaction::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	private static BigDecimal sumCompanyAmounts(List<CompanyTransaction> companies) {
		return companies.stream().map(CompanyTransaction::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	private static BigDecimal sumCompanyAccountingAmounts(List<CompanyTransaction> companies) {
		return companies.stream().map(ConciliacionSessionService::accountingOrFallback).reduce(BigDecimal.ZERO,
				BigDecimal::add);
	}

	private static BigDecimal accountingOrFallback(CompanyTransaction t) {
		if (t.getAccountingAmount() != null) {
			return t.getAccountingAmount();
		}
		return t.getAmount().negate();
	}

	private static BigDecimal rowReconciliationPct(long totalRows, long unmatchedRows) {
		if (totalRows <= 0) {
			return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
		}
		long reconciled = totalRows - unmatchedRows;
		return BigDecimal.valueOf(reconciled).multiply(BigDecimal.valueOf(100)).divide(BigDecimal.valueOf(totalRows),
				2, RoundingMode.HALF_UP);
	}

	private static String classificationDisplayForBank(BankTransaction t,
			Map<Long, String> classificationByMatchedTxId) {
		if (classificationByMatchedTxId.containsKey(t.getId())) {
			return classificationByMatchedTxId.get(t.getId());
		}
		return t.getPendingClassification();
	}

	private static String classificationDisplayForCompany(CompanyTransaction t,
			Map<Long, String> classificationByMatchedTxId) {
		if (classificationByMatchedTxId.containsKey(t.getId())) {
			return classificationByMatchedTxId.get(t.getId());
		}
		return t.getPendingClassification();
	}

	private MovimientoDto toBankMov(BankTransaction t, boolean duplicateInFile, Long fuzzyCounterpartId,
			String fuzzyHint, long commentCount, long attachmentCount, String pendingClassification) {
		return new MovimientoDto(t.getId(), t.getTxDate(), t.getAmount(), t.getDescription(), t.getReference(),
				pendingClassification, null, duplicateInFile, fuzzyCounterpartId, fuzzyHint,
				commentCount, attachmentCount);
	}

	private MovimientoDto toCompanyMov(CompanyTransaction t, boolean duplicateInFile, Long fuzzyCounterpartId,
			String fuzzyHint, long commentCount, long attachmentCount, String pendingClassification) {
		return new MovimientoDto(t.getId(), t.getTxDate(), t.getAmount(), t.getDescription(), t.getReference(),
				pendingClassification, t.getAccountingAmount(), duplicateInFile,
				fuzzyCounterpartId, fuzzyHint, commentCount, attachmentCount);
	}

	private static String commentKey(PendingMovementSide side, long movementId) {
		return side.name() + "-" + movementId;
	}

	private Map<String, Long> commentCountMap(long sessionId) {
		Map<String, Long> m = new HashMap<>();
		for (Object[] row : pendingMovementCommentRepository.countByMovementGrouped(sessionId)) {
			PendingMovementSide side = (PendingMovementSide) row[0];
			long mid = ((Number) row[1]).longValue();
			long cnt = ((Number) row[2]).longValue();
			m.put(commentKey(side, mid), cnt);
		}
		return m;
	}

	private Map<String, Long> attachmentCountMap(long sessionId) {
		Map<String, Long> m = new HashMap<>();
		for (Object[] row : movementAttachmentRepository.countByMovementGrouped(sessionId)) {
			PendingMovementSide side = (PendingMovementSide) row[0];
			long mid = ((Number) row[1]).longValue();
			long cnt = ((Number) row[2]).longValue();
			m.put(commentKey(side, mid), cnt);
		}
		return m;
	}

	private Map<Long, Long> pairAttachmentCountMap(long sessionId) {
		Map<Long, Long> m = new HashMap<>();
		for (Object[] row : pairAttachmentRepository.countByPairGrouped(sessionId)) {
			long pairId = ((Number) row[0]).longValue();
			long cnt = ((Number) row[1]).longValue();
			m.put(pairId, cnt);
		}
		return m;
	}

	private Map<Long, Long> pairCommentCountMap(long sessionId) {
		Map<Long, Long> m = new HashMap<>();
		for (Object[] row : reconciliationPairCommentRepository.countByPairGrouped(sessionId)) {
			long pairId = ((Number) row[0]).longValue();
			long cnt = ((Number) row[1]).longValue();
			m.put(pairId, cnt);
		}
		return m;
	}

	private static String fuzzyHint(String lado, long otherId) {
		return "Posible match · revisar " + lado + " ID " + otherId;
	}

	private static Set<Long> duplicateIdsBank(List<BankTransaction> banks) {
		Map<String, List<BankTransaction>> g = new HashMap<>();
		for (BankTransaction t : banks) {
			String k = t.getTxDate().toString() + "|" + t.getAmount().stripTrailingZeros().toPlainString();
			g.computeIfAbsent(k, x -> new ArrayList<>()).add(t);
		}
		Set<Long> out = new HashSet<>();
		for (List<BankTransaction> grp : g.values()) {
			if (grp.size() > 1) {
				for (BankTransaction t : grp) {
					out.add(t.getId());
				}
			}
		}
		return out;
	}

	private static Set<Long> duplicateIdsCompany(List<CompanyTransaction> companies) {
		Map<String, List<CompanyTransaction>> g = new HashMap<>();
		for (CompanyTransaction t : companies) {
			String k = t.getTxDate().toString() + "|" + t.getAmount().stripTrailingZeros().toPlainString();
			g.computeIfAbsent(k, x -> new ArrayList<>()).add(t);
		}
		Set<Long> out = new HashSet<>();
		for (List<CompanyTransaction> grp : g.values()) {
			if (grp.size() > 1) {
				for (CompanyTransaction t : grp) {
					out.add(t.getId());
				}
			}
		}
		return out;
	}

	/**
	 * Pendientes con importe cercano y fecha en ventana (no emparejados por la corrida automática).
	 * Tolerancia: max(8% del |importe banco|, 100) — sin tope fijo grande, para no sugerir pares con
	 * montos muy distintos (p. ej. −999 vs −5000); el % cubre importes altos.
	 */
	private static Map<Long, Long> computeFuzzyCandidatesBankToCompany(List<BankTransaction> unmatchedBanks,
			List<CompanyTransaction> unmatchedCompanies) {
		Map<Long, Long> out = new HashMap<>();
		if (unmatchedBanks.isEmpty() || unmatchedCompanies.isEmpty()) {
			return out;
		}
		BigDecimal maxPct = new BigDecimal("0.08");
		BigDecimal minRounding = new BigDecimal("100");
		int maxDays = 10;
		for (BankTransaction b : unmatchedBanks) {
			CompanyTransaction best = null;
			BigDecimal bestDiff = null;
			for (CompanyTransaction c : unmatchedCompanies) {
				long days = Math.abs(ChronoUnit.DAYS.between(b.getTxDate(), c.getTxDate()));
				if (days > maxDays) {
					continue;
				}
				BigDecimal diff = b.getAmount().subtract(c.getAmount()).abs();
				BigDecimal ceiling = b.getAmount().abs().multiply(maxPct).max(minRounding);
				if (diff.compareTo(ceiling) > 0) {
					continue;
				}
				if (best == null || diff.compareTo(bestDiff) < 0) {
					best = c;
					bestDiff = diff;
				}
			}
			if (best != null) {
				out.put(b.getId(), best.getId());
			}
		}
		return out;
	}

	private static Map<Long, Long> invertFuzzyMap(Map<Long, Long> bankToCompany) {
		Map<Long, Long> companyToBank = new HashMap<>();
		for (Map.Entry<Long, Long> e : bankToCompany.entrySet()) {
			companyToBank.putIfAbsent(e.getValue(), e.getKey());
		}
		return companyToBank;
	}

	private ParDto toPar(ReconciliationPair p, BigDecimal amountGapThreshold, long pairAttachmentCount,
			long pairCommentCount) {
		BankTransaction b = p.getBankTransaction();
		CompanyTransaction c = p.getCompanyTransaction();
		return new ParDto(p.getId(), p.getMatchSource().name(), b.getId(), c.getId(), b.getAmount(), c.getAmount(),
				b.getTxDate(), c.getTxDate(), pairKind(b.getAmount(), c.getAmount(), amountGapThreshold),
				pairAttachmentCount, p.getClassification(), pairCommentCount);
	}

	private static String pairKind(BigDecimal bankAmount, BigDecimal companyAmount, BigDecimal amountGapThreshold) {
		if (bankAmount.signum() != 0 && companyAmount.signum() != 0
				&& bankAmount.signum() != companyAmount.signum()) {
			return "OPPOSITE_SIGN";
		}
		if (bankAmount.subtract(companyAmount).abs().compareTo(amountGapThreshold) > 0) {
			return "AMOUNT_GAP";
		}
		return "EXACT";
	}
}
