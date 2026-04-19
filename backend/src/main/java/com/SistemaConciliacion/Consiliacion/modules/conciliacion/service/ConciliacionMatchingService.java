package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ConciliacionRunResultDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.MatchSource;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationPair;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionAuditEventType;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionStatus;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.BankTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.CompanyTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationPairRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;

@Service
public class ConciliacionMatchingService {

	private static final BigDecimal MAX_AMOUNT_TOLERANCE = new BigDecimal("10000");

	private final ReconciliationSessionRepository sessionRepository;
	private final BankTransactionRepository bankTransactionRepository;
	private final CompanyTransactionRepository companyTransactionRepository;
	private final ReconciliationPairRepository reconciliationPairRepository;
	private final SessionAuditService sessionAuditService;

	public ConciliacionMatchingService(ReconciliationSessionRepository sessionRepository,
			BankTransactionRepository bankTransactionRepository,
			CompanyTransactionRepository companyTransactionRepository,
			ReconciliationPairRepository reconciliationPairRepository,
			SessionAuditService sessionAuditService) {
		this.sessionRepository = sessionRepository;
		this.bankTransactionRepository = bankTransactionRepository;
		this.companyTransactionRepository = companyTransactionRepository;
		this.reconciliationPairRepository = reconciliationPairRepository;
		this.sessionAuditService = sessionAuditService;
	}

	@Transactional
	public ConciliacionRunResultDto reconcile(long sessionId, int dateToleranceDays, BigDecimal amountTolerance) {
		if (dateToleranceDays < 0 || dateToleranceDays > 60) {
			throw new IllegalArgumentException("dateToleranceDays debe estar entre 0 y 60.");
		}
		BigDecimal tol = amountTolerance != null ? amountTolerance : BigDecimal.ZERO;
		if (tol.compareTo(BigDecimal.ZERO) < 0 || tol.compareTo(MAX_AMOUNT_TOLERANCE) > 0) {
			throw new IllegalArgumentException("amountTolerance debe estar entre 0 y 10000.");
		}
		tol = tol.setScale(4, RoundingMode.HALF_UP);

		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La sesión está cerrada; no se puede conciliar.");
		}

		reconciliationPairRepository.deleteBySession_IdAndMatchSource(sessionId, MatchSource.AUTO);

		List<ReconciliationPair> manualPairs = reconciliationPairRepository.findBySession_IdAndMatchSource(sessionId,
				MatchSource.MANUAL);

		Set<Long> usedBankIds = new HashSet<>();
		Set<Long> usedCompanyIds = new HashSet<>();
		for (ReconciliationPair mp : manualPairs) {
			usedBankIds.add(mp.getBankTransaction().getId());
			usedCompanyIds.add(mp.getCompanyTransaction().getId());
		}

		List<BankTransaction> banks = bankTransactionRepository.findBySession_IdOrderByTxDateAscIdAsc(sessionId);
		List<CompanyTransaction> companies = companyTransactionRepository
				.findBySession_IdOrderByTxDateAscIdAsc(sessionId);

		List<ReconciliationPair> newAutoPairs = new ArrayList<>();

		for (CompanyTransaction c : companies) {
			if (usedCompanyIds.contains(c.getId())) {
				continue;
			}
			BankTransaction bestBank = null;
			long bestDayDiff = Long.MAX_VALUE;
			long bestBankId = Long.MAX_VALUE;

			for (BankTransaction b : banks) {
				if (usedBankIds.contains(b.getId())) {
					continue;
				}
				if (!amountsMatch(c.getAmount(), b.getAmount(), tol)) {
					continue;
				}
				if (!datesWithinTolerance(c.getTxDate(), b.getTxDate(), dateToleranceDays)) {
					continue;
				}
				long dayDiff = Math.abs(ChronoUnit.DAYS.between(c.getTxDate(), b.getTxDate()));
				if (dayDiff < bestDayDiff || (dayDiff == bestDayDiff && b.getId() < bestBankId)) {
					bestDayDiff = dayDiff;
					bestBank = b;
					bestBankId = b.getId();
				}
			}

			if (bestBank != null) {
				ReconciliationPair p = new ReconciliationPair();
				p.setSession(session);
				p.setBankTransaction(bestBank);
				p.setCompanyTransaction(c);
				p.setMatchSource(MatchSource.AUTO);
				newAutoPairs.add(p);
				usedBankIds.add(bestBank.getId());
				usedCompanyIds.add(c.getId());
			}
		}

		reconciliationPairRepository.saveAll(newAutoPairs);
		session.setStatus(SessionStatus.RECONCILED);
		session.setAmountTolerance(tol);
		session.setDateToleranceDays(dateToleranceDays);
		sessionRepository.save(session);
		sessionAuditService.append(sessionId, SessionAuditEventType.RECONCILE, null);

		int autoCreated = newAutoPairs.size();
		long unmatchedBank = banks.size() - usedBankIds.size();
		long unmatchedCompany = companies.size() - usedCompanyIds.size();

		return new ConciliacionRunResultDto(sessionId, autoCreated, unmatchedBank, unmatchedCompany, dateToleranceDays,
				tol);
	}

	/** Mismo criterio de signo que el extracto y la plataforma (importes normalizados al importar). */
	private static boolean amountsMatch(BigDecimal companyAmount, BigDecimal bankAmount, BigDecimal tolerance) {
		return companyAmount.subtract(bankAmount).abs().compareTo(tolerance) <= 0;
	}

	private static boolean datesWithinTolerance(java.time.LocalDate a, java.time.LocalDate b, int toleranceDays) {
		long days = Math.abs(ChronoUnit.DAYS.between(a, b));
		return days <= toleranceDays;
	}
}
