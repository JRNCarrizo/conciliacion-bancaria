package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ClassificationUpdateDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.CreateReconciliationGroupRequestDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.CreateReconciliationGroupResponseDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.GroupDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.MatchSource;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PendingMovementSide;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationGroup;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationGroupBankMember;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationGroupCompanyMember;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionAuditEventType;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionStatus;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.BankTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.CompanyTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationGroupBankMemberRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationGroupCommentRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationGroupCompanyMemberRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationGroupRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;

@Service
public class ConciliacionGroupService {

	private final ReconciliationSessionRepository sessionRepository;
	private final BankTransactionRepository bankTransactionRepository;
	private final CompanyTransactionRepository companyTransactionRepository;
	private final ReconciliationGroupRepository groupRepository;
	private final ReconciliationGroupBankMemberRepository groupBankMemberRepository;
	private final ReconciliationGroupCompanyMemberRepository groupCompanyMemberRepository;
	private final MovementMatchService movementMatchService;
	private final SessionAuditService sessionAuditService;
	private final GroupAttachmentService groupAttachmentService;
	private final ReconciliationGroupCommentRepository reconciliationGroupCommentRepository;

	public ConciliacionGroupService(ReconciliationSessionRepository sessionRepository,
			BankTransactionRepository bankTransactionRepository,
			CompanyTransactionRepository companyTransactionRepository,
			ReconciliationGroupRepository groupRepository,
			ReconciliationGroupBankMemberRepository groupBankMemberRepository,
			ReconciliationGroupCompanyMemberRepository groupCompanyMemberRepository,
			MovementMatchService movementMatchService, SessionAuditService sessionAuditService,
			GroupAttachmentService groupAttachmentService,
			ReconciliationGroupCommentRepository reconciliationGroupCommentRepository) {
		this.sessionRepository = sessionRepository;
		this.bankTransactionRepository = bankTransactionRepository;
		this.companyTransactionRepository = companyTransactionRepository;
		this.groupRepository = groupRepository;
		this.groupBankMemberRepository = groupBankMemberRepository;
		this.groupCompanyMemberRepository = groupCompanyMemberRepository;
		this.movementMatchService = movementMatchService;
		this.sessionAuditService = sessionAuditService;
		this.groupAttachmentService = groupAttachmentService;
		this.reconciliationGroupCommentRepository = reconciliationGroupCommentRepository;
	}

	@Transactional(readOnly = true)
	public List<ReconciliationGroup> listGroupsWithMembers(long sessionId) {
		List<ReconciliationGroup> groups = groupRepository.findAllWithBankMembersBySessionId(sessionId);
		if (groups.isEmpty()) {
			return groups;
		}
		groupRepository.findAllWithCompanyMembersBySessionId(sessionId);
		for (ReconciliationGroup group : groups) {
			for (ReconciliationGroupCompanyMember member : group.getCompanyMembers()) {
				member.getCompanyTransaction().getId();
			}
		}
		return groups;
	}

	@Transactional
	public CreateReconciliationGroupResponseDto createGroup(long sessionId, CreateReconciliationGroupRequestDto req) {
		ReconciliationSession session = requireOpenSession(sessionId);
		List<Long> bankIds = distinctNonNull(req.bankTransactionIds());
		List<Long> companyIds = distinctNonNull(req.companyTransactionIds());
		if (bankIds.isEmpty() || companyIds.isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Indicá al menos un movimiento de banco y uno de empresa.");
		}

		ReconciliationGroup group = new ReconciliationGroup();
		group.setSession(session);
		group.setMatchSource(MatchSource.MANUAL);

		for (Long bankId : bankIds) {
			BankTransaction bank = bankTransactionRepository.findByIdAndSession_Id(bankId, sessionId)
					.orElseThrow(() -> new IllegalArgumentException(
							"Movimiento de banco no pertenece a esta sesión: " + bankId));
			movementMatchService.assertBankUnmatched(bank.getId());
			ReconciliationGroupBankMember member = new ReconciliationGroupBankMember();
			member.setGroup(group);
			member.setBankTransaction(bank);
			group.getBankMembers().add(member);
		}

		for (Long companyId : companyIds) {
			CompanyTransaction company = companyTransactionRepository.findByIdAndSession_Id(companyId, sessionId)
					.orElseThrow(() -> new IllegalArgumentException(
							"Movimiento de empresa no pertenece a esta sesión: " + companyId));
			movementMatchService.assertCompanyUnmatched(company.getId());
			ReconciliationGroupCompanyMember member = new ReconciliationGroupCompanyMember();
			member.setGroup(group);
			member.setCompanyTransaction(company);
			group.getCompanyMembers().add(member);
		}

		group = groupRepository.save(group);
		session.setStatus(SessionStatus.RECONCILED);
		sessionRepository.save(session);

		sessionAuditService.append(sessionId, SessionAuditEventType.CREATE_GROUP,
				String.format("Grupo %d · %d banco · %d empresa", group.getId(), bankIds.size(), companyIds.size()));

		return new CreateReconciliationGroupResponseDto(group.getId(), sessionId, MatchSource.MANUAL.name());
	}

	@Transactional
	public void putGroupClassification(long sessionId, long groupId, ClassificationUpdateDto body) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La conciliación está cerrada; la clasificación no se puede modificar.");
		}
		ReconciliationGroup group = groupRepository.findByIdAndSession_Id(groupId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Grupo no encontrado."));
		group.setClassification(normalizeClassification(body != null ? body.classification() : null));
		groupRepository.save(group);
	}

	@Transactional
	public void deleteGroup(long sessionId, long groupId) {
		requireOpenSession(sessionId);
		ReconciliationGroup group = groupRepository.findByIdAndSession_Id(groupId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Grupo no encontrado."));
		int bankCount = group.getBankMembers().size();
		int companyCount = group.getCompanyMembers().size();
		groupAttachmentService.deleteAllForGroups(sessionId, List.of(groupId));
		reconciliationGroupCommentRepository.deleteByGroup_Id(groupId);
		groupRepository.delete(group);
		sessionAuditService.append(sessionId, SessionAuditEventType.UNLINK_GROUP,
				String.format("Grupo %d · %d banco · %d empresa", groupId, bankCount, companyCount));
	}

	@Transactional
	public boolean unlinkGroupForMovementSilent(long sessionId, PendingMovementSide side, long txId) {
		Optional<ReconciliationGroup> groupOpt = findGroupByMovement(side, txId);
		if (groupOpt.isEmpty()) {
			return false;
		}
		ReconciliationGroup group = groupOpt.get();
		if (groupRepository.findByIdAndSession_Id(group.getId(), sessionId).isEmpty()) {
			return false;
		}
		groupAttachmentService.deleteAllForGroups(sessionId, List.of(group.getId()));
		reconciliationGroupCommentRepository.deleteByGroup_Id(group.getId());
		groupRepository.delete(group);
		return true;
	}

	private Optional<ReconciliationGroup> findGroupByMovement(PendingMovementSide side, long txId) {
		if (side == PendingMovementSide.BANK) {
			return groupBankMemberRepository.findByBankTransaction_Id(txId)
					.map(ReconciliationGroupBankMember::getGroup);
		}
		return groupCompanyMemberRepository.findByCompanyTransaction_Id(txId)
				.map(ReconciliationGroupCompanyMember::getGroup);
	}

	public GroupDto toDto(ReconciliationGroup group, BigDecimal amountGapThreshold, long groupCommentCount,
			long groupAttachmentCount) {
		List<Long> bankIds = group.getBankMembers().stream()
				.map(m -> m.getBankTransaction().getId())
				.sorted()
				.toList();
		List<Long> companyIds = group.getCompanyMembers().stream()
				.map(m -> m.getCompanyTransaction().getId())
				.sorted()
				.toList();
		BigDecimal bankSum = group.getBankMembers().stream()
				.map(m -> m.getBankTransaction().getAmount())
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		BigDecimal companySum = group.getCompanyMembers().stream()
				.map(m -> m.getCompanyTransaction().getAmount())
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		LocalDate bankMin = group.getBankMembers().stream()
				.map(m -> m.getBankTransaction().getTxDate())
				.min(Comparator.naturalOrder())
				.orElse(null);
		LocalDate companyMin = group.getCompanyMembers().stream()
				.map(m -> m.getCompanyTransaction().getTxDate())
				.min(Comparator.naturalOrder())
				.orElse(null);
		return new GroupDto(group.getId(), group.getMatchSource().name(), bankIds, companyIds, bankSum, companySum,
				bankMin, companyMin, pairKind(bankSum, companySum, amountGapThreshold), group.getClassification(),
				groupCommentCount, groupAttachmentCount);
	}

	static String pairKind(BigDecimal bankAmount, BigDecimal companyAmount, BigDecimal amountGapThreshold) {
		if (bankAmount.signum() != 0 && companyAmount.signum() != 0
				&& bankAmount.signum() != companyAmount.signum()) {
			return "OPPOSITE_SIGN";
		}
		if (bankAmount.subtract(companyAmount).abs().compareTo(amountGapThreshold) > 0) {
			return "AMOUNT_GAP";
		}
		return "EXACT";
	}

	private ReconciliationSession requireOpenSession(long sessionId) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La conciliación está cerrada; no se pueden modificar vínculos.");
		}
		return session;
	}

	private static List<Long> distinctNonNull(List<Long> ids) {
		if (ids == null || ids.isEmpty()) {
			return List.of();
		}
		Set<Long> seen = new HashSet<>();
		List<Long> out = new ArrayList<>();
		for (Long id : ids) {
			if (id != null && seen.add(id)) {
				out.add(id);
			}
		}
		return out;
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
}
