package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ManualPairResponseDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.MatchSource;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationPair;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionStatus;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.BankTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.CompanyTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationPairRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;

@Service
public class ConciliacionManualPairService {

	private final ReconciliationSessionRepository sessionRepository;
	private final BankTransactionRepository bankTransactionRepository;
	private final CompanyTransactionRepository companyTransactionRepository;
	private final ReconciliationPairRepository reconciliationPairRepository;

	public ConciliacionManualPairService(ReconciliationSessionRepository sessionRepository,
			BankTransactionRepository bankTransactionRepository,
			CompanyTransactionRepository companyTransactionRepository,
			ReconciliationPairRepository reconciliationPairRepository) {
		this.sessionRepository = sessionRepository;
		this.bankTransactionRepository = bankTransactionRepository;
		this.companyTransactionRepository = companyTransactionRepository;
		this.reconciliationPairRepository = reconciliationPairRepository;
	}

	@Transactional
	public ManualPairResponseDto createManualPair(long sessionId, long bankTransactionId, long companyTransactionId) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La sesión está cerrada; no se pueden crear pares.");
		}

		BankTransaction bank = bankTransactionRepository.findByIdAndSession_Id(bankTransactionId, sessionId)
				.orElseThrow(() -> new IllegalArgumentException("Movimiento de banco no pertenece a esta sesión."));
		CompanyTransaction company = companyTransactionRepository.findByIdAndSession_Id(companyTransactionId, sessionId)
				.orElseThrow(() -> new IllegalArgumentException("Movimiento de empresa no pertenece a esta sesión."));

		if (reconciliationPairRepository.existsByBankTransaction_Id(bank.getId())) {
			throw new IllegalArgumentException("Ese movimiento de banco ya está vinculado.");
		}
		if (reconciliationPairRepository.existsByCompanyTransaction_Id(company.getId())) {
			throw new IllegalArgumentException("Ese movimiento de empresa ya está vinculado.");
		}

		ReconciliationPair p = new ReconciliationPair();
		p.setSession(session);
		p.setBankTransaction(bank);
		p.setCompanyTransaction(company);
		p.setMatchSource(MatchSource.MANUAL);
		p = reconciliationPairRepository.save(p);

		session.setStatus(SessionStatus.RECONCILED);
		sessionRepository.save(session);

		return new ManualPairResponseDto(p.getId(), sessionId, MatchSource.MANUAL.name());
	}

	@Transactional
	public void deleteManualPair(long sessionId, long pairId) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La sesión está cerrada; no se pueden quitar pares.");
		}
		ReconciliationPair p = reconciliationPairRepository.findByIdAndSession_Id(pairId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Par no encontrado."));
		if (p.getMatchSource() != MatchSource.MANUAL) {
			throw new IllegalArgumentException("Solo se pueden eliminar vínculos manuales.");
		}
		reconciliationPairRepository.delete(p);
	}
}
